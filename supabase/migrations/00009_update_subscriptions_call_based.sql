-- Migration: Update subscriptions table for call-based pricing model
-- This migration converts the subscriptions table from minute-based to call-based pricing

-- Add new columns for call-based pricing
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS plan TEXT,
ADD COLUMN IF NOT EXISTS calls_limit INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS calls_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS assistants_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS phone_numbers_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Migrate data from old columns to new columns
UPDATE subscriptions SET plan = plan_type::TEXT WHERE plan IS NULL;

-- Convert included_minutes to calls_limit (rough conversion: 1 call ~ 5 minutes average)
UPDATE subscriptions
SET calls_limit = CASE
  WHEN included_minutes >= 5000 THEN -1  -- Unlimited for high-minute plans
  WHEN included_minutes >= 2000 THEN 250
  WHEN included_minutes >= 500 THEN 100
  ELSE 50
END
WHERE calls_limit = 100;

-- Create index for stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- Update plan_type enum to include new SMB plans if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'starter' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'plan_type')) THEN
    ALTER TYPE plan_type ADD VALUE 'starter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'professional' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'plan_type')) THEN
    ALTER TYPE plan_type ADD VALUE 'professional';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'growth' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'plan_type')) THEN
    ALTER TYPE plan_type ADD VALUE 'growth';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN subscriptions.plan IS 'Current subscription plan: starter, professional, growth';
COMMENT ON COLUMN subscriptions.calls_limit IS 'Monthly call limit. -1 = unlimited';
COMMENT ON COLUMN subscriptions.calls_used IS 'Calls used in current billing period';
COMMENT ON COLUMN subscriptions.assistants_limit IS 'Maximum number of AI assistants allowed';
COMMENT ON COLUMN subscriptions.phone_numbers_limit IS 'Maximum number of phone numbers allowed';
COMMENT ON COLUMN subscriptions.trial_end IS 'End date of trial period, if applicable';
