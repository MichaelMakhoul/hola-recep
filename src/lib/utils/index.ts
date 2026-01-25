export { cn } from "./cn";

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Generate a cryptographically secure API key
 * Uses crypto.randomBytes() instead of Math.random() for security
 */
export function generateApiKey(): string {
  // Use dynamic import to avoid issues in browser environments
  const crypto = require("crypto");
  const prefix = "hr_";
  // Generate 24 random bytes = 32 base64url characters
  const randomBytes = crypto.randomBytes(24);
  return prefix + randomBytes.toString("base64url");
}
