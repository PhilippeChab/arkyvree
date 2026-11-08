import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/** What an agent reads before writing the client. */
const FRONTEND_DOC = readFileSync("docs/frontend.md", "utf8");

/** What an agent reads before writing any code: the repo's conventions, then the client's. */
const DOCS = readFileSync("AGENTS.md", "utf8") + FRONTEND_DOC;

/** What a doc's fenced block holds: a command to run, or a diagram. Never code, which a doc names, never copies. */
const FENCE_LANGUAGES = new Set(["bash", "mermaid", "sh", "text"]);

/** The values an index re-exports (its types aside): `export { A, b, type C } from "./x.ts"`'s `A` and `b`. */
function exportedValues(index: string) {
  return [...readFileSync(index, "utf8").matchAll(/export \{([^}]*)\}/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith("type "));
}

/** Each fenced block of a tracked markdown file that declares no language of `FENCE_LANGUAGES`: its `file:line`. */
async function codeFences() {
  const listed = Bun.spawn(["git", "ls-files", "*.md"], { stdout: "pipe" });
  const files = (await new Response(listed.stdout).text()).split("\n").filter(Boolean);
  return files.flatMap((file) => {
    const openings = readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, index) => {
        const fence = /^\s*```(.*)$/.exec(line);
        return fence ? [{ at: `${file}:${index + 1}`, language: fence[1].trim() }] : [];
      })
      // Fences open and close in turn: an opening is every other one
      .filter((_, index) => index % 2 === 0);
    return openings.filter(({ language }) => !FENCE_LANGUAGES.has(language)).map(({ at }) => at);
  });
}

describe("documentation", () => {
  // A doc that copies code drifts from it: it names the file and the symbol, which the reader opens
  test("no doc copies code: each fenced block is a command to run or a diagram", async () => {
    expect(await codeFences()).toEqual([]);
  });

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
