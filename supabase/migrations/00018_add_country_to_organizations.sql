ALTER TABLE organizations ADD COLUMN country TEXT NOT NULL DEFAULT 'US';
CREATE INDEX idx_organizations_country ON organizations(country);
