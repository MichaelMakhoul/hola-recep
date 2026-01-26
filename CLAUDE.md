# Hola Recep - Development Notes

## Project Overview
AI Receptionist SaaS platform built with Next.js 15, Supabase, Vapi, and Stripe.

## TODOs

### Vapi Structured Outputs
- [ ] Configure structured outputs in Vapi for call analytics:
  - **Call Summary** - Auto-generate concise summaries of each call
  - **Success Evaluation** - Rate call success (pass/fail or numeric scale)
  - **Customer Details** - Extract caller name, phone, reason for calling
  - **Appointment Requests** - Capture scheduling intent
- Reference: Vapi Dashboard → Assistants → [Assistant] → Publish → Configure Structured Output

## Environment Variables Required
See `.env.example` for full list. Key ones:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `VAPI_API_KEY` / `VAPI_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` (used for webhook URL in assistant creation)
- `ENCRYPTION_KEY` (for sensitive data encryption)

## Key Integrations
- **Vapi** - Voice AI platform for call handling
- **Supabase** - Database, auth, real-time
- **Stripe** - Billing and subscriptions
- **ElevenLabs** - Voice preview/TTS
- **Cal.com** - Calendar booking

## Recent Fixes
- Voice provider format: use `11labs` not `elevenlabs`
- Assistant creation now includes `server` config for webhooks
- Rate limiting added to expensive endpoints
