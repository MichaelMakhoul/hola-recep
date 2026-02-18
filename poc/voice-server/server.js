require("dotenv").config();

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

// Validate required env vars
for (const key of ["DEEPGRAM_API_KEY", "GROQ_API_KEY", "PUBLIC_URL"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.use(express.urlencoded({ extended: false }));

// TwiML endpoint — tells Twilio to connect a bidirectional media stream
app.post("/twiml", (req, res) => {
  const wsUrl = PUBLIC_URL.replace(/^http/, "ws") + "/ws/audio";
  console.log(`[TwiML] Incoming call, streaming to ${wsUrl}`);

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
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

  twilioWs.on("message", async (raw) => {
    const msg = JSON.parse(raw);

    switch (msg.event) {
      case "connected":
        console.log("[Twilio] WebSocket connected");
        break;

      case "start": {
        const { callSid, streamSid } = msg.start;
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
            console.error("[STT] Error:", err.message);
          },
        });

        // Send greeting after STT is ready
        await sendTTS(session, twilioWs, "Hello! Thanks for calling. How can I help you today?");
        break;
      }

      case "media": {
        if (!session || !session.deepgramWs) break;
        // Forward raw mulaw audio to Deepgram (no conversion needed)
        const audio = Buffer.from(msg.media.payload, "base64");
        if (session.deepgramWs.readyState === WebSocket.OPEN) {
          session.deepgramWs.send(audio);
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
        if (session) {
          console.log(`[Twilio] Stream stopped — callSid=${session.callSid}`);
          sessions.delete(session.streamSid);
          session.destroy();
          session = null;
        }
        break;
      }
    }
  });

  twilioWs.on("close", () => {
    if (session) {
      sessions.delete(session.streamSid);
      session.destroy();
      session = null;
    }
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
    console.error("[Pipeline] Error:", err.message);
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
  console.log(`WebSocket endpoint: ${PUBLIC_URL.replace(/^http/, "ws")}/ws/audio`);
});
