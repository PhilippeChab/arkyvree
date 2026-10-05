import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { lintRepo, runOxlint } from "./lintRepo.ts";

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
    JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/file-layout": "error" } }),
  );
  for (let pass = 0; pass < 4; pass++) await runOxlint(["-c", config, "--fix", dir]);
  const out = Object.fromEntries(
    Object.keys(files).map((file) => [file, fs.readFileSync(path.join(dir, file), "utf8")]),
  );
  fs.rmSync(dir, { recursive: true });
  return out;
}

const lines = (...rows: string[]) => rows.join("\n") + "\n";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("file layout", () => {
  test("a file reads its imports, types, constants, helpers, then what it's for", async () => {
    expect(
      await lintRepo(
        {
          // In order; a constant a helper builds sits with the helpers, an export a helper calls is one
          "server/a/ordered.ts": lines(
            'import { x } from "@/x.ts";',
            "type A = number;",
            "const N = 1;",
            "export function build(a: A) {",
            "  return a + N + x;",
            "}",
            "function helper() {",
            "  return build(2);",
            "}",
            "const TABLE = helper();",
            "export const main = () => TABLE;",
          ),
          // A script: what follows its first effect is its run
          "scripts/run.ts": lines("const URL = process.env.X;", "check(URL);", "const db = connect(URL);", "go(db);"),
          // What a tool writes keeps its layout
          "database/packages/p/generated/feats.ts": lines("export const a = () => 1;", "type B = number;"),
          // Out of order: a type below a constant, a constant below a helper, a helper below an export
          "server/a/type.ts": lines("const N = 1;", "type A = number;"),
          "shared/constant.ts": lines("function f() {", "  return 1;", "}", "const N = 1;", "export { f, N };"),
          "client/src/helper.tsx": lines(
            "export function C() {",
            "  return h();",
            "}",
            "function h() {",
            "  return 1;",
            "}",
          ),
          // A test file's helper in a `describe`
          "tests/a.test.ts": lines('describe("a", () => {', "  function h() {}", '  test("t", h);', "});"),
        },
        ["file-layout"],
      ),
    ).toEqual([
      "file-layout client/src/helper.tsx",
      "file-layout server/a/type.ts",
      "file-layout shared/constant.ts",
      "file-layout tests/a.test.ts",
    ]);
  });

  test("--fix orders a file, keeping a statement above what uses it, its comments with it and a #! line first", async () => {
    const out = await fixed({
      "server/a.ts": lines(
        'import { x } from "@/x.ts";',
        "",
        "/** The entry. */",
        "export function main(s: Shape) {",
        "  return helper(s.n) + TABLE;",
        "}",
        "",
        "// Shared",
        "function helper(n: number) {",
        "  return n * LIMIT + x;",
        "}",
        "",
        "const TABLE = helper(2);",
        "",
        "type Shape = { n: number }; // why",
        "",
        "const LIMIT = 3;",
      ),
      "scripts/b.ts": lines("#!/usr/bin/env bun", "go(f());", "function f() {", "  return 1;", "}", "type T = number;"),
    });
    expect(out["server/a.ts"]).toBe(
      lines(
        'import { x } from "@/x.ts";',
        "",
        "type Shape = { n: number }; // why",
        "",
        "const LIMIT = 3;",
        "",
        "// Shared",
        "function helper(n: number) {",
        "  return n * LIMIT + x;",
        "}",
        "",
        "const TABLE = helper(2);",
        "",
        "/** The entry. */",
        "export function main(s: Shape) {",
        "  return helper(s.n) + TABLE;",
        "}",
      ),
    );
    expect(out["scripts/b.ts"]).toBe(
      lines("#!/usr/bin/env bun", "type T = number;", "", "function f() {", "  return 1;", "}", "", "go(f());"),
    );
  });

  test("--fix lifts a helper out of a `describe`, unless it uses the block's names or its name is taken", async () => {
    const source = lines(
      'describe("a", () => {',
      "  const owner = 1;",
      "",
      "  /** Makes one. */",
      "  async function make() {",
      "    return 2;",
      "  }",
      "",
      "  const withOwner = () => owner;",
      "",
      '  test("t", async () => expect(await make()).toBe(withOwner() + 1));',
      "});",
      "",
      'describe("b", () => {',
      "  const twin = () => 1;",
      '  test("t", () => expect(twin()).toBe(1));',
      "});",
      "",
      'describe("c", () => {',
      "  const twin = () => 2;",
      '  test("t", () => expect(twin()).toBe(2));',
      "});",
    );
    const out = (await fixed({ "tests/a.test.ts": source }))["tests/a.test.ts"];
    expect(out).toStartWith(lines("/** Makes one. */", "async function make() {", "  return 2;", "}", ""));
    expect(out).toContain("  const withOwner = () => owner;");
    expect(out.match(/^ {2}const twin/gm)).toHaveLength(2);
    expect(await lintRepo({ "tests/a.test.ts": out }, ["file-layout"])).toEqual([
      "file-layout tests/a.test.ts",
      "file-layout tests/a.test.ts",
      "file-layout tests/a.test.ts",
    ]);
  });
});
