import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { generateAll } from "@/database/packages/dnd35-from-parser/tools/generator/index.ts";

const GENERATED = join(import.meta.dirname, "../../database/packages/dnd35-from-parser/generated");

/** The files under `folder`, by their path in it. */
const filesOf = (folder: string) =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
    .sort();

describe("The generator", () => {
  test("writes, from the committed references, exactly the committed generated files", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    try {
      expect(generateAll({}, folder)).toEqual([]);
      expect(filesOf(folder)).toEqual(filesOf(GENERATED));
      for (const file of filesOf(GENERATED)) {
        expect({ file, code: readFileSync(join(folder, file), "utf8") }).toEqual({ file, code: readFileSync(join(GENERATED, file), "utf8") });
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);
});
