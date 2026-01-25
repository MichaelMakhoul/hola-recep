/**
 * Security validation utilities
 */
import crypto from "crypto";

// UUID validation regex
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Validate multiple required UUIDs
 * Returns error message if invalid, null if all valid
 */
export function validateRequiredUUIDs(ids: Record<string, string | undefined>): string | null {
  for (const [name, value] of Object.entries(ids)) {
    if (!value) {
      return `${name} is required`;
    }
    if (!isValidUUID(value)) {
      return `Invalid ${name} format`;
    }
  }
  return null;
}

/**
 * Check if a URL is allowed (not internal/private network)
 * Prevents SSRF attacks
 */
export function isUrlAllowed(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTP(S)
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block private IPs, localhost, and internal hostnames
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // AWS metadata and link-local
      /^0\./, // 0.x.x.x
      /^::1$/, // IPv6 localhost
      /^fc00:/i, // IPv6 private
      /^fe80:/i, // IPv6 link-local
      /^fd[0-9a-f]{2}:/i, // IPv6 unique local
      /\.local$/i,
      /\.internal$/i,
      /\.localhost$/i,
      /\.localdomain$/i,
      /^metadata\.google\.internal$/i,
      /^instance-data$/i,
    ];

    if (blockedPatterns.some((p) => p.test(hostname))) {
      return false;
    }

    // Also block if hostname is an IP that resolves to private range
    // Check for IPv4 addresses
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);
      // 10.x.x.x
      if (a === 10) return false;
      // 172.16-31.x.x
      if (a === 172 && b >= 16 && b <= 31) return false;
      // 192.168.x.x
      if (a === 192 && b === 168) return false;
      // 127.x.x.x
      if (a === 127) return false;
      // 169.254.x.x
      if (a === 169 && b === 254) return false;
      // 0.x.x.x
      if (a === 0) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");

    // If lengths differ, still do the comparison to maintain constant time
    // but return false
    if (bufferA.length !== bufferB.length) {
      // Do a dummy comparison to maintain constant time
      crypto.timingSafeEqual(bufferA, bufferA);
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate phone number format (basic validation)
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  // US phone: 10 digits, or 11 if starts with 1
  // Also allow international: 7-15 digits
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string input (remove potentially dangerous characters)
 */
export function sanitizeString(str: string, maxLength: number = 1000): string {
  if (!str) return "";
  // Truncate to max length
  let sanitized = str.slice(0, maxLength);
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");
  return sanitized;
}

/**
 * Validate ElevenLabs voice ID format
 * ElevenLabs voice IDs are alphanumeric strings (e.g., "EXAVITQu4vr4xnSDxMaL")
 * Also allows common voice name aliases (e.g., "rachel", "drew")
 */
export const VOICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;

export function isValidVoiceId(voiceId: string): boolean {
  if (!voiceId || typeof voiceId !== "string") return false;
  return VOICE_ID_REGEX.test(voiceId);
}

/**
 * Verify a webhook request with secret
 * Always requires the secret to be configured
 */
export function verifyWebhookSecret(
  requestSecret: string | null,
  expectedSecret: string | undefined,
  requireSecret: boolean = true
): { valid: boolean; error?: string } {
  if (!expectedSecret) {
    if (requireSecret) {
      return { valid: false, error: "Webhook secret not configured" };
    }
    // In development, allow without secret if explicitly disabled
    return { valid: true };
  }

  if (!requestSecret) {
    return { valid: false, error: "Missing secret header" };
  }

  if (!timingSafeCompare(requestSecret, expectedSecret)) {
    return { valid: false, error: "Invalid secret" };
  }

  return { valid: true };
}
