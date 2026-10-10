/** The parser's commands find their files: what `package.json` runs, and what a command runs in turn (`parser:sync`). */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLI_DIR = join(import.meta.dirname, "../../../../../codegen/dnd3.5/tools/cli");
const ROOT = join(import.meta.dirname, "../../../../..");

describe("The parser's commands", () => {
  test("are scripts that exist", () => {
    const { scripts }: { scripts: Record<string, string> } = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    );
    const files = Object.entries(scripts)
      .filter(([name]) => name.startsWith("parser:"))
      .map(([, command]) => /^bun (\S+\.ts)/.exec(command)?.[1]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file && existsSync(join(ROOT, file))).toBe(true);
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
