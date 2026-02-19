-- Add voice_provider column to phone_numbers table
-- Allows per-number routing between Vapi and self-hosted voice server

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phone_numbers' AND column_name = 'voice_provider'
  ) THEN
    ALTER TABLE phone_numbers
      ADD COLUMN voice_provider TEXT NOT NULL DEFAULT 'vapi'
      CHECK (voice_provider IN ('vapi', 'self_hosted'));
  END IF;
END $$;

-- Partial index so queries filtering on voice_provider = 'self_hosted' can skip vapi rows
CREATE INDEX IF NOT EXISTS idx_phone_numbers_voice_provider ON phone_numbers(voice_provider)
  WHERE voice_provider = 'self_hosted';
