import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { toCamelCase } from "@/codegen/core/text/names.ts";
import References from "@/codegen/pf1/tools/references/References.ts";
import { CORE_SPELL_LIST_CLASSES, SPELL_COMPONENT_ABBREVIATIONS } from "@/codegen/pf1/tools/terms/spells.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import { SPELL_COMPONENTS } from "@/vocabulary/pf1/spells.ts";

describe("The spells' words", () => {
  test("name the Core Rulebook's classes, each one its book has", () => {
    for (const className of Object.values(CORE_SPELL_LIST_CLASSES))
      expect(existsSync(References.classPath(CORE_BOOK, toCamelCase(className)))).toBe(true);
  });

  test("abbreviate each of the vocabulary's components, and no other", () => {
    expect(Object.values(SPELL_COMPONENT_ABBREVIATIONS).toSorted()).toEqual([...SPELL_COMPONENTS].toSorted());
  });
});
