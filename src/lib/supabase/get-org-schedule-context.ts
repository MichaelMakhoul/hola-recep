// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export interface OrgScheduleContext {
  timezone: string | undefined;
  businessHours: Record<string, { open: string; close: string } | null> | undefined;
  defaultAppointmentDuration: number | undefined;
}

/**
 * Fetch the organization's timezone, business_hours, and
 * default_appointment_duration from the DB.
 * Logs on failure and returns undefineds so callers degrade gracefully.
 */
export async function getOrgScheduleContext(
  supabase: SupabaseAny,
  organizationId: string,
  caller: string
): Promise<OrgScheduleContext> {
  const { data: orgRow, error: orgError } = await (supabase as any)
    .from("organizations")
    .select("timezone, business_hours, default_appointment_duration")
    .eq("id", organizationId)
    .single();

  if (orgError) {
    console.error(`Failed to fetch org schedule for ${caller}:`, {
      organizationId,
      error: orgError,
    });
  }

  return {
    timezone: orgRow?.timezone || undefined,
    businessHours: orgRow?.business_hours || undefined,
    defaultAppointmentDuration: orgRow?.default_appointment_duration ?? undefined,
  };
}
