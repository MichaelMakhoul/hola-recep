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

  it("img-src allows the googleadservices pixel form too", () => {
    // .../pagead/conversion/<id>/?label=…&script=0 is the legacy image beacon.
    // The host was in script-src and connect-src but not img-src, so the very
    // fallback this fix exists to unblock was still blocked for that host.
    expect(directive("img-src")).toContain("https://www.googleadservices.com");
  });

  it("the policy stays a deny-by-default allowlist", () => {
    // A wildcard or a dropped default-src would 'fix' the block by disabling
    // the protection instead of allow-listing the four Google hosts.
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");

    // Asserted by TOKEN, not substring. An earlier version used
    // `not.toContain("*;")` and `not.toMatch(/\s\*\s/)` — neither could ever
    // fail: directives are separate array elements in the source, so the "; "
    // separator only exists after `.join("; ")` at runtime, and a wildcard
    // appended at end-of-line has no trailing space to match. Both assertions
    // were green while pinning nothing.
    const tokens = (name: string): string[] => directive(name).split(/\s+/);
    for (const name of ["connect-src", "script-src", "img-src"]) {
      expect(tokens(name)).not.toContain("*");
      expect(tokens(name)).not.toContain("https:");
      expect(tokens(name)).not.toContain("http:");
    }
  });
});

describe("SCRUM-577: the ASSEMBLED production header, not the source text", () => {
  // Everything above reads next.config.ts as text, which can only ever see the
  // literal source — it cannot see the isDev branch resolve, and a weakening
  // added to a directive the text pins don't name slips straight past. Asserting
  // the built header closes that: NODE_ENV is "test" under vitest, so isDev is
  // false and this exercises the PRODUCTION branch specifically.
  const directives = async (): Promise<Record<string, string[]>> => {
    const mod = await import("../../next.config");
    const groups = await (mod.default as { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> }).headers();
    const csp = groups[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
    return Object.fromEntries(
      csp.split("; ").map((d) => {
        const [name, ...values] = d.split(" ");
        return [name, values];
      })
    );
  };

  it("no directive is wildcarded or scheme-opened in production", () => {
    return directives().then((d) => {
      for (const name of ["default-src", "script-src", "style-src", "img-src", "connect-src", "frame-src", "media-src", "worker-src"]) {
        expect(d[name], `${name} must exist`).toBeDefined();
        for (const unsafe of ["*", "https:", "http:", "data:*"]) {
          expect(d[name], `${name} must not contain ${unsafe}`).not.toContain(unsafe);
        }
      }
    });
  });

  it("'unsafe-eval' never reaches production", () => {
    // It is dev-only by an isDev ternary. Dropping that gate is invisible to
    // any source-text assertion, and hands an attacker eval().
    return directives().then((d) => {
      expect(d["script-src"]).not.toContain("'unsafe-eval'");
    });
  });

  it("script-src does not permit data: URIs", () => {
    // `script-src data:` is a documented CSP bypass — it re-enables arbitrary
    // script execution without naming a host.
    return directives().then((d) => {
      expect(d["script-src"]).not.toContain("data:");
    });
  });

  it("the lockdown directives survive assembly", () => {
    return directives().then((d) => {
      expect(d["default-src"]).toEqual(["'self'"]);
      expect(d["object-src"]).toEqual(["'none'"]);
      expect(d["frame-ancestors"]).toEqual(["'none'"]);
      expect(d["base-uri"]).toEqual(["'self'"]);
      expect(d["form-action"]).toEqual(["'self'"]);
    });
  });

  it("the Ads hosts are present in the built header, not just the source", () => {
    return directives().then((d) => {
      expect(d["connect-src"]).toContain("https://pagead2.googlesyndication.com");
      expect(d["img-src"]).toContain("https://pagead2.googlesyndication.com");
      expect(d["script-src"]).toContain("https://www.googleadservices.com");
    });
  });
});
