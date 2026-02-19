require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const { CallSession } = require("./call-session");
const { openDeepgramStream } = require("./services/deepgram-stt");
const { getChatResponse } = require("./services/groq-llm");
const { synthesizeSpeech, chunkAudioForTwilio } = require("./services/deepgram-tts");
const { loadCallContext } = require("./lib/call-context");
const { buildSystemPrompt, getGreeting } = require("./lib/prompt-builder");
const { createCallRecord, completeCallRecord, incrementUsage, notifyCallCompleted } = require("./lib/call-logger");
const { getSupabase } = require("./lib/supabase");

const PORT = process.env.PORT || 3001;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL;
const WS_SECRET = process.env.TWILIO_AUTH_TOKEN;
const WS_URL = PUBLIC_URL.replace(/^http/, "ws") + "/ws/audio";
const INTERNAL_API_URL = process.env.INTERNAL_API_URL;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Validate required env vars
const REQUIRED_ENV = [
  "DEEPGRAM_API_KEY",
  "GROQ_API_KEY",
  "PUBLIC_URL",
  "TWILIO_AUTH_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

if (!INTERNAL_API_URL || !INTERNAL_API_SECRET) {
  console.warn("[Startup] INTERNAL_API_URL or INTERNAL_API_SECRET not set — post-call notifications will be skipped");
}

// Global error handlers to prevent silent crashes
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

// Escape XML attribute values to prevent TwiML injection
function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Validate Twilio request signature.
 * Twilio signs every webhook request with HMAC-SHA1 using the Auth Token.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(req) {
  const signature = req.headers["x-twilio-signature"];
  if (!signature) return false;

  // Build the full URL Twilio used to generate the signature
  const url = PUBLIC_URL + req.originalUrl;

  // Sort POST params alphabetically and concatenate key+value
  const params = req.body || {};
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => k + params[k]).join("");

  const expected = crypto
    .createHmac("sha1", WS_SECRET)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// Pending tokens: issued at /twiml, consumed at WebSocket start. Expire after 30s.
// Stores { issuedAt, calledNumber, callerPhone } so the WebSocket handler uses
// server-side values instead of trusting client-provided parameters.
const pendingTokens = new Map();
const TOKEN_TTL_MS = 30_000;

function issueStreamToken(calledNumber, callerPhone) {
  const ts = Date.now().toString();
  const hmac = crypto.createHmac("sha256", WS_SECRET).update(ts).digest("hex");
  const token = `${ts}.${hmac}`;
  pendingTokens.set(token, { issuedAt: Date.now(), calledNumber, callerPhone });
  return token;
}

/**
 * Verify and consume a stream token. Returns the stored call metadata
 * (calledNumber, callerPhone) or null if invalid/expired.
 */
function consumeStreamToken(token) {
  try {
    if (!pendingTokens.has(token)) return null;
    const entry = pendingTokens.get(token);
    pendingTokens.delete(token); // single-use
    if (Date.now() - entry.issuedAt > TOKEN_TTL_MS) return null;
    const [ts, hmac] = token.split(".");
    if (!ts || !hmac) return null;
    const expected = crypto.createHmac("sha256", WS_SECRET).update(ts).digest("hex");
    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expected);
    if (hmacBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) return null;
    return { calledNumber: entry.calledNumber, callerPhone: entry.callerPhone };
  } catch (err) {
    console.error("[Auth] Token verification error:", err);
    return null;
  }
}

// Clean up expired tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pendingTokens) {
    if (now - entry.issuedAt > TOKEN_TTL_MS) pendingTokens.delete(token);
  }
}, 60_000).unref();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// TwiML endpoint — tells Twilio to connect a bidirectional media stream.
// Validates the Twilio request signature, then stores call metadata server-side
// with the token (never sent back in the XML response to prevent spoofing).
app.post("/twiml", (req, res) => {
  if (!validateTwilioSignature(req)) {
    console.warn("[TwiML] Rejected request — invalid Twilio signature");
    return res.status(403).send("Forbidden");
  }

  const called = req.body.Called || "";
  const from = req.body.From || "";
  // Store call metadata server-side with the token — NOT in the TwiML response
  const token = issueStreamToken(called, from);
  console.log(`[TwiML] Incoming call from=${from} to=${called}, streaming to ${WS_URL}`);

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(WS_URL)}">
      <Parameter name="auth_token" value="${escapeXml(token)}" />
    </Stream>
  </Connect>
</Response>`);
});

// Health check with Supabase connectivity test
app.get("/health", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) throw error;
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "degraded", db: "error", message: err.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/audio" });

// Active sessions keyed by streamSid
const sessions = new Map();

wss.on("connection", (twilioWs) => {
  let session = null;

  async function cleanupSession() {
    if (!session) return;
    const s = session;
    session = null;
    sessions.delete(s.streamSid);

    // Post-call processing
    if (s.callRecordId) {
      const transcript = s.getTranscript();
      const durationSeconds = s.getDurationSeconds();

      try {
        await completeCallRecord(s.callRecordId, {
          status: "completed",
          durationSeconds,
          transcript,
        });
      } catch (err) {
        console.error("[Cleanup] Failed to complete call record:", err);
      }

      // Increment billing usage
      if (s.organizationId) {
        incrementUsage(s.organizationId).catch((err) =>
          console.error("[Cleanup] Failed to increment usage:", err)
        );
      }

      // Notify the Next.js app for spam analysis, notifications, webhooks (fire-and-forget)
      if (INTERNAL_API_URL && INTERNAL_API_SECRET && s.organizationId) {
        notifyCallCompleted(INTERNAL_API_URL, INTERNAL_API_SECRET, {
          callId: s.callRecordId,
          organizationId: s.organizationId,
          assistantId: s.assistantId,
          callerPhone: s.callerPhone,
          status: "completed",
          durationSeconds,
          transcript,
          endedReason: "caller-hangup",
        }).catch((err) =>
          console.error("[Cleanup] Failed to notify call completed:", err)
        );
      }
    }

    s.destroy();
  }

  twilioWs.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      console.warn("[Twilio] Received non-JSON message, ignoring");
      return;
    }

    try {
      switch (msg.event) {
        case "connected":
          console.log("[Twilio] WebSocket connected");
          break;

        case "start": {
          const { callSid, streamSid, customParameters } = msg.start;
          const token = customParameters?.auth_token;
          // Consume the token and retrieve the server-side call metadata
          // (calledNumber + callerPhone stored at /twiml time, NOT from client params)
          const tokenData = token ? consumeStreamToken(token) : null;
          if (!tokenData) {
            console.warn(`[Auth] Rejected WebSocket — invalid or missing token (callSid=${callSid})`);
            twilioWs.close();
            return;
          }

          const { calledNumber, callerPhone } = tokenData;

          session = new CallSession(callSid);
          session.streamSid = streamSid;
          session.callerPhone = callerPhone;
          sessions.set(streamSid, session);
          console.log(`[Twilio] Stream started — callSid=${callSid} streamSid=${streamSid} called=${calledNumber} from=${callerPhone}`);

          // Load call context from database
          let context = null;
          if (calledNumber) {
            try {
              context = await loadCallContext(calledNumber);
            } catch (err) {
              console.error("[Context] Failed to load call context:", err);
            }
          }

          if (!context) {
            console.warn(`[Context] No context found for ${calledNumber} — sending fallback and closing`);
            try {
              await sendTTS(session, twilioWs, "Sorry, this number is not currently configured. Please try again later.");
            } catch (e) { /* best effort */ }
            twilioWs.close();
            return;
          }

          // Store context on session
          session.organizationId = context.organizationId;
          session.assistantId = context.assistantId;
          session.phoneNumberId = context.phoneNumberId;
          session.model = context.assistant.settings?.model || null;

          // Build system prompt (guided or legacy)
          const systemPrompt = buildSystemPrompt(
            context.assistant,
            context.organization,
            context.knowledgeBase
          );
          session.setSystemPrompt(systemPrompt);

          // Create call record in database
          try {
            const callRecordId = await createCallRecord({
              orgId: context.organizationId,
              assistantId: context.assistantId,
              phoneNumberId: context.phoneNumberId,
              callerPhone,
              callSid,
            });
            session.callRecordId = callRecordId;
          } catch (err) {
            console.error("[DB] Failed to create call record:", err);
            // Non-fatal — continue handling the call
          }

          // Open Deepgram STT WebSocket
          session.deepgramWs = openDeepgramStream(DEEPGRAM_API_KEY, {
            onTranscript: ({ transcript, isFinal }) => {
              if (!isFinal) return;
              console.log(`[STT] Final: "${transcript}"`);
              handleUserSpeech(session, twilioWs, transcript);
            },
            onError: (err) => {
              console.error("[STT] Error:", err);
              sendTTS(session, twilioWs, "I'm sorry, I'm experiencing technical difficulties. Please try calling again.").catch(() => {});
            },
            onClose: (code) => {
              if (code !== 1000 && code !== 1005 && session) {
                console.error(`[STT] Connection lost during active call (callSid=${session.callSid})`);
              }
            },
          });

          // Send greeting
          const greeting = getGreeting(context.assistant, context.organization.name);
          try {
            await sendTTS(session, twilioWs, greeting);
            session.addMessage("assistant", greeting);
          } catch (err) {
            console.error("[TTS] Failed to send greeting:", err);
          }
          break;
        }

        case "media": {
          if (!session || !session.deepgramWs) break;
          // Forward raw mulaw audio to Deepgram (no conversion needed)
          const audio = Buffer.from(msg.media.payload, "base64");
          if (session.deepgramWs.readyState === WebSocket.OPEN) {
            session.deepgramWs.send(audio);
          } else if (!session._sttDropWarned) {
            console.warn(`[STT] Dropping audio — Deepgram WebSocket not open (state=${session.deepgramWs.readyState}, callSid=${session.callSid})`);
            session._sttDropWarned = true;
          }
          break;
        }

        case "mark": {
          // TTS playback finished for a marked chunk
          if (session && msg.mark && msg.mark.name === "tts-done") {
            session.isSpeaking = false;
          }
          break;
        }

        case "stop": {
          console.log(`[Twilio] Stream stopped — callSid=${session?.callSid}`);
          await cleanupSession();
          break;
        }
      }
    } catch (err) {
      console.error(`[Twilio] Error handling event="${msg.event}" callSid=${session?.callSid}:`, err);
    }
  });

  twilioWs.on("error", (err) => {
    console.error(`[Twilio] WebSocket error (callSid=${session?.callSid}):`, err);
  });

  twilioWs.on("close", () => {
    cleanupSession();
  });
});

/**
 * Handle final user transcript: get LLM response, synthesize, send back.
 */
async function handleUserSpeech(session, twilioWs, transcript) {
  if (session.isProcessing) return;
  session.isProcessing = true;

  // Barge-in: if assistant is speaking, clear Twilio's audio buffer
  if (session.isSpeaking) {
    sendClear(session, twilioWs);
    session.isSpeaking = false;
  }

  try {
    session.addMessage("user", transcript);

    const t0 = Date.now();
    const reply = await getChatResponse(GROQ_API_KEY, session.messages, {
      model: session.model,
    });
    console.log(`[LLM] (${Date.now() - t0}ms) "${reply}"`);

    session.addMessage("assistant", reply);
    await sendTTS(session, twilioWs, reply);
  } catch (err) {
    console.error("[Pipeline] Error:", err);
    // Remove the user message that never got a reply
    if (session.messages.length > 0 && session.messages[session.messages.length - 1].role === "user") {
      session.messages.pop();
    }
    try {
      await sendTTS(session, twilioWs, "I'm sorry, I'm having a little trouble right now. Could you repeat that?");
    } catch (ttsErr) {
      console.error("[Pipeline] Failed to send error message to caller:", ttsErr);
    }
  } finally {
    session.isProcessing = false;
  }
}

/**
 * Synthesize text and stream mulaw chunks back to Twilio.
 */
async function sendTTS(session, twilioWs, text) {
  const t0 = Date.now();
  const audioBuffer = await synthesizeSpeech(DEEPGRAM_API_KEY, text);
  console.log(`[TTS] (${Date.now() - t0}ms) ${audioBuffer.length} bytes`);

  const chunks = chunkAudioForTwilio(audioBuffer);
  session.isSpeaking = true;

  for (const chunk of chunks) {
    if (twilioWs.readyState !== WebSocket.OPEN) break;
    twilioWs.send(
      JSON.stringify({
        event: "media",
        streamSid: session.streamSid,
        media: { payload: chunk },
      })
    );
  }

  // Mark end of TTS so we know when playback completes
  if (twilioWs.readyState === WebSocket.OPEN) {
    twilioWs.send(
      JSON.stringify({
        event: "mark",
        streamSid: session.streamSid,
        mark: { name: "tts-done" },
      })
    );
  }
}

/**
 * Send clear event to flush Twilio's audio buffer (barge-in).
 */
function sendClear(session, twilioWs) {
  if (twilioWs.readyState !== WebSocket.OPEN) return;
  twilioWs.send(
    JSON.stringify({
      event: "clear",
      streamSid: session.streamSid,
    })
  );
  console.log("[Barge-in] Cleared Twilio audio buffer");
}

server.listen(PORT, () => {
  console.log(`Voice server listening on port ${PORT}`);
  console.log(`TwiML endpoint: ${PUBLIC_URL}/twiml`);
  console.log(`WebSocket endpoint: ${WS_URL}`);
});
