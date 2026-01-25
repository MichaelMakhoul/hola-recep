-- Migration: Create atomic call increment function
-- This prevents race conditions when multiple calls complete simultaneously

CREATE OR REPLACE FUNCTION increment_call_usage(org_id UUID)
RETURNS TABLE(calls_used INTEGER, calls_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE subscriptions
  SET calls_used = COALESCE(subscriptions.calls_used, 0) + 1
  WHERE organization_id = org_id
  RETURNING subscriptions.calls_used, subscriptions.calls_limit;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION increment_call_usage(UUID) IS 'Atomically increments call usage for an organization and returns the new count and limit';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_call_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_call_usage(UUID) TO service_role;
