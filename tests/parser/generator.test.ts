import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { generateAll, generateAtomically } from "@/database/packages/dnd35-from-parser/tools/generator/index.ts";

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
        expect({ file, code: readFileSync(join(folder, file), "utf8") }).toEqual({
          file,
          code: readFileSync(join(GENERATED, file), "utf8"),
        });
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);

  test("leaves its folder as it was when a generation fails or throws, and replaces it when one succeeds", () => {
    const parent = mkdtempSync(join(tmpdir(), "generation-"));
    const folder = join(parent, "generated");
    const contentOf = (file: string) => readFileSync(join(folder, file), "utf8");
    try {
      mkdirSync(folder);
      writeFileSync(join(folder, "index.ts"), "before");
      const halfWrite = (copy: string) => {
        writeFileSync(join(copy, "index.ts"), "half");
        writeFileSync(join(copy, "items.ts"), "half");
      };

      expect(
        generateAtomically(folder, (copy) => {
          halfWrite(copy);
          return ["a reference failed"];
        }),
      ).toEqual(["a reference failed"]);
      expect(() =>
        generateAtomically(folder, (copy) => {
          halfWrite(copy);
          throw new Error("the generator broke");
        }),
      ).toThrow("the generator broke");
      expect(filesOf(folder)).toEqual(["index.ts"]);
      expect(contentOf("index.ts")).toBe("before");
      expect(readdirSync(parent)).toEqual(["generated"]);

      expect(
        generateAtomically(folder, (copy) => {
          writeFileSync(join(copy, "index.ts"), "after");
          return [];
        }),
      ).toEqual([]);
      expect(contentOf("index.ts")).toBe("after");
      expect(readdirSync(parent)).toEqual(["generated"]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
