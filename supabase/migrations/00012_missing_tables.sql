-- Migration: Create missing tables referenced in database.types.ts
-- These tables are used by the application but were not previously created

-- Knowledge base table for website scraping and FAQs
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assistant_id UUID NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('website', 'faq', 'document', 'manual')),
    source_url TEXT,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_assistant ON knowledge_bases(assistant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_org ON knowledge_bases(organization_id);

-- Calendar integrations table
CREATE TABLE IF NOT EXISTS calendar_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('cal_com', 'calendly', 'google_calendar')),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    calendar_id TEXT,
    booking_url TEXT,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_org ON calendar_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_assistant ON calendar_integrations(assistant_id);

-- Call transfer configurations
CREATE TABLE IF NOT EXISTS transfer_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assistant_id UUID NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_keywords TEXT[],
    trigger_intent TEXT,
    transfer_to_phone TEXT NOT NULL,
    transfer_to_name TEXT,
    announcement_message TEXT,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_rules_assistant ON transfer_rules(assistant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_transfer_rules_org ON transfer_rules(organization_id);

-- Notification preferences (separate table for flexibility)
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email_on_missed_call BOOLEAN DEFAULT true,
    email_on_voicemail BOOLEAN DEFAULT true,
    email_on_appointment_booked BOOLEAN DEFAULT true,
    email_daily_summary BOOLEAN DEFAULT true,
    sms_on_missed_call BOOLEAN DEFAULT false,
    sms_on_voicemail BOOLEAN DEFAULT false,
    sms_phone_number TEXT,
    webhook_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_org ON notification_preferences(organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

-- Industry-specific templates
CREATE TABLE IF NOT EXISTS assistant_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    first_message TEXT NOT NULL,
    sample_faqs JSONB DEFAULT '[]',
    voice_id TEXT,
    recommended_settings JSONB DEFAULT '{}',
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_templates_industry ON assistant_templates(industry);

-- Appointments table (for tracking booked appointments)
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    external_id TEXT,
    provider TEXT NOT NULL DEFAULT 'cal_com',
    event_type TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    attendee_name TEXT NOT NULL,
    attendee_email TEXT,
    attendee_phone TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_call ON appointments(call_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);

-- Enable RLS on all new tables
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Knowledge bases: org members can manage their org's data
CREATE POLICY "Users can manage their org knowledge bases" ON knowledge_bases
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
    );

-- Calendar integrations: org members can manage
CREATE POLICY "Users can manage their org calendar integrations" ON calendar_integrations
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
    );

-- Transfer rules: org members can manage
CREATE POLICY "Users can manage their org transfer rules" ON transfer_rules
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
    );

-- Notification preferences: org members can manage their org's preferences
CREATE POLICY "Users can manage their org notification preferences" ON notification_preferences
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
    );

-- Assistant templates: anyone can read (public templates)
CREATE POLICY "Anyone can read assistant templates" ON assistant_templates
    FOR SELECT USING (true);

-- Appointments: org members can manage their org's appointments
CREATE POLICY "Users can manage their org appointments" ON appointments
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
    );

-- Add updated_at triggers
CREATE TRIGGER update_knowledge_bases_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_integrations_updated_at
    BEFORE UPDATE ON calendar_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transfer_rules_updated_at
    BEFORE UPDATE ON transfer_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE knowledge_bases IS 'Stores scraped website content and FAQs for AI assistants';
COMMENT ON TABLE calendar_integrations IS 'OAuth credentials and settings for calendar providers';
COMMENT ON TABLE transfer_rules IS 'Rules for when and how to transfer calls to humans';
COMMENT ON TABLE notification_preferences IS 'User/org notification channel preferences';
COMMENT ON TABLE assistant_templates IS 'Industry-specific pre-built assistant templates';
COMMENT ON TABLE appointments IS 'Booked appointments created during calls';
