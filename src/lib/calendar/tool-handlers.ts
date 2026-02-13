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

  const calClient = await getCalComClient(organizationId);
  if (!calClient) {
    return {
      success: false,
      message:
        "I'm sorry, I'm unable to book appointments right now. Can I take your information and have someone call you back to schedule?",
    };
  }

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

  const calClient = await getCalComClient(organizationId);
  if (!calClient) {
    return {
      success: false,
      message:
        "I'm sorry, I'm unable to check appointment availability right now.",
    };
  }

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
