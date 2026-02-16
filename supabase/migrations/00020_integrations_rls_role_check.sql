-- Tighten RLS policies on integrations: only owner/admin can INSERT, UPDATE, DELETE
-- SELECT remains available to all org members

DROP POLICY "Users can create integrations in their org" ON integrations;
DROP POLICY "Users can update their org integrations" ON integrations;
DROP POLICY "Users can delete their org integrations" ON integrations;

CREATE POLICY "Admins can create integrations in their org"
  ON integrations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update their org integrations"
  ON integrations FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete their org integrations"
  ON integrations FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
