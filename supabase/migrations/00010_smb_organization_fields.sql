-- Migration: Add SMB-specific fields to organizations table
-- This simplifies the organization model for single-business users

-- Add business-specific columns for SMB users
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"monday": {"open": "09:00", "close": "17:00"}, "tuesday": {"open": "09:00", "close": "17:00"}, "wednesday": {"open": "09:00", "close": "17:00"}, "thursday": {"open": "09:00", "close": "17:00"}, "friday": {"open": "09:00", "close": "17:00"}, "saturday": null, "sunday": null}'::jsonb;

-- Add notification preferences
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS notification_email TEXT,
ADD COLUMN IF NOT EXISTS notification_phone TEXT,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "missedCalls": true, "voicemails": true, "appointments": true}'::jsonb;

-- Copy name to business_name for existing organizations
UPDATE organizations SET business_name = name WHERE business_name IS NULL;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations(industry);

-- Add comments for documentation
COMMENT ON COLUMN organizations.business_name IS 'Display name for the business (user-friendly)';
COMMENT ON COLUMN organizations.industry IS 'Business industry: dental, legal, home_services, medical, real_estate, other';
COMMENT ON COLUMN organizations.website_url IS 'Business website URL for knowledge base scraping';
COMMENT ON COLUMN organizations.phone IS 'Main business phone number';
COMMENT ON COLUMN organizations.address IS 'Business address';
COMMENT ON COLUMN organizations.timezone IS 'Business timezone for scheduling';
COMMENT ON COLUMN organizations.business_hours IS 'Operating hours as JSON: {"monday": {"open": "09:00", "close": "17:00"}, ...}';
COMMENT ON COLUMN organizations.notification_email IS 'Email address for notifications';
COMMENT ON COLUMN organizations.notification_phone IS 'Phone number for SMS notifications';
COMMENT ON COLUMN organizations.notification_preferences IS 'Notification settings as JSON';
