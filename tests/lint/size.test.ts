import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { MAX_OWN_LINES } from "@/lint/size.mjs";

import { lintRepo } from "./lintRepo.ts";

/** `n` statements, one per line. */
const statements = (n: number, indent = "  ") =>
  Array.from({ length: n }, (_, i) => `${indent}const v${i} = ${i};`).join("\n");

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("function-length", () => {
  test("a function holds at most its limit of its own lines: blank lines, comments and nested functions aside", async () => {
    expect(
      await lintRepo(
        {
          "server/ok.ts": `export function ok() {\n${statements(MAX_OWN_LINES - 2)}\n}\n`,
          "server/long.ts": `export function long() {\n${statements(MAX_OWN_LINES)}\n}\n`,
          "server/blank.ts": `export function blank() {\n${statements(MAX_OWN_LINES - 2)}\n\n  // a comment\n\n}\n`,
          // The callback holds the lines, not the function around it: it's the callback that's reported.
          "server/nested.ts": `export function outer() {\n  return run(() => {\n${statements(MAX_OWN_LINES, "    ")}\n  });\n}\n`,
          // Two methods, short alone, long together: the wrapper around their class counts none of them.
          "server/concern.ts": `export function Concern<B extends Constructor<Base>>(Base: B) {\n  abstract class Concerning extends Base {\n    a() {\n${statements(50, "      ")}\n    }\n    b() {\n${statements(50, "      ")}\n    }\n  }\n  return Concerning;\n}\n`,
          "client/src/long.ts": `export function long() {\n${statements(MAX_OWN_LINES)}\n}\n`,
        },
        ["function-length"],
      ),
    ).toEqual(["function-length server/long.ts", "function-length server/nested.ts"]);
  });
});
