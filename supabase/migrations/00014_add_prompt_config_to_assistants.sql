-- Add settings and prompt_config columns to assistants table
-- settings: general assistant settings (maxCallDuration, spamFilterEnabled, etc.)
-- prompt_config: structured config from the guided prompt builder (nullable for legacy assistants)

ALTER TABLE assistants
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS prompt_config JSONB;
