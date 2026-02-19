-- Add voice_provider column to phone_numbers table
-- Allows per-number routing between Vapi and self-hosted voice server
ALTER TABLE phone_numbers
  ADD COLUMN voice_provider TEXT NOT NULL DEFAULT 'vapi'
  CHECK (voice_provider IN ('vapi', 'self_hosted'));

-- Index for the voice server's lookup query:
-- SELECT ... FROM phone_numbers WHERE phone_number = $1 AND voice_provider = 'self_hosted'
CREATE INDEX idx_phone_numbers_voice_provider ON phone_numbers(voice_provider)
  WHERE voice_provider = 'self_hosted';
