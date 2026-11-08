import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/** What the config's `no-restricted-imports` takes, as far as this test reads it. */
interface ImportBans {
  paths: unknown[];
  patterns: { group: string[]; message: string }[];
}

/** What this test reads of `.oxlintrc.json`. */
interface LintConfig {
  overrides: { files: string[]; rules: Record<string, unknown> }[];
  rules: { "no-restricted-imports": [string, ImportBans] };
}

/** The repo's lint config, its comments aside. */
const CONFIG = Bun.JSONC.parse(readFileSync(".oxlintrc.json", "utf8")) as LintConfig;

/** Each page domain: a folder of `client/src/pages/`. */
const PAGES = readdirSync("client/src/pages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** The `no-restricted-imports` of the override of `page`'s files alone, if it has one. */
function overrideOf(page: string) {
  const files = JSON.stringify([`client/src/pages/${page}/**/*.{ts,tsx}`]);
  return CONFIG.overrides.find((override) => JSON.stringify(override.files) === files)?.rules["no-restricted-imports"];
}

describe("page domains", () => {
  // An override's options replace the base's: a page folder without one imports any other page's code, and one
  // missing from another's group is imported by it
  test("each page folder has an override that bans every other page folder, and keeps the base's bans on MUI", () => {
    const [, base] = CONFIG.rules["no-restricted-imports"];
    const subpaths = base.patterns.filter((pattern) => pattern.group.includes("@mui/material/*"));
    expect(subpaths.length).toBe(1);
    expect(PAGES.length).toBeGreaterThan(1);
    const banned = (page: string) => {
      const group = PAGES.filter((other) => other !== page).map((other) => `@/client/src/pages/${other}/**`);
      const domains = { group, message: "Pages must not import from other page domains." };
      return ["error", { paths: base.paths, patterns: [domains, ...subpaths] }];
    };
    expect(PAGES.filter((page) => !Bun.deepEquals(overrideOf(page), banned(page)))).toEqual([]);
  });
});
