import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { lintRepo, runOxlint } from "./lintRepo.ts";

function lines(...rows: string[]) {
  return rows.join("\n") + "\n";
}

/** What `oxlint --fix` makes of each file, run until it settles. */
async function fixed(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), source);
  }
  const config = path.join(dir, ".oxlintrc.json");
  fs.writeFileSync(
    config,
    JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/comment-style": "error" } }),
  );
  for (let pass = 0; pass < 3; pass++) await runOxlint(["-c", config, "--fix", dir]);
  const out = Object.fromEntries(
    Object.keys(files).map((file) => [file, fs.readFileSync(path.join(dir, file), "utf8")]),
  );
  fs.rmSync(dir, { recursive: true });
  return out;
}

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("comment style", () => {
  test("--fix writes a description as one `/** … */` right above what it describes, and a comment in code as `//`", async () => {
    const out = await fixed({
      "scripts/a.ts": lines(
        "#!/usr/bin/env bun",
        "// The file's opening comment, on its first import.",
        'import { x } from "./x.ts";',
        "",
        "// A constant's description,",
        "// on two lines.",
        "const N = x;",
        "",
        "/* A block that describes a function. */",
        "// oxlint-disable-next-line no-console -- a directive sits between",
        "function f() {",
        "  /* in code */",
        "  return N;",
        "}",
        "",
        "/** Describes a call, not a declaration. */",
        "console.log(f());",
      ),
      "client/b.tsx": lines(
        "export function B() {",
        "  // ── A title in code ──",
        "  return <p>{/* JSX's own */}</p>;",
        "}",
      ),
    });
    expect(out["scripts/a.ts"]).toBe(
      lines(
        "#!/usr/bin/env bun",
        "/** The file's opening comment, on its first import. */",
        "",
        'import { x } from "./x.ts";',
        "",
        "/** A constant's description, on two lines. */",
        "const N = x;",
        "",
        "/** A block that describes a function. */",
        "// oxlint-disable-next-line no-console -- a directive sits between",
        "function f() {",
        "  // in code",
        "  return N;",
        "}",
        "",
        "// Describes a call, not a declaration.",
        "console.log(f());",
      ),
    );
    expect(out["client/b.tsx"]).toBe(
      lines("export function B() {", "  // A title in code", "  return <p>{/* JSX's own */}</p>;", "}"),
    );
  });

  test("a heading, and a comment apart from what it describes, are reported and placed by hand", async () => {
    const source = lines(
      'import { a } from "./a.ts";',
      "// Among the imports, which sorting them moves",
      'import { b } from "./b.ts";',
      "",
      "// ── A section ──",
      "",
      "function f() {",
      "  // Apart from its code",
      "",
      "  return a + b;",
      "}",
      "",
      "// An orphan",
      "",
      "export function g() {",
      "  return f();",
      "}",
    );
    expect(await lintRepo({ "server/c.ts": source }, ["comment-style"])).toEqual(
      Array(4).fill("comment-style server/c.ts"),
    );
    expect((await fixed({ "server/c.ts": source }))["server/c.ts"]).toBe(source);
  });

  test("a doc comment is wrapped to 120 columns, keeping a list's lines and a new sentence's", async () => {
    const out = await fixed({
      "server/d.ts": lines(
        "// A long description that an older formatter wrapped at eighty columns, so its lines are",
        "// shorter than the ones the formatter writes today, which this one joins and wraps again.",
        "//   - a list item stays on its line",
        "// Index 0 starts a sentence of its own (no Str 0)",
        "export const N = 1;",
      ),
    });
    expect(out["server/d.ts"]).toBe(
      lines(
        "/**",
        " * A long description that an older formatter wrapped at eighty columns, so its lines are shorter than the ones the",
        " * formatter writes today, which this one joins and wraps again.",
        " *   - a list item stays on its line",
        " * Index 0 starts a sentence of its own (no Str 0)",
        " */",
        "export const N = 1;",
      ),
    );
  });
});
