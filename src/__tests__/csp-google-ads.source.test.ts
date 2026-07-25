import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// SCRUM-577: the Google Ads conversion tag fires but its beacon never leaves
// the browser. Observed on live phondo.ai/pricing:
//
//   Connecting to 'https://pagead2.googlesyndication.com/ccm/collect?...&tid=AW-18339493581&en=page_view'
//   violates the following Content-Security-Policy directive: "connect-src ..."
//   Loading the image '...' violates ... "img-src ..."
//
// gtag loads fine (googletagmanager is allow-listed) and google-analytics.com
// is allow-listed, so GA works — but Google ADS delivers conversions to its own
// hosts, none of which were listed. Every conversion would be silently dropped
// at the browser, which is indistinguishable from "nobody converted" in the Ads
// dashboard — the exact metric the campaign optimises against.
//
// Source-pinned rather than asserted against a running server: the header is
// built statically in next.config.ts, and a route-level test would need a real
// Next server to observe it.

const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf-8");

/**
 * Extract one CSP directive's line from the next.config.ts source. Reads to
 * end-of-line rather than to the next quote: script-src is a template literal
 * containing its own quotes (`${isDev ? " 'unsafe-eval'" : ""}`), so a
 * quote-terminated match would silently truncate before the host list and make
 * every assertion against it vacuous.
 */
function directive(name: string): string {
  const match = config.match(new RegExp(`${name} [^\\n]*`));
  return match ? match[0] : "";
}

describe("SCRUM-577: CSP allows Google Ads conversion delivery", () => {
  it("connect-src allows the Ads collection endpoint (fetch/XHR beacons)", () => {
    // This is the exact host the browser refused; without it the conversion
    // POST is blocked and Ads records nothing.
    expect(directive("connect-src")).toContain("https://pagead2.googlesyndication.com");
  });

  it("img-src allows the Ads pixel fallback", () => {
    // gtag falls back to an image beacon when fetch is unavailable/blocked —
    // it was blocked here too, so there was no surviving delivery path.
    expect(directive("img-src")).toContain("https://pagead2.googlesyndication.com");
  });

  it("both directives allow the doubleclick conversion host", () => {
    expect(directive("connect-src")).toContain("https://googleads.g.doubleclick.net");
    expect(directive("img-src")).toContain("https://googleads.g.doubleclick.net");
  });

  it("script-src allows googleadservices (the conversion script gtag pulls in)", () => {
    expect(directive("script-src")).toContain("https://www.googleadservices.com");
  });

  it("GA hosts are still allow-listed (the Ads fix must not displace them)", () => {
    expect(directive("connect-src")).toContain("https://www.google-analytics.com");
    expect(directive("img-src")).toContain("https://www.google-analytics.com");
  });

  it("the policy stays a deny-by-default allowlist", () => {
    // A wildcard or a dropped default-src would 'fix' the block by disabling
    // the protection instead of allow-listing the four Google hosts.
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(directive("connect-src")).not.toContain("*;");
    expect(directive("script-src")).not.toMatch(/\shttps:\s|\s\*\s/);
  });
});
