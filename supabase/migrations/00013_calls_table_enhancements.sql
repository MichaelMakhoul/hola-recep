-- Migration: Add missing fields to calls table for spam detection and call tracking
-- These fields are required by the spam detector and call analytics features

-- Add spam detection fields
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS spam_score INTEGER;

-- Add call outcome tracking
ALTER TABLE calls ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('answered', 'voicemail', 'transferred', 'spam', 'abandoned', 'failed'));
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_name TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS action_taken TEXT; -- e.g., 'appointment_booked', 'message_taken', 'transferred', 'info_provided'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT false;

-- Create indexes for spam filtering and outcome queries
CREATE INDEX IF NOT EXISTS idx_calls_is_spam ON calls(is_spam) WHERE is_spam = true;
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);
CREATE INDEX IF NOT EXISTS idx_calls_follow_up ON calls(follow_up_required) WHERE follow_up_required = true;

-- Update the sentiment column to use enum-like constraint if not already constrained
-- (This is a no-op if the constraint already exists, but ensures consistency)
DO $$
BEGIN
    -- Check if constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'calls_sentiment_check'
    ) THEN
        ALTER TABLE calls ADD CONSTRAINT calls_sentiment_check
            CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative'));
    END IF;
END $$;
