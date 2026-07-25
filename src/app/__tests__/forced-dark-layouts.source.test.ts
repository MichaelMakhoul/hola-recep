import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// SCRUM-574: the public layouts force dark mode with a `.dark` wrapper INSIDE
// <body> (PR #42). That flips the CSS custom properties for everything below
// it — but NOT the inherited text colour, because globals.css sets the base
// colour on `body` itself:
//
//   @layer base { body { @apply bg-background text-foreground } }
//
// `color` is resolved on <body>, where --foreground is still the LIGHT value
// (222.2 84% 4.9%), and descendants inherit that already-computed colour.
// Re-declaring --foreground further down does not re-resolve it. Meanwhile
// `bg-card` IS resolved at the card, picking up the dark value — which is the
// SAME colour, 222.2 84% 4.9%.
//
// Live result on phondo.ai/pricing: price text rgb(2,8,23) on a card background
// of rgb(2,8,23). Plan names, prices, every feature bullet and the outline
// button labels were invisible to real visitors — caught in PostHog replays.
//
// The fix is for the wrapper to declare the colours itself, so they resolve
// against the DARK variables it just introduced. These pins guard that: a
// forced-dark wrapper that sets variables without re-declaring the colours
// re-creates an invisible-text page, and nothing in the type system, the
// build, or a jsdom test would notice (the repo's vitest env is node-only and
// cannot compute Tailwind).

const REPO_ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf-8");
}

/** Every wrapper that force-scopes dark mode below <body>. */
const FORCED_DARK_LAYOUTS = [
  "src/app/(marketing)/layout.tsx",
  "src/app/(auth)/layout.tsx",
];

describe("SCRUM-574: forced-dark layouts re-declare the inherited colours", () => {
  for (const layoutPath of FORCED_DARK_LAYOUTS) {
    describe(layoutPath, () => {
      const source = read(layoutPath);

      it("still scopes dark mode (class + colorScheme)", () => {
        expect(source).toMatch(/className="dark[ "]/);
        expect(source).toContain('colorScheme: "dark"');
      });

      it("re-declares text colour on the wrapper, not just the variables", () => {
        // Without this the wrapper inherits body's LIGHT-theme colour, which is
        // pixel-identical to the dark --card it just switched on.
        expect(source).toMatch(/className="dark[^"]*\btext-foreground\b/);
      });

      it("re-declares the background so the dark surface covers the page", () => {
        // body keeps the light --background (white). Without this the dark
        // sections float on a white page and any gap shows the light theme.
        expect(source).toMatch(/className="dark[^"]*\bbg-background\b/);
      });
    });
  }

  it("no OTHER component scopes dark mode without re-declaring the colours", () => {
    // A future third forced-dark wrapper would silently reproduce the same
    // invisible-text bug, so the rule is enforced repo-wide rather than only on
    // the two known files.
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".tsx")) continue;
        const source = readFileSync(full, "utf-8");
        // `className="dark"` / `className="dark ..."` — the forced-scope form.
        // Ignores `dark:` variant utilities, which are unaffected.
        for (const match of source.matchAll(/className="(dark(?:\s[^"]*)?)"/g)) {
          const classList = match[1];
          if (!/\btext-foreground\b/.test(classList) || !/\bbg-background\b/.test(classList)) {
            offenders.push(`${full.replace(`${REPO_ROOT}/`, "")}: className="${classList}"`);
          }
        }
      }
    };

    walk(join(REPO_ROOT, "src"));

    expect(offenders).toEqual([]);
  });
});
