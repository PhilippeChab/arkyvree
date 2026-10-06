import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { fixRepo, lines, lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("file layout", () => {
  test("a file reads its imports, types, constants, helpers, then what it's for", async () => {
    expect(
      await lintRepo(
        {
          // In order; a helper may call an export below it: functions are hoisted
          "server/a/ordered.ts": lines(
            'import { x } from "@/x.ts";',
            "type A = number;",
            "const N = 1;",
            "function helper() {",
            "  return build(2);",
            "}",
            "export function build(a: A) {",
            "  return a + N + x;",
            "}",
            "export const main = () => helper();",
          ),
          // A script runs last, in a function it calls
          "scripts/main.ts": lines(
            "const URL = process.env.X;",
            "async function main() {",
            "  check(URL);",
            "  go(connect(URL));",
            "}",
            "await main();",
          ),
          // Declared after a step of its run
          "scripts/run.ts": lines("const URL = process.env.X;", "check(URL);", "const db = connect(URL);", "go(db);"),
          // A constant one of the file's functions builds, and one the file keeps built from one it exports
          "server/a/built.ts": lines("function f() {", "  return 1;", "}", "export const N = f();"),
          "server/a/fromExport.ts": lines("export const A = 1;", "const B = A + 1;", "export const f = () => B;"),
          // A module runs nothing as it loads; a script marked a module by `export {}` runs
          "server/a/runs.ts": lines("export function f() {", "  return 1;", "}", "f();"),
          "scripts/marked.ts": lines("async function main() {}", "export {};", "await main();"),
          // What a tool writes is held like the rest
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
      "file-layout database/packages/p/generated/feats.ts",
      "file-layout scripts/run.ts",
      "file-layout scripts/run.ts",
      "file-layout server/a/built.ts",
      "file-layout server/a/fromExport.ts",
      "file-layout server/a/runs.ts",
      "file-layout server/a/type.ts",
      "file-layout shared/constant.ts",
      "file-layout tests/a.test.ts",
    ]);
  });

  test("--fix puts a file's own types and constants before its exported ones, a constant below one it reads", async () => {
    const out = await fixRepo(
      {
        "shared/exports.ts": lines(
          "export type Shape = { n: number };",
          "",
          "type Local = { s: string };",
          "",
          "export interface Size {",
          "  w: number;",
          "}",
          "",
          "export const BASE = 1;",
          "",
          "export const DOUBLED = BASE * 2;",
          "",
          "const LOCAL = 3;",
          "",
          "export const TOTAL = LOCAL + 1;",
          "",
          "export function f(s: Shape, l: Local, z: Size) {",
          "  return [s, l, z, DOUBLED, TOTAL];",
          "}",
        ),
      },
      ["file-layout"],
      4,
    );
    expect(out["shared/exports.ts"]).toBe(
      lines(
        "type Local = { s: string };",
        "",
        "export type Shape = { n: number };",
        "",
        "export interface Size {",
        "  w: number;",
        "}",
        "",
        "const LOCAL = 3;",
        "",
        "export const BASE = 1;",
        "",
        "export const DOUBLED = BASE * 2;",
        "",
        "export const TOTAL = LOCAL + 1;",
        "",
        "export function f(s: Shape, l: Local, z: Size) {",
        "  return [s, l, z, DOUBLED, TOTAL];",
        "}",
      ),
    );
  });

  test("--fix orders a file, keeping a statement above what uses it and its comments with it, a #! line first, but nothing after a step", async () => {
    const out = await fixRepo(
      {
        "server/a.ts": lines(
          'import { x } from "@/x.ts";',
          "",
          "/** The entry. */",
          "export function main(s: Shape) {",
          "  return helper(s.n);",
          "}",
          "",
          "// Shared",
          "function helper(n: number) {",
          "  return n * LIMIT + x;",
          "}",
          "",
          "type Shape = { n: number }; // why",
          "",
          "const LIMIT = 3;",
        ),
        "scripts/b.ts": lines(
          "#!/usr/bin/env bun",
          "go(f());",
          "function f() {",
          "  return 1;",
          "}",
          "type T = number;",
        ),
        "scripts/c.ts": lines("#!/usr/bin/env bun", "function f() {", "  return 1;", "}", "type T = number;"),
      },
      ["file-layout"],
      4,
    );
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
        "/** The entry. */",
        "export function main(s: Shape) {",
        "  return helper(s.n);",
        "}",
      ),
    );
    // A `#!` line stays first
    expect(out["scripts/c.ts"]).toBe(
      lines("#!/usr/bin/env bun", "type T = number;", "", "function f() {", "  return 1;", "}"),
    );
    // A script's steps run in order: what follows one is reported, and moved by hand
    expect(out["scripts/b.ts"]).toBe(
      lines("#!/usr/bin/env bun", "go(f());", "function f() {", "  return 1;", "}", "type T = number;"),
    );
  });

  test("--fix never changes the order code runs in, and a directive prologue opens a file", async () => {
    const running = lines(
      "export const A = await a();",
      "",
      "const B = await b();",
      "",
      "export function f() {",
      "  return A + B;",
      "}",
    );
    // A class's `extends` and an `export default` value run too
    const extending = lines(
      "export class Repo extends make() {}",
      "",
      "const B = compute();",
      "",
      "export const C = B;",
    );
    const defaulting = lines("export default defineConfig({});", "", "const B = compute();");
    const out = await fixRepo(
      {
        "server/running.ts": running,
        "server/extending.ts": extending,
        "server/defaulting.ts": defaulting,
      },
      ["file-layout"],
      4,
    );
    // Own before exported would run `b()` first: reported, never fixed
    expect(out["server/running.ts"]).toBe(running);
    expect(out["server/extending.ts"]).toBe(extending);
    expect(out["server/defaulting.ts"]).toBe(defaulting);
    expect(await lintRepo({ "server/running.ts": running }, ["file-layout"])).toEqual([
      "file-layout server/running.ts",
    ]);
    expect(
      await lintRepo({ "server/strict.ts": lines('"use strict";', "const N = 1;", "export const f = () => N;") }, [
        "file-layout",
      ]),
    ).toEqual([]);
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
    const out = (await fixRepo({ "tests/a.test.ts": source }, ["file-layout"], 4))["tests/a.test.ts"];
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
