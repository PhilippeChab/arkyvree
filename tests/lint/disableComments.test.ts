import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { parse, type ParserPlugin } from "@babel/parser";

/** A comment that turns a lint rule off, or silences TypeScript. */
const DIRECTIVE = /^\s*(?:(?:eslint|oxlint)-(?:disable|enable)|@ts-(?:expect-error|ignore|nocheck))/;

/** Each tracked source file, by the parser plugins its extension needs. */
async function sourceFiles() {
  const listed = Bun.spawn(["git", "ls-files", "-z", "*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs"], { stdout: "pipe" });
  const files = (await new Response(listed.stdout).text()).split("\0").filter(Boolean);
  return files.map((file): [string, ParserPlugin[]] => [
    file,
    file.endsWith(".tsx") ? ["typescript", "jsx"] : file.endsWith(".ts") ? ["typescript"] : [],
  ]);
}

describe("disable comments", () => {
  // `arkyvree/no-disable-comments` and `ban-ts-comment` run in oxlint, which a comment can turn off: an
  // `oxlint-disable` naming them, or none, at a file's top. This reads every tracked file's comments outside it.
  test("no tracked file turns a lint rule off or silences TypeScript", async () => {
    const found: string[] = [];
    for (const [file, plugins] of await sourceFiles()) {
      const { comments } = parse(readFileSync(file, "utf8"), { sourceType: "module", plugins });
      for (const comment of comments ?? [])
        if (DIRECTIVE.test(comment.value)) found.push(`${file}:${comment.loc?.start.line}`);
    }
    expect(found).toEqual([]);
  });
});
