import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GeneratedFolder } from "@/codegen/core/GeneratedFolder.ts";
import { Generator } from "@/codegen/dnd3.5/tools/generator/Generator.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { code, filesOf } from "@/tests/support/generatedFiles.ts";

const GENERATED = join(import.meta.dirname, "../../../../../content/dnd3.5/generated");

/** That `folder` holds the committed generated files, each as it's committed. */
function expectCommitted(folder: string) {
  expect(filesOf(folder)).toEqual(filesOf(GENERATED));
  for (const file of filesOf(GENERATED)) {
    expect({ file, code: readFileSync(join(folder, file), "utf8") }).toEqual({
      file,
      code: readFileSync(join(GENERATED, file), "utf8"),
    });
  }
}

describe("The generator", () => {
  test("writes, from the committed references, exactly the committed generated files", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    try {
      // As `parser:generate` writes them: generated in a copy, formatted, then swapped in
      expect(GeneratedFolder.generateAtomically(folder, (copy) => new Generator(copy, true).generateAll({}))).toEqual(
        [],
      );
      expectCommitted(folder);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);

  test("writes, from one reference, what generating them all wrote", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    try {
      cpSync(GENERATED, folder, { recursive: true });
      // A reference regenerates its whole book: what its references make together (its indexes, its aptitudes) too
      const references = [
        "srd/items.json",
        "srd/classes/wizard.json",
        "srd/domains.json",
        "complete-divine/domains.json",
      ];
      expect(
        GeneratedFolder.generateAtomically(folder, (copy) => {
          const generator = new Generator(copy, true);
          return references.flatMap((reference) => generator.generateReference(join(References.dir, reference)));
        }),
      ).toEqual([]);
      expectCommitted(folder);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);

  test("removes the files of a book it generates that it no longer makes, and leaves the other books'", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    try {
      cpSync(GENERATED, folder, { recursive: true });
      for (const book of ["srd", "complete-divine"]) writeFileSync(join(folder, book, "classes/retired.ts"), code("x"));
      expect(
        GeneratedFolder.generateAtomically(folder, (copy) =>
          new Generator(copy, true).generateReference(join(References.dir, "srd/classes/wizard.json")),
        ),
      ).toEqual([]);
      expect(filesOf(folder).filter((file) => file.endsWith("retired.ts"))).toEqual([
        "complete-divine/classes/retired.ts",
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);

  test("refuses a reference file outside the references, whose edits it would ignore", () => {
    const folder = mkdtempSync(join(tmpdir(), "reference-"));
    try {
      const copy = join(folder, "wizard.json");
      cpSync(join(References.dir, "srd/classes/wizard.json"), copy);
      expect(() => new Generator(folder, true).generateReference(copy)).toThrow("isn't a reference file");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
