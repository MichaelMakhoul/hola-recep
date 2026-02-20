/**
 * Twilio call transfer using REST API.
 * Uses raw fetch to keep dependencies light (no Twilio SDK).
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

/**
 * Transfer an active Twilio call to another phone number.
 * Updates the call with TwiML that announces the transfer and dials the target.
 *
 * @param {string} callSid - The active Twilio CallSid
 * @param {string} transferTo - E.164 phone number to transfer to
 * @param {string} [announcement] - Message to say before connecting
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function transferCall(callSid, transferTo, announcement) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error("[Transfer] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
    return {
      success: false,
      message: "I'm sorry, I'm unable to transfer the call right now. Let me take your information instead.",
    };
  }

  if (!callSid || !transferTo) {
    return {
      success: false,
      message: "I'm sorry, I don't have the information needed to transfer this call.",
    };
  }

  // Build TwiML to announce and dial
  const safeAnnouncement = (announcement || "Please hold while I transfer your call.")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  const safeNumber = transferTo.replace(/[^+\d]/g, "");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${safeAnnouncement}</Say>
  <Dial>${safeNumber}</Dial>
</Response>`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Twiml: twiml }).toString(),
    });

    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      console.error(`[Transfer] Twilio API error ${res.status}:`, text);
      return {
        success: false,
        message: "I'm sorry, I wasn't able to complete the transfer. Let me take your information and have someone call you back.",
      };
    }

    console.log(`[Transfer] Call ${callSid} transferred to ${safeNumber}`);
    return {
      success: true,
      message: safeAnnouncement,
    };
  } catch (err) {
    console.error("[Transfer] Failed to transfer call:", err.message);
    return {
      success: false,
      message: "I'm sorry, I'm having trouble transferring the call. Let me take your information instead.",
    };
  }
}

module.exports = { transferCall };
