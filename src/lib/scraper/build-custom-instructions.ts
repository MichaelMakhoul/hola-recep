/**
 * Build custom instructions string from extracted business info.
 * Returns empty string if no useful fields are present.
 *
 * Separate file so client components can import without pulling in
 * Node-only dependencies (dns/promises) from website-scraper.ts.
 */
export function buildCustomInstructionsFromBusinessInfo(
  info: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    hours?: string[];
    services?: string[];
    about?: string;
  }
): string {
  const parts: string[] = [];
  if (info.about) parts.push(`About the business: ${info.about}`);
  if (info.services?.length) parts.push(`Services offered: ${info.services.join(", ")}`);
  if (info.hours?.length) parts.push(`Business hours:\n${info.hours.join("\n")}`);
  if (info.address) parts.push(`Business address: ${info.address}`);
  if (parts.length === 0) return "";
  return "Here is information about the business scraped from their website:\n\n" + parts.join("\n\n");
}
