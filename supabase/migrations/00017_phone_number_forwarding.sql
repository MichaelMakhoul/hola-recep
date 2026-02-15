ALTER TABLE phone_numbers
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'purchased'
    CHECK (source_type IN ('purchased', 'forwarded')),
  ADD COLUMN user_phone_number TEXT,
  ADD COLUMN forwarding_status TEXT DEFAULT NULL
    CHECK (forwarding_status IN ('pending_setup', 'active', 'paused') OR forwarding_status IS NULL),
  ADD COLUMN carrier TEXT DEFAULT NULL;

-- Forwarded numbers must have a user phone number
ALTER TABLE phone_numbers
  ADD CONSTRAINT chk_forwarded_has_user_phone
    CHECK (source_type != 'forwarded' OR user_phone_number IS NOT NULL);

CREATE INDEX idx_phone_numbers_user_phone ON phone_numbers(user_phone_number)
  WHERE user_phone_number IS NOT NULL;
