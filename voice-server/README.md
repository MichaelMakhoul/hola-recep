# Self-Hosted Voice AI Server

Production voice AI pipeline: Twilio Media Streams + Deepgram STT/TTS + Groq LLM + Supabase.

**Cost**: ~$0.076/call vs Vapi's ~$0.39/call (80% reduction).

## Architecture

```
Caller → Twilio → POST /twiml → <Connect><Stream>
                → wss:// bidirectional WebSocket
                → server.js
                    ├─ Load assistant/org/KB from Supabase (by phone number)
                    ├─ Build system prompt (guided or legacy)
                    ├─ Twilio audio → Deepgram STT (mulaw passthrough)
                    ├─ STT transcript → Groq Llama 3.3 70B → Deepgram TTS
                    ├─ TTS audio → Twilio (mulaw passthrough, 160-byte chunks)
                    └─ On call end:
                        ├─ Save call record + transcript to Supabase
                        ├─ Increment billing usage
                        └─ POST to Next.js app for notifications/webhooks
```

Zero audio format conversion — Twilio's mulaw 8kHz passes directly to/from Deepgram.

## Setup

### 1. Get API Keys

- **Deepgram**: Sign up at [console.deepgram.com](https://console.deepgram.com) (free $200 credit)
- **Groq**: Sign up at [console.groq.com](https://console.groq.com) (free tier: 6K req/day)
- **Twilio**: Use existing account credentials
- **Supabase**: Use project service role key

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in all values — see .env.example for descriptions
```

### 3. Database Setup

Set the phone number's `voice_provider` to `'self_hosted'` in the `phone_numbers` table:

```sql
UPDATE phone_numbers SET voice_provider = 'self_hosted' WHERE phone_number = '+1234567890';
```

### 4. Start the Server

```bash
npm install
npm start        # or: npm run dev (auto-restart on changes)
```

### 5. Local Development (ngrok)

```bash
ngrok http 3001
```

Copy the HTTPS URL → set as `PUBLIC_URL` in `.env` → restart the server.

### 6. Configure Twilio

1. Go to Twilio Console → Phone Numbers → your number
2. Set **Voice webhook** to `POST https://<your-url>/twiml`
3. Call the number

## Deployment (Fly.io)

```bash
cd voice-server
fly launch          # first time
fly secrets set DEEPGRAM_API_KEY=... GROQ_API_KEY=... # etc.
fly deploy
```

## Expected Latency

| Stage | Time |
|---|---|
| Deepgram endpointing | ~300ms |
| Groq Llama 3.3 70B | ~400-600ms |
| Deepgram Aura TTS | ~300-500ms |
| **Total** | **~1.1-1.5s** |

## Coexistence with Vapi

Phone numbers route to either Vapi or self-hosted based on the `voice_provider` column:
- `'vapi'` (default) — Twilio webhook points to Vapi
- `'self_hosted'` — Twilio webhook points to this server's `/twiml` endpoint

Both can run simultaneously on different phone numbers within the same organization.
