const WebSocket = require("ws");

/**
 * Opens a real-time Deepgram STT WebSocket.
 * Accepts raw mulaw 8kHz audio — no conversion needed from Twilio.
 *
 * @param {string} apiKey
 * @param {{ onTranscript: (data: { transcript: string, isFinal: boolean }) => void, onError: (err: Error) => void }} callbacks
 * @returns {WebSocket}
 */
function openDeepgramStream(apiKey, { onTranscript, onError }) {
  const url =
    "wss://api.deepgram.com/v1/listen?" +
    "encoding=mulaw&sample_rate=8000&channels=1" +
    "&model=nova-2" +
    "&punctuate=true" +
    "&interim_results=true" +
    "&endpointing=300" +
    "&utterance_end_ms=1000";

  const ws = new WebSocket(url, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  ws.on("open", () => {
    console.log("[STT] Deepgram WebSocket connected");
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "Results" && msg.channel) {
        const alt = msg.channel.alternatives[0];
        if (alt && alt.transcript) {
          onTranscript({
            transcript: alt.transcript,
            isFinal: msg.is_final,
          });
        }
      }
    } catch (err) {
      onError(err);
    }
  });

  ws.on("error", (err) => {
    console.error("[STT] Deepgram WebSocket error:", err.message);
    onError(err);
  });

  ws.on("close", (code, reason) => {
    console.log(`[STT] Deepgram WebSocket closed: ${code} ${reason}`);
  });

  return ws;
}

module.exports = { openDeepgramStream };
