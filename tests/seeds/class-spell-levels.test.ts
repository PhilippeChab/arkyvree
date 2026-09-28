import { expect, test } from "bun:test";
import { buildClassSpellLevels } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES as DMG_CLASSES } from "@/database/packages/dnd35-from-parser/generated/dmg/classes/index.ts";
import { ALL_CLASSES as SRD_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";

const srd = buildClassSpellLevels(SRD_CLASSES);
const dmg = buildClassSpellLevels(DMG_CLASSES);

// The class level each spell level opens at. Classes without cantrips start at spell level 1.
test.each([
  ["a full caster", srd.Wizard, { 0: 1, 1: 1, 2: 3, 5: 9, 9: 17 }],
  ["a paladin", srd.Paladin, { 1: 4, 2: 8, 3: 11, 4: 14 }],
  ["a ranger", srd.Ranger, { 1: 4, 2: 8, 3: 11, 4: 14 }],
  ["an assassin", dmg.Assassin, { 1: 1, 2: 3 }],
])("buildClassSpellLevels opens %s's spell levels", (_, levels, expected) => {
  expect(levels).toMatchObject(expected);
});

test("buildClassSpellLevels stops at a half caster's last spell level, and leaves out classes without spells", () => {
  expect(5 in srd.Paladin || 5 in srd.Ranger).toBe(false);
  expect(["Fighter", "Rogue"].filter((klass) => klass in srd)).toEqual([]);
});
