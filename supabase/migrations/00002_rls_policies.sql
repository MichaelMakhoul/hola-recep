-- Enable Row Level Security on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USER PROFILES POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- ORGANIZATIONS POLICIES
-- ============================================

-- Users can view organizations they are members of
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT get_user_organizations(auth.uid()))
    OR
    -- Also allow viewing child orgs if user is member of parent
    parent_org_id IN (SELECT get_user_organizations(auth.uid()))
  );

-- Users can create organizations
CREATE POLICY "Users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Org admins can update their organizations
CREATE POLICY "Org admins can update organizations"
  ON organizations FOR UPDATE
  USING (is_org_admin(id, auth.uid()));

-- Org owners can delete their organizations
CREATE POLICY "Org owners can delete organizations"
  ON organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE organization_id = organizations.id
      AND user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- ============================================
-- ORG MEMBERS POLICIES
-- ============================================

-- Users can view members of organizations they belong to
CREATE POLICY "Users can view org members"
  ON org_members FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Org admins can add members
CREATE POLICY "Org admins can add members"
  ON org_members FOR INSERT
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

-- Org admins can update members (except owners)
CREATE POLICY "Org admins can update members"
  ON org_members FOR UPDATE
  USING (
    is_org_admin(organization_id, auth.uid())
    AND role != 'owner'
  );

-- Org owners can delete members
CREATE POLICY "Org owners can delete members"
  ON org_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members AS om
      WHERE om.organization_id = org_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
    AND org_members.user_id != auth.uid() -- Can't delete yourself
  );

-- ============================================
-- ASSISTANTS POLICIES
-- ============================================

-- Users can view assistants in their organizations
CREATE POLICY "Users can view org assistants"
  ON assistants FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Org members can create assistants
CREATE POLICY "Org members can create assistants"
  ON assistants FOR INSERT
  WITH CHECK (is_org_member(organization_id, auth.uid()));

-- Org members can update assistants
CREATE POLICY "Org members can update assistants"
  ON assistants FOR UPDATE
  USING (is_org_member(organization_id, auth.uid()));

-- Org admins can delete assistants
CREATE POLICY "Org admins can delete assistants"
  ON assistants FOR DELETE
  USING (is_org_admin(organization_id, auth.uid()));

-- ============================================
-- PHONE NUMBERS POLICIES
-- ============================================

-- Users can view phone numbers in their organizations
CREATE POLICY "Users can view org phone numbers"
  ON phone_numbers FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Org admins can add phone numbers
CREATE POLICY "Org admins can add phone numbers"
  ON phone_numbers FOR INSERT
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

-- Org members can update phone numbers (assign to assistants)
CREATE POLICY "Org members can update phone numbers"
  ON phone_numbers FOR UPDATE
  USING (is_org_member(organization_id, auth.uid()));

-- Org admins can delete phone numbers
CREATE POLICY "Org admins can delete phone numbers"
  ON phone_numbers FOR DELETE
  USING (is_org_admin(organization_id, auth.uid()));

-- ============================================
-- CALLS POLICIES
-- ============================================

-- Users can view calls in their organizations
CREATE POLICY "Users can view org calls"
  ON calls FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Service role only for call inserts (via webhooks)
-- No user insert policy needed - calls come from Vapi webhooks

-- ============================================
-- SUBSCRIPTIONS POLICIES
-- ============================================

-- Users can view their org subscription
CREATE POLICY "Users can view org subscription"
  ON subscriptions FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Service role only for subscription changes (via Stripe webhooks)

-- ============================================
-- USAGE RECORDS POLICIES
-- ============================================

-- Users can view usage records in their organizations
CREATE POLICY "Users can view org usage records"
  ON usage_records FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Service role only for usage record inserts

-- ============================================
-- API KEYS POLICIES
-- ============================================

-- Users can view API keys in their organizations (excluding hash)
CREATE POLICY "Users can view org API keys"
  ON api_keys FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Org admins can create API keys
CREATE POLICY "Org admins can create API keys"
  ON api_keys FOR INSERT
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

-- Org admins can update API keys
CREATE POLICY "Org admins can update API keys"
  ON api_keys FOR UPDATE
  USING (is_org_admin(organization_id, auth.uid()));

-- Org admins can delete API keys
CREATE POLICY "Org admins can delete API keys"
  ON api_keys FOR DELETE
  USING (is_org_admin(organization_id, auth.uid()));

-- ============================================
-- SERVICE ROLE BYPASS
-- ============================================
-- Note: Service role automatically bypasses RLS
-- This is used for webhooks and admin operations
