import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalComClient,
  formatBookingConfirmation,
  formatAvailabilityForVoice,
} from "@/lib/calendar/cal-com";
import { sendAppointmentNotification } from "@/lib/notifications/notification-service";
import {
  sanitizeString,
  isValidPhoneNumber,
  isValidEmail,
} from "@/lib/security/validation";

interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

interface BusinessHours {
  open: string; // "09:00"
  close: string; // "17:00"
}

const SLOT_DURATION_MINUTES = 30;

/**
 * Compute available 30-minute slots for a given date using the org's
 * business hours minus any existing (non-cancelled) appointments.
 */
async function getBuiltInAvailability(
  organizationId: string,
  date: string
): Promise<string[]> {
  const supabase = createAdminClient();

  // 1. Get business hours + timezone
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("business_hours, timezone")
    .eq("id", organizationId)
    .single();

  if (!org || !org.business_hours) return [];

  const timezone: string = org.timezone || "America/New_York";

  // 2. Determine the day name for the requested date in the org's timezone
  const requestedDate = new Date(`${date}T12:00:00`); // noon to avoid DST edge
  const dayName = requestedDate
    .toLocaleDateString("en-US", { weekday: "long", timeZone: timezone })
    .toLowerCase();

  const hours: BusinessHours | null = org.business_hours[dayName];
  if (!hours || !hours.open || !hours.close) return []; // Closed

  // 3. Generate slot start times
  const [openH, openM] = hours.open.split(":").map(Number);
  const [closeH, closeM] = hours.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const slots: string[] = [];
  for (let m = openMinutes; m + SLOT_DURATION_MINUTES <= closeMinutes; m += SLOT_DURATION_MINUTES) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    slots.push(`${date}T${hh}:${mm}:00`);
  }

  if (slots.length === 0) return [];

  // 4. Get existing appointments for this date that are not cancelled
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const { data: existing } = await (supabase as any)
    .from("appointments")
    .select("start_time, duration_minutes, end_time")
    .eq("organization_id", organizationId)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .in("status", ["confirmed", "pending"]);

  const appointments = (existing || []) as {
    start_time: string;
    duration_minutes: number | null;
    end_time: string | null;
  }[];

  // 5. Filter out slots that overlap with existing appointments
  return slots.filter((slotIso) => {
    const slotStart = new Date(slotIso).getTime();
    const slotEnd = slotStart + SLOT_DURATION_MINUTES * 60_000;

    return !appointments.some((appt) => {
      const apptStart = new Date(appt.start_time).getTime();
      const apptEnd = appt.end_time
        ? new Date(appt.end_time).getTime()
        : apptStart + (appt.duration_minutes || SLOT_DURATION_MINUTES) * 60_000;
      // Overlap: slotStart < apptEnd AND slotEnd > apptStart
      return slotStart < apptEnd && slotEnd > apptStart;
    });
  });
}

/**
 * Format built-in availability slots for a voice response.
 */
function formatBuiltInAvailabilityForVoice(
  date: string,
  slots: string[]
): string {
  if (slots.length === 0) {
    return "I'm sorry, there are no available appointments on that date. Would you like to check a different day?";
  }

  const dateObj = new Date(`${date}T12:00:00`);
  const dateStr = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const slotsToShow = slots.slice(0, 5);
  const timeStrings = slotsToShow.map((iso) => {
    const t = new Date(iso);
    return t.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  });

  const more = slots.length > 5 ? ` and ${slots.length - 5} more` : "";
  return `On ${dateStr}, I have openings at ${timeStrings.join(", ")}${more}. Which time works best for you?`;
}

// ─── Public handlers ────────────────────────────────────────────────────────

export async function handleBookAppointment(
  organizationId: string,
  args: {
    datetime?: string;
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }
): Promise<ToolResult> {
  const { datetime, name, phone, email, notes } = args;

  if (!datetime) {
    return {
      success: false,
      message:
        "I need to know what date and time you'd like to book. What time works for you?",
    };
  }

  if (!name) {
    return {
      success: false,
      message:
        "I need your name to complete the booking. What name should I put this under?",
    };
  }

  if (!phone) {
    return {
      success: false,
      message:
        "I need a phone number to confirm the booking. What's the best number to reach you?",
    };
  }

  if (!isValidPhoneNumber(phone)) {
    return {
      success: false,
      message:
        "I didn't catch that phone number correctly. Could you please repeat it?",
    };
  }

  if (email && !isValidEmail(email)) {
    return {
      success: false,
      message:
        "That email address doesn't look quite right. Could you please repeat it?",
    };
  }

  const sanitizedName = sanitizeString(name, 100);
  const sanitizedNotes = notes ? sanitizeString(notes, 500) : undefined;

  // ── Try Cal.com first ─────────────────────────────────────────────────
  const calClient = await getCalComClient(organizationId);

  if (calClient) {
    return bookViaCal(
      calClient,
      organizationId,
      datetime,
      sanitizedName,
      phone,
      email,
      sanitizedNotes
    );
  }

  // ── Built-in booking ──────────────────────────────────────────────────
  return bookInternal(
    organizationId,
    datetime,
    sanitizedName,
    phone,
    email,
    sanitizedNotes
  );
}

export async function handleCheckAvailability(
  organizationId: string,
  args: { date?: string }
): Promise<ToolResult> {
  const { date } = args;

  if (!date) {
    return {
      success: false,
      message: "What date would you like me to check availability for?",
    };
  }

  // ── Try Cal.com first ─────────────────────────────────────────────────
  const calClient = await getCalComClient(organizationId);

  if (calClient) {
    return checkAvailabilityViaCal(calClient, organizationId, date);
  }

  // ── Built-in availability ─────────────────────────────────────────────
  try {
    const slots = await getBuiltInAvailability(organizationId, date);
    return {
      success: true,
      message: formatBuiltInAvailabilityForVoice(date, slots),
    };
  } catch (error: any) {
    console.error("Built-in availability error:", error.message);
    return {
      success: false,
      message:
        "I'm having trouble checking the calendar right now. Would you like me to take your information instead?",
    };
  }
}

export async function handleCancelAppointment(
  organizationId: string,
  args: { phone?: string; reason?: string }
): Promise<ToolResult> {
  const { phone, reason } = args;

  if (!phone) {
    return {
      success: false,
      message:
        "I need your phone number to look up your appointment. What's the phone number you booked with?",
    };
  }

  const supabase = createAdminClient();

  const { data: appointments } = await (supabase as any)
    .from("appointments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("attendee_phone", phone)
    .in("status", ["confirmed", "pending"])
    .order("start_time", { ascending: true })
    .limit(1);

  const appointment = appointments?.[0] ?? null;

  if (!appointment) {
    return {
      success: false,
      message:
        "I wasn't able to find an upcoming appointment with that phone number. Could you double-check the number you booked with?",
    };
  }

  try {
    if (appointment.external_id) {
      const calClient = await getCalComClient(organizationId);
      if (calClient && appointment.metadata?.calComBookingId) {
        await calClient.cancelBooking(
          appointment.metadata.calComBookingId,
          reason || "Cancelled by caller"
        );
      }
    }

    const { error: cancelDbError } = await (supabase as any)
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id);

    if (cancelDbError) {
      console.error("Failed to update appointment status locally:", cancelDbError);
    }

    const startDate = new Date(appointment.start_time);
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const timeStr = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    return {
      success: true,
      message: `Your appointment on ${dateStr} at ${timeStr} has been cancelled. Would you like to reschedule or is there anything else I can help with?`,
    };
  } catch (error: any) {
    console.error("Cancel appointment error:", error.message);
    return {
      success: false,
      message:
        "I'm having trouble cancelling the appointment right now. Would you like me to have someone call you back to help with this?",
    };
  }
}

// ─── Cal.com helpers ────────────────────────────────────────────────────────

async function bookViaCal(
  calClient: NonNullable<Awaited<ReturnType<typeof getCalComClient>>>,
  organizationId: string,
  datetime: string,
  sanitizedName: string,
  phone: string,
  email: string | undefined,
  sanitizedNotes: string | undefined
): Promise<ToolResult> {
  const supabase = createAdminClient();

  const { data: integration } = await (supabase as any)
    .from("calendar_integrations")
    .select("calendar_id, settings")
    .eq("organization_id", organizationId)
    .eq("provider", "cal_com")
    .eq("is_active", true)
    .single();

  if (!integration || !integration.calendar_id) {
    return {
      success: false,
      message:
        "I'm sorry, the calendar system isn't fully set up yet. Can I take your information and have someone call you back?",
    };
  }

  const eventTypeId = parseInt(integration.calendar_id, 10);
  if (isNaN(eventTypeId)) {
    return {
      success: false,
      message:
        "I'm sorry, there's a configuration issue with the calendar. Let me take your information and have someone call you back.",
    };
  }

  try {
    const bookingEmail =
      email || `booking-${crypto.randomUUID()}@noreply.holarecep.com`;

    const booking = await calClient.createBooking({
      eventTypeId,
      start: datetime,
      name: sanitizedName,
      email: bookingEmail,
      phone,
      notes: sanitizedNotes,
      metadata: {
        source: "ai_receptionist",
        organizationId,
      },
    });

    // Record in our database — rollback Cal.com booking if this fails
    const { error: dbError } = await (supabase as any)
      .from("appointments")
      .insert({
        organization_id: organizationId,
        external_id: booking.uid,
        provider: "cal_com",
        attendee_name: sanitizedName,
        attendee_phone: phone,
        attendee_email: bookingEmail,
        start_time: datetime,
        end_time: booking.endTime,
        status: "confirmed",
        notes: sanitizedNotes,
        metadata: {
          calComBookingId: booking.id,
          eventTypeId,
        },
      });

    if (dbError) {
      console.error("Failed to record appointment locally, rolling back Cal.com booking:", dbError);
      try {
        await calClient.cancelBooking(booking.id, "Internal system error - rollback");
      } catch (rollbackErr) {
        console.error("CRITICAL: Failed to rollback Cal.com booking after DB failure:", rollbackErr);
      }
      return {
        success: false,
        message:
          "I'm having trouble completing the booking right now. Let me take your information and have someone call you back to confirm the appointment.",
      };
    }

    // Send notification
    const appointmentDate = new Date(datetime);
    await sendAppointmentNotification({
      organizationId,
      callerPhone: phone,
      callerName: sanitizedName,
      appointmentDate,
      appointmentTime: appointmentDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    }).catch((err) => {
      console.error("Failed to send appointment notification:", err);
    });

    return {
      success: true,
      message: formatBookingConfirmation(booking),
      data: {
        bookingId: booking.id,
        bookingUid: booking.uid,
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
    };
  } catch (error: any) {
    if (error.message?.includes("slot is not available")) {
      return {
        success: false,
        message:
          "I'm sorry, that time slot is no longer available. Would you like me to check for other available times?",
      };
    }

    console.error("Book appointment error:", error.message);
    return {
      success: false,
      message:
        "I'm having trouble completing the booking right now. Let me take your information and have someone call you back to confirm the appointment.",
    };
  }
}

async function checkAvailabilityViaCal(
  calClient: NonNullable<Awaited<ReturnType<typeof getCalComClient>>>,
  organizationId: string,
  date: string
): Promise<ToolResult> {
  const supabase = createAdminClient();

  const { data: integration } = await (supabase as any)
    .from("calendar_integrations")
    .select("calendar_id")
    .eq("organization_id", organizationId)
    .eq("provider", "cal_com")
    .eq("is_active", true)
    .single();

  if (!integration || !integration.calendar_id) {
    return {
      success: false,
      message: "The calendar system isn't fully set up yet.",
    };
  }

  const eventTypeId = parseInt(integration.calendar_id, 10);
  if (isNaN(eventTypeId)) {
    return {
      success: false,
      message: "There's a configuration issue with the calendar.",
    };
  }

  try {
    const startTime = `${date}T00:00:00Z`;
    const endTime = `${date}T23:59:59Z`;

    const availability = await calClient.getAvailability({
      eventTypeId,
      startTime,
      endTime,
    });

    return { success: true, message: formatAvailabilityForVoice(availability) };
  } catch (error: any) {
    console.error("Check availability error:", error.message);
    return {
      success: false,
      message:
        "I'm having trouble checking the calendar right now. Would you like me to take your information instead?",
    };
  }
}

// ─── Built-in booking helper ────────────────────────────────────────────────

async function bookInternal(
  organizationId: string,
  datetime: string,
  sanitizedName: string,
  phone: string,
  email: string | undefined,
  sanitizedNotes: string | undefined
): Promise<ToolResult> {
  const supabase = createAdminClient();

  const startDate = new Date(datetime);
  if (isNaN(startDate.getTime())) {
    return {
      success: false,
      message:
        "I didn't understand that date and time. Could you say it again?",
    };
  }

  const endDate = new Date(startDate.getTime() + SLOT_DURATION_MINUTES * 60_000);

  // 1. Get business hours to validate the slot
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("business_hours, timezone")
    .eq("id", organizationId)
    .single();

  if (org?.business_hours) {
    const timezone: string = org.timezone || "America/New_York";
    const dayName = startDate
      .toLocaleDateString("en-US", { weekday: "long", timeZone: timezone })
      .toLowerCase();
    const hours: BusinessHours | null = org.business_hours[dayName];

    if (!hours || !hours.open || !hours.close) {
      return {
        success: false,
        message:
          "I'm sorry, we're closed on that day. Would you like to pick a different date?",
      };
    }

    // Check that the requested time falls within business hours
    const [openH, openM] = hours.open.split(":").map(Number);
    const [closeH, closeM] = hours.close.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const reqH = startDate.getHours();
    const reqM = startDate.getMinutes();
    const reqMinutes = reqH * 60 + reqM;
    const reqEndMinutes = reqMinutes + SLOT_DURATION_MINUTES;

    if (reqMinutes < openMinutes || reqEndMinutes > closeMinutes) {
      const openStr = formatTime(openH, openM);
      const closeStr = formatTime(closeH, closeM);
      return {
        success: false,
        message: `That time is outside our business hours. We're open from ${openStr} to ${closeStr}. Would you like to pick a time within those hours?`,
      };
    }
  }

  // 2. Check for overlapping appointments
  const { data: conflicts } = await (supabase as any)
    .from("appointments")
    .select("id")
    .eq("organization_id", organizationId)
    .in("status", ["confirmed", "pending"])
    .lt("start_time", endDate.toISOString())
    .gt("end_time", startDate.toISOString())
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return {
      success: false,
      message:
        "I'm sorry, that time slot is no longer available. Would you like me to check for other available times?",
    };
  }

  // 3. Insert appointment
  const bookingEmail =
    email || `booking-${crypto.randomUUID()}@noreply.holarecep.com`;

  const { data: appointment, error: dbError } = await (supabase as any)
    .from("appointments")
    .insert({
      organization_id: organizationId,
      provider: "internal",
      attendee_name: sanitizedName,
      attendee_phone: phone,
      attendee_email: bookingEmail,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      duration_minutes: SLOT_DURATION_MINUTES,
      status: "confirmed",
      notes: sanitizedNotes,
      metadata: { source: "ai_receptionist" },
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("Failed to insert internal appointment:", dbError);
    return {
      success: false,
      message:
        "I'm having trouble completing the booking right now. Let me take your information and have someone call you back to confirm the appointment.",
    };
  }

  // 4. Send notification
  await sendAppointmentNotification({
    organizationId,
    callerPhone: phone,
    callerName: sanitizedName,
    appointmentDate: startDate,
    appointmentTime: startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  }).catch((err) => {
    console.error("Failed to send appointment notification:", err);
  });

  const dateStr = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeStr = startDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    success: true,
    message: `I've booked your appointment for ${dateStr} at ${timeStr}. Is there anything else I can help you with?`,
    data: {
      appointmentId: appointment.id,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    },
  };
}

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  const mins = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  return `${hour12}${mins} ${period}`;
}
