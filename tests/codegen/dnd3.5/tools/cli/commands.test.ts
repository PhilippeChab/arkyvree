/**
 * The 3.5 parser's commands find their files: what `package.json` runs, what a command runs in turn
 * (`parser:dnd3.5:sync`), and the command the generated files name.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Generator } from "@/codegen/dnd3.5/tools/generator/Generator.ts";

const CLI_DIR = join(import.meta.dirname, "../../../../../codegen/dnd3.5/tools/cli");
const ROOT = join(import.meta.dirname, "../../../../..");

/** The scripts `package.json` runs, by name. */
function readScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
}

describe("The parser's commands", () => {
  test("are scripts that exist", () => {
    const files = Object.entries(readScripts())
      .filter(([name]) => name.startsWith("parser:dnd3.5:"))
      .map(([, command]) => /^bun (\S+\.ts)/.exec(command)?.[1]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file && existsSync(join(ROOT, file))).toBe(true);
  });

  test("name the generator's script in what it generates", () => {
    expect(readScripts()[Generator.COMMAND]).toBe("bun codegen/dnd3.5/tools/cli/generate.ts");
  });

  test("run the commands beside them", () => {
    const spawned = readdirSync(CLI_DIR).flatMap((file) =>
      [...readFileSync(join(CLI_DIR, file), "utf8").matchAll(/join\(import\.meta\.dirname!, "([^"]+\.ts)"\)/g)].map(
        ([, target]) => target,
      ),
    );
    expect(spawned).toEqual(expect.arrayContaining(["generate.ts", "scrape.ts"]));
    for (const target of spawned) expect(existsSync(join(CLI_DIR, target))).toBe(true);
  });
});
