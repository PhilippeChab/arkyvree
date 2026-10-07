import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GeneratedFolder } from "@/codegen/dnd3.5/tools/generator/GeneratedFolder.ts";
import { code, filesOf } from "@/tests/support/generatedFiles.ts";

describe("A generation", () => {
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
        GeneratedFolder.generateAtomically(folder, (copy) => {
          halfWrite(copy);
          return ["a reference failed"];
        }),
      ).toEqual(["a reference failed"]);
      expect(() =>
        GeneratedFolder.generateAtomically(folder, (copy) => {
          halfWrite(copy);
          throw new Error("the generator broke");
        }),
      ).toThrow("the generator broke");
      expect(filesOf(folder)).toEqual(["index.ts"]);
      expect(contentOf("index.ts")).toBe(code("before"));
      expect(readdirSync(parent)).toEqual(["generated"]);

      expect(
        GeneratedFolder.generateAtomically(folder, (copy) => {
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
        GeneratedFolder.generateAtomically(folder, (copy) => {
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
        GeneratedFolder.generateAtomically(folder, (copy) => {
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
        GeneratedFolder.generateAtomically(folder, (copy) => {
          writeFileSync(join(copy, "index.ts"), code("first"));
          expect(() => GeneratedFolder.generateAtomically(folder, () => [])).toThrow(
            "Another generation is running on this folder",
          );
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
