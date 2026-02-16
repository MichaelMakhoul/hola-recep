-- Create integrations table for webhook delivery to external services
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'webhook',
  webhook_url TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{call.completed}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_integrations_org_id ON integrations(organization_id);
CREATE INDEX idx_integrations_org_active ON integrations(organization_id, is_active);

-- Create integration_logs table for delivery tracking
CREATE TABLE integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_integration_logs_integration_id ON integration_logs(integration_id, attempted_at DESC);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- RLS for integrations: users can manage integrations in their org
CREATE POLICY "Users can view their org integrations"
  ON integrations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create integrations in their org"
  ON integrations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their org integrations"
  ON integrations FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their org integrations"
  ON integrations FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- RLS for integration_logs: users can view logs for integrations in their org
CREATE POLICY "Users can view logs for their org integrations"
  ON integration_logs FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

-- Allow service role full access (for webhook delivery from API routes)
CREATE POLICY "Service role full access to integrations"
  ON integrations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to integration_logs"
  ON integration_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-cleanup: delete logs older than 30 days (run via cron or pg_cron)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-integration-logs', '0 3 * * *',
--   $$DELETE FROM integration_logs WHERE attempted_at < now() - interval '30 days'$$
-- );
