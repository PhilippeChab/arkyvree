import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { generateAtomically } from "@/database/packages/dnd35-from-parser/tools/generator/atomicGeneration.ts";
import { Generator } from "@/database/packages/dnd35-from-parser/tools/generator/Generator.ts";

const GENERATED = join(import.meta.dirname, "../../database/packages/dnd35-from-parser/generated");

/** A file's code as the generator leaves it, formatted: the swap formats what a generation writes. */
function code(value: string) {
  return `export const value = "${value}";\n`;
}

/** The files under `folder`, by their path in it. */
function filesOf(folder: string) {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
    .sort();
}

describe("The generator", () => {
  test("writes, from the committed references, exactly the committed generated files", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    try {
      // As `parser:generate` writes them: generated in a copy, formatted, then swapped in
      expect(generateAtomically(folder, (copy) => new Generator(copy, true).generateAll({}))).toEqual([]);
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
      writeFileSync(join(folder, "index.ts"), code("before"));
      const halfWrite = (copy: string) => {
        writeFileSync(join(copy, "index.ts"), code("half"));
        writeFileSync(join(copy, "items.ts"), code("half"));
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
      expect(contentOf("index.ts")).toBe(code("before"));
      expect(readdirSync(parent)).toEqual(["generated"]);

      expect(
        generateAtomically(folder, (copy) => {
          writeFileSync(join(copy, "index.ts"), code("after"));
          return [];
        }),
      ).toEqual([]);
      expect(contentOf("index.ts")).toBe(code("after"));
      expect(readdirSync(parent)).toEqual(["generated"]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("drops the files a generation removes, and recovers what a killed run left", () => {
    const parent = mkdtempSync(join(tmpdir(), "generation-"));
    const folder = join(parent, "generated");
    try {
      // Killed mid-swap: the tree only as the previous one, and a stale copy
      mkdirSync(`${folder}.previous`);
      writeFileSync(join(`${folder}.previous`, "index.ts"), code("before"));
      writeFileSync(join(`${folder}.previous`, "domainFeats.ts"), code("stale"));
      mkdirSync(`${folder}.next`);
      writeFileSync(join(`${folder}.next`, "junk.ts"), code("junk"));

      expect(
        generateAtomically(folder, (copy) => {
          rmSync(join(copy, "domainFeats.ts"));
          return [];
        }),
      ).toEqual([]);
      expect(filesOf(folder)).toEqual(["index.ts"]);
      expect(readFileSync(join(folder, "index.ts"), "utf8")).toBe(code("before"));
      expect(readdirSync(parent)).toEqual(["generated"]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("puts the folder back when the swap fails", () => {
    const parent = mkdtempSync(join(tmpdir(), "generation-"));
    const folder = join(parent, "generated");
    try {
      mkdirSync(folder);
      writeFileSync(join(folder, "index.ts"), code("before"));
      // The copy gone, the second rename of the swap fails
      expect(() =>
        generateAtomically(folder, (copy) => {
          rmSync(copy, { recursive: true });
          return [];
        }),
      ).toThrow("ENOENT");
      expect(readFileSync(join(folder, "index.ts"), "utf8")).toBe(code("before"));
      expect(readdirSync(parent)).toEqual(["generated"]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("refuses a second generation on the same folder while one runs", () => {
    const parent = mkdtempSync(join(tmpdir(), "generation-"));
    const folder = join(parent, "generated");
    try {
      mkdirSync(folder);
      writeFileSync(join(folder, "index.ts"), code("before"));
      expect(
        generateAtomically(folder, (copy) => {
          writeFileSync(join(copy, "index.ts"), code("first"));
          expect(() => generateAtomically(folder, () => [])).toThrow("Another generation is running on this folder");
          writeFileSync(join(copy, "items.ts"), code("first"));
          return [];
        }),
      ).toEqual([]);
      expect(filesOf(folder)).toEqual(["index.ts", "items.ts"]);
      expect(readFileSync(join(folder, "index.ts"), "utf8")).toBe(code("first"));
      expect(readdirSync(parent)).toEqual(["generated"]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
