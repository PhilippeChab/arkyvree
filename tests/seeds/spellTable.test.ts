import { describe, expect, test } from "bun:test";

import { ALL_CLASSES as DMG_CLASSES } from "@/content/dnd3.5/generated/dmg/classes/index.ts";
import { ALL_CLASSES as SRD_CLASSES } from "@/content/dnd3.5/generated/srd/classes/index.ts";
import { findSpellcastingClass, getClassSpellLevels } from "@/database/packages/dnd35/seed/spellTable.ts";

/** The class level each of a class's spell levels opens at. */
function spellLevels(classes: typeof SRD_CLASSES, name: string) {
  return getClassSpellLevels(findSpellcastingClass(classes, name).spells);
}

describe("A class's spell levels", () => {
  // Classes without cantrips start at spell level 1.
  test.each([
    ["a full caster", SRD_CLASSES, "Wizard", { 0: 1, 1: 1, 2: 3, 5: 9, 9: 17 }],
    ["a paladin", SRD_CLASSES, "Paladin", { 1: 4, 2: 8, 3: 11, 4: 14 }],
    ["a ranger", SRD_CLASSES, "Ranger", { 1: 4, 2: 8, 3: 11, 4: 14 }],
    ["an assassin", DMG_CLASSES, "Assassin", { 1: 1, 2: 3 }],
  ] as const)("open at the class levels %s's table first gives them slots", (_, classes, name, expected) => {
    expect(spellLevels([...classes], name)).toMatchObject(expected);
  });

  test("stop at a half caster's last spell level", () => {
    expect(5 in spellLevels(SRD_CLASSES, "Paladin") || 5 in spellLevels(SRD_CLASSES, "Ranger")).toBe(false);
  });

  test("are a spellcasting class's only", () => {
    expect(() => findSpellcastingClass(SRD_CLASSES, "Fighter")).toThrow("Fighter isn't a spellcasting class");
  });
});
