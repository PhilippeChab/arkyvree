import { describe, expect, test } from "bun:test";
import { buildClassSpellLevels } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES as SRD_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";
import { ALL_CLASSES as DMG_CLASSES } from "@/database/packages/dnd35-from-parser/generated/dmg/classes/index.ts";

describe("buildClassSpellLevels", () => {
  const srdLevels = buildClassSpellLevels(SRD_CLASSES);
  const dmgLevels = buildClassSpellLevels(DMG_CLASSES);

  test("full casters get spells at standard levels", () => {
    // Wizard: level 0 at 1, level 1 at 1, level 2 at 3, ..., level 9 at 17
    const wiz = srdLevels["Wizard"];
    expect(wiz[0]).toBe(1);
    expect(wiz[1]).toBe(1);
    expect(wiz[2]).toBe(3);
    expect(wiz[5]).toBe(9);
    expect(wiz[9]).toBe(17);
  });

  test("paladin gets spells later than full casters", () => {
    // Paladin perDay: [], [], [], [0], [0], [1], ...
    // noCantrips: true — index 0 = spell level 1
    // perDay[3] = [0] means level 4 has spell level 1 (0 base, bonus from Wis)
    const pal = srdLevels["Paladin"];
    expect(pal[1]).toBe(4);
    expect(pal[2]).toBe(8);
    expect(pal[3]).toBe(11);
    expect(pal[4]).toBe(14);
    expect(pal[5]).toBeUndefined();
  });

  test("ranger gets spells later than full casters", () => {
    // Same progression as paladin
    const rng = srdLevels["Ranger"];
    expect(rng[1]).toBe(4);
    expect(rng[2]).toBe(8);
    expect(rng[3]).toBe(11);
    expect(rng[4]).toBe(14);
    expect(rng[5]).toBeUndefined();
  });

  test("assassin gets spells at correct partial caster levels", () => {
    const assassin = dmgLevels["Assassin"];
    expect(assassin).toBeDefined();
    // Assassin perDay: [0], [1], [2,0], [3,1], [3,2,0], ...
    // noCantrips: true, so index 0 = spell level 1
    expect(assassin[1]).toBe(1);  // perDay[0] = [0] — spell level 1 at class level 1
    expect(assassin[2]).toBe(3);  // perDay[2] = [2,0] — spell level 2 at class level 3
  });

  test("non-caster classes are not in the map", () => {
    expect(srdLevels["Fighter"]).toBeUndefined();
    expect(srdLevels["Rogue"]).toBeUndefined();
  });
});
