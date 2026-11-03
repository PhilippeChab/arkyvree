import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/** What an agent reads before writing the client. */
const FRONTEND_DOC = readFileSync("docs/frontend.md", "utf8");

/** What an agent reads before writing any code: the repo's conventions, then the client's. */
const DOCS = readFileSync("AGENTS.md", "utf8") + FRONTEND_DOC;

/** The values an index re-exports (its types aside): `export { A, b, type C } from "./x.ts"`'s `A` and `b`. */
function exportedValues(index: string) {
  return [...readFileSync(index, "utf8").matchAll(/export \{([^}]*)\}/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith("type "));
}

describe("documentation", () => {
  // A rule no doc names is a pattern an agent meets only as a lint error
  test("every lint rule of the repo is named in AGENTS.md or docs/frontend.md", () => {
    const rules = [...readFileSync(".oxlintrc.json", "utf8").matchAll(/"(arkyvree\/[a-z-]+)"/g)].map(
      (match) => match[1],
    );
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.filter((rule) => !DOCS.includes(rule))).toEqual([]);
  });

  // A shared piece no doc names is one an agent writes again
  test("every shared component and hook of the client is named in docs/frontend.md", () => {
    const names = [
      ...exportedValues("client/src/components/common/index.ts"),
      ...exportedValues("client/src/hooks/index.ts"),
    ];
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !new RegExp(`\\b${name}\\b`).test(FRONTEND_DOC))).toEqual([]);
  });
});
