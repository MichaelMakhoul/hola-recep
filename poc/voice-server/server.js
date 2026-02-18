require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const { CallSession } = require("./call-session");
const { openDeepgramStream } = require("./services/deepgram-stt");
const { getChatResponse } = require("./services/groq-llm");
const { synthesizeSpeech, chunkAudioForTwilio } = require("./services/deepgram-tts");

const PORT = process.env.PORT || 3001;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL;
const WS_SECRET = process.env.TWILIO_AUTH_TOKEN;
const WS_URL = PUBLIC_URL.replace(/^http/, "ws") + "/ws/audio";

// Validate required env vars
for (const key of ["DEEPGRAM_API_KEY", "GROQ_API_KEY", "PUBLIC_URL", "TWILIO_AUTH_TOKEN"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

// Global error handlers to prevent silent crashes
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

// Pending tokens: issued at /twiml, consumed at WebSocket start. Expire after 30s.
const pendingTokens = new Map();
const TOKEN_TTL_MS = 30_000;

function issueStreamToken() {
  const ts = Date.now().toString();
  const hmac = crypto.createHmac("sha256", WS_SECRET).update(ts).digest("hex");
  const token = `${ts}.${hmac}`;
  pendingTokens.set(token, Date.now());
  return token;
}

function verifyStreamToken(token) {
  try {
    if (!pendingTokens.has(token)) return false;
    const issuedAt = pendingTokens.get(token);
    pendingTokens.delete(token); // single-use
    if (Date.now() - issuedAt > TOKEN_TTL_MS) return false;
    const [ts, hmac] = token.split(".");
    if (!ts || !hmac) return false;
    const expected = crypto.createHmac("sha256", WS_SECRET).update(ts).digest("hex");
    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expected);
    if (hmacBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(hmacBuf, expectedBuf);
  } catch (err) {
    console.error("[Auth] Token verification error:", err);
    return false;
  }
}

// Clean up expired tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [token, issuedAt] of pendingTokens) {
    if (now - issuedAt > TOKEN_TTL_MS) pendingTokens.delete(token);
  }
}, 60_000).unref();

const app = express();
app.use(express.urlencoded({ extended: false }));

// TwiML endpoint — tells Twilio to connect a bidirectional media stream
app.post("/twiml", (req, res) => {
  const token = issueStreamToken();
  console.log(`[TwiML] Incoming call, streaming to ${WS_URL}`);

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${WS_URL}">
      <Parameter name="auth_token" value="${token}" />
    </Stream>
  </Connect>
</Response>`);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/audio" });

// Active sessions keyed by streamSid
const sessions = new Map();

wss.on("connection", (twilioWs) => {
  let session = null;

  function cleanupSession() {
    if (session) {
      sessions.delete(session.streamSid);
      session.destroy();
      session = null;
    }
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
          if (!token || !verifyStreamToken(token)) {
            console.warn(`[Auth] Rejected WebSocket — invalid or missing token (callSid=${callSid})`);
            twilioWs.close();
            return;
          }

          session = new CallSession(callSid);
          session.streamSid = streamSid;
          sessions.set(streamSid, session);
          console.log(`[Twilio] Stream started — callSid=${callSid} streamSid=${streamSid}`);

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
          const greeting = "Hello! Thanks for calling. How can I help you today?";
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
          cleanupSession();
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
    const reply = await getChatResponse(GROQ_API_KEY, session.messages);
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
