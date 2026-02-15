import Twilio from "twilio";

let twilioClient: ReturnType<typeof Twilio> | null = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
    }
    twilioClient = Twilio(accountSid, authToken);
  }
  return twilioClient;
}

export interface AvailableNumber {
  number: string;
  friendlyName: string;
  locality: string;
  region: string;
  isoCountry: string;
}

export async function searchAvailableNumbers(
  countryCode: string,
  areaCode?: string,
  limit: number = 10
): Promise<AvailableNumber[]> {
  const client = getTwilioClient();

  const searchParams: Record<string, unknown> = { limit };
  if (areaCode) {
    // For AU, area codes are like "02" — Twilio expects the digit after 0
    // Twilio uses `areaCode` for US and `contains` pattern for other countries
    if (countryCode === "AU" && areaCode.startsWith("0")) {
      // Search by pattern: numbers starting with +61{digit}
      searchParams.contains = areaCode.replace(/^0/, "");
    } else {
      searchParams.areaCode = parseInt(areaCode, 10);
    }
  }

  const numbers = await client.availablePhoneNumbers(countryCode).local.list(searchParams);

  return numbers.map((n) => ({
    number: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality || "",
    region: n.region || "",
    isoCountry: n.isoCountry || countryCode,
  }));
}

export async function purchaseNumber(phoneNumber: string): Promise<{ sid: string; number: string }> {
  const client = getTwilioClient();
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
  });
  return { sid: purchased.sid, number: purchased.phoneNumber };
}

export async function releaseNumber(twilioSid: string): Promise<void> {
  const client = getTwilioClient();
  await client.incomingPhoneNumbers(twilioSid).remove();
}

export function getTwilioAccountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID is required");
  return sid;
}

export function getTwilioAuthToken(): string {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) throw new Error("TWILIO_AUTH_TOKEN is required");
  return token;
}
