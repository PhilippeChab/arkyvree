import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { parse, type ParserPlugin } from "@babel/parser";

/**
 * What a comment that turns a lint rule off, or silences TypeScript, holds. A comment's text is its file's, so a file
 * whose text holds none of it has no such comment, and needs no parsing: most don't (the generated books among them).
 */
const DIRECTIVE_TEXT = /(?:eslint|oxlint)-(?:disable|enable)|@ts-(?:expect-error|ignore|nocheck)/;

/** A comment that turns a lint rule off, or silences TypeScript. */
const DIRECTIVE = new RegExp(`^\\s*(?:${DIRECTIVE_TEXT.source})`);

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
    const files = await sourceFiles();
    expect(files.length).toBeGreaterThan(0);
    const found: string[] = [];
    for (const [file, plugins] of files) {
      const source = readFileSync(file, "utf8");
      if (!DIRECTIVE_TEXT.test(source)) continue;
      const { comments } = parse(source, { sourceType: "module", plugins });
      for (const comment of comments ?? [])
        if (DIRECTIVE.test(comment.value)) found.push(`${file}:${comment.loc?.start.line}`);
    }
    expect(found).toEqual([]);
  });
});
