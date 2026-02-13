-- Make knowledge_bases org-level (assistant_id optional) and add title column

ALTER TABLE knowledge_bases ALTER COLUMN assistant_id DROP NOT NULL;

ALTER TABLE knowledge_bases ADD COLUMN title TEXT;

-- Drop old assistant-scoped index if it exists
DROP INDEX IF EXISTS idx_knowledge_bases_assistant;

-- New index for org-level active KB lookups
CREATE INDEX idx_knowledge_bases_org_active
  ON knowledge_bases(organization_id)
  WHERE is_active = true;
