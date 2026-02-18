# Self-Hosted Voice AI PoC

Minimal voice AI pipeline: Twilio Media Streams + Deepgram STT/TTS + Groq LLM.

**Cost**: ~$0.076/call vs Vapi's ~$0.39/call (80% reduction).

## Architecture

```
Caller → Twilio → POST /twiml → <Connect><Stream>
                → wss:// bidirectional WebSocket
                → server.js
                    ├─ Twilio audio → Deepgram STT (mulaw passthrough)
                    ├─ STT transcript → Groq Llama 3.3 70B → Deepgram TTS
                    └─ TTS audio → Twilio (mulaw passthrough, 160-byte chunks)
```

Zero audio format conversion — Twilio's mulaw 8kHz passes directly to/from Deepgram.

## Setup

### 1. Get API Keys

- **Deepgram**: Sign up at [console.deepgram.com](https://console.deepgram.com) (free $200 credit)
- **Groq**: Sign up at [console.groq.com](https://console.groq.com) (free tier: 6K req/day)
- **Twilio**: Use existing account credentials

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in: DEEPGRAM_API_KEY, GROQ_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
```

### 3. Start the Server

```bash
npm install
npm start        # or: npm run dev (auto-restart on changes)
```

### 4. Expose with ngrok

```bash
ngrok http 3001
```

Copy the HTTPS URL and set it as `PUBLIC_URL` in `.env`, then restart the server.

### 5. Configure Twilio

1. Go to Twilio Console → Phone Numbers → your number
2. Set **Voice webhook** to `POST https://<ngrok-url>/twiml`
3. Call the number

## Testing

1. Call your Twilio number
2. You should hear "Hello! Thanks for calling. How can I help you today?"
3. Have a conversation — latency should be ~1.1-1.5s per turn
4. Compare quality/latency against a Vapi call with the same questions

## Expected Latency

| Stage | Time |
|---|---|
| Deepgram endpointing | ~300ms |
| Groq Llama 3.3 70B | ~400-600ms |
| Deepgram Aura TTS | ~300-500ms |
| **Total** | **~1.1-1.5s** |
