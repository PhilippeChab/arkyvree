import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GeneratedFolder } from "@/codegen/core/GeneratedFolder.ts";
import { Generator } from "@/codegen/pf1/tools/generator/Generator.ts";
import { filesOf } from "@/tests/support/generatedFiles.ts";

const GENERATED = join(import.meta.dirname, "../../../../../content/pf1/generated");

/** The Core Rulebook's files, past each kind's own (its classes', its class feats', its spell levels'). */
const LAYOUT = [
  "core-rulebook/aptitudes.ts",
  "core-rulebook/classes/index.ts",
  "core-rulebook/cowFeats.ts",
  "core-rulebook/cowSpells.ts",
  "core-rulebook/domains.ts",
  "core-rulebook/feats/classes/index.ts",
  "core-rulebook/feats/feats.ts",
  "core-rulebook/feats/index.ts",
  "core-rulebook/index.ts",
  "core-rulebook/items/armor.ts",
  "core-rulebook/items/exoticWeapons.ts",
  "core-rulebook/items/goods.ts",
  "core-rulebook/items/index.ts",
  "core-rulebook/items/magicArmor.ts",
  "core-rulebook/items/magicShields.ts",
  "core-rulebook/items/magicWeapons.ts",
  "core-rulebook/items/martialWeapons.ts",
  "core-rulebook/items/rings.ts",
  "core-rulebook/items/rods.ts",
  "core-rulebook/items/shields.ts",
  "core-rulebook/items/simpleWeapons.ts",
  "core-rulebook/items/staffs.ts",
  "core-rulebook/items/wondrousItems.ts",
  "core-rulebook/races.ts",
  "core-rulebook/spells/index.ts",
];

describe("The generator", () => {
  test("writes the Core Rulebook's tree from its references, exactly the committed generated files", async () => {
    const folder = mkdtempSync(join(tmpdir(), "pf1-generated-"));
    try {
      // As `parser:pf1:generate` writes them: generated in a copy, formatted, then swapped in
      expect(
        await GeneratedFolder.generateAtomically(folder, (copy) => new Generator(copy, true).generateAll({})),
      ).toEqual([]);
      const files = filesOf(folder);
      expect(LAYOUT.filter((file) => !files.includes(file))).toEqual([]);
      expect(files).toEqual(filesOf(GENERATED));
      for (const file of files) {
        expect({ file, code: readFileSync(join(folder, file), "utf8") }).toEqual({
          file,
          code: readFileSync(join(GENERATED, file), "utf8"),
        });
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 120_000);
});
