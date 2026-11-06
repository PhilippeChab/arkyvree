import { describe, expect, test } from "bun:test";

import { buildCharacter } from "@/tests/support/dnd5.2/characters.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";

/** Each saving throw's total, by its ability's slug. */
function savesOf(built: Awaited<ReturnType<typeof seeded>>) {
  return Object.fromEntries(
    Object.entries(built.components.saves.getSaves()).map(([slug, { total }]) => [slug, total]),
  );
}

/** The spell slots a character has at each spell level from the 1st, up to the last it has any at. */
function slotsOf(built: Awaited<ReturnType<typeof seeded>>) {
  const { slots } = built.components.spellcasting.getSpellcasting();
  return Object.entries(slots)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${level}: ${count}`);
}

/** A seeded character, built as the engine builds it. */
async function seeded(name: string) {
  return await buildCharacter((await findSeededCharacter(name)).id);
}

describe("A D&D 5th Edition character's sheet, as the SRD 5.2.1 works it out", () => {
  test("of a Fighter 5: the Proficiency Bonus by level, armor's Armor Class, a style's, and Extra Attack", async () => {
    const built = await seeded("Brannoc Ironvale");
    const combat = built.components.combat.getCombat();
    expect(built.components.classes.getProficiencyBonus()).toBe(3);
    // A first level's d10 at its highest, then its rolls, and Constitution 16's +3 at each of the five levels
    expect(combat.hp).toMatchObject({ base: 10 + 6 + 8 + 5 + 7, constitution: 15, total: 51 });
    // Chain Mail's 16, no Dexterity in heavy armor, a Shield's +2 and Defense's +1 while armored
    expect(combat.weaponsets["0"].ac).toMatchObject({ base: 16, dexterity: 0, shield: 2, misc: 1, total: 19 });
    // A fighter's Strength and Constitution saving throws add the Proficiency Bonus; its Dexterity's doesn't
    expect(savesOf(built)).toMatchObject({ strength: 4 + 3, constitution: 3 + 3, dexterity: 1 });
    // Skillful's Perception; Alert adds the Proficiency Bonus to Initiative
    expect(built.components.skills.getSkill("Perception")).toMatchObject({ proficient: true, total: 1 + 3 });
    expect(combat.initiative).toMatchObject({ dexterity: 1, misc: 3, total: 4 });
    // Extra Attack at the fifth level; a Champion's Improved Critical at the third
    expect(combat.attacks).toBe(2);
    expect(combat.critical.range).toBe(2);
    expect(combat.weaponsets["0"].mainhand).toMatchObject({
      name: "Longsword",
      mastered: true,
      mastery: "Sap",
      tohit: { ability: 4, proficiency: 3, total: 7 },
      damage: { total: "1d8+4" },
    });
  });

  test("of a Wizard 5: its spell slots, its spell save DC, a lineage's speed and a species' skill", async () => {
    const built = await seeded("Ilyra Moonwhisper");
    const combat = built.components.combat.getCombat();
    expect(combat.hp).toMatchObject({ base: 6 + 4 + 5 + 3 + 6, constitution: 10, total: 34 });
    expect(combat.weaponsets["0"].ac).toMatchObject({ base: 10, dexterity: 2, total: 12 });
    expect(savesOf(built)).toMatchObject({ intelligence: 4 + 3, wisdom: 1 + 3, constitution: 2 });
    expect(slotsOf(built)).toEqual(["1: 4", "2: 3", "3: 2"]);
    // 8, the Proficiency Bonus and Intelligence 18's +4
    expect(built.components.spellGroupings.getDcs().fireball.wizard).toMatchObject({ total: 8 + 3 + 4 });
    // A Wood Elf's 35 feet; Keen Senses' Perception
    expect(combat.speed.total).toBe(35);
    expect(built.components.skills.getSkill("Perception")).toMatchObject({ proficient: true, total: 4 });
  });

  test("of a Cleric 3 / Fighter 1: a multiclass's slots, its proficiencies and its first class's saves", async () => {
    const built = await seeded("Thordin Ashbeard");
    const combat = built.components.combat.getCombat();
    expect(built.components.classes.getProficiencyBonus()).toBe(2);
    // The cleric's first level's d8 at its highest, its rolls, the fighter's, Constitution's +1 and Dwarven Toughness
    expect(combat.hp).toMatchObject({ base: 8 + 5 + 6 + 7, constitution: 4, misc: 4, total: 34 });
    // The cleric's saving throws alone: a multiclass's fighter level gives none
    expect(savesOf(built)).toMatchObject({ wisdom: 3 + 2, charisma: 1 + 2, strength: 2, constitution: 1 });
    // A fighter's multiclass gives no heavy armor: Scale Mail's 14, a Shield's +2, Defense's +1
    expect(combat.armortraining).toEqual({ light: true, medium: true, heavy: false, shields: true });
    expect(combat.weaponsets["0"].ac.total).toBe(17);
    // The cleric's three levels count, the fighter's none: a 3rd-level caster's slots
    expect(slotsOf(built)).toEqual(["1: 4", "2: 2"]);
    expect(built.components.spellGroupings.getDcs().bless.cleric).toMatchObject({ total: 8 + 2 + 3 });
  });

  test("of a Rogue 3: Expertise doubles the Proficiency Bonus of a skill it's proficient in", async () => {
    const built = await seeded("Sable Underleaf");
    // Her background's spread: +1 to each of its three abilities
    const { constitution, dexterity, intelligence } = built.components.abilities.getAbilities();
    expect([dexterity.total, constitution.total, intelligence.total]).toEqual([15 + 1, 14 + 1, 13 + 1]);
    const skills = built.components.skills.getSkills();
    // Dexterity 16's +3, and twice the Proficiency Bonus
    expect(skills.stealth).toMatchObject({ proficient: true, expertise: true, total: 3 + 2 * 2 });
    expect(skills.perception).toMatchObject({ proficient: true, expertise: true, total: 1 + 2 * 2 });
    // Proficient alone
    expect(skills.sleightofhand).toMatchObject({ proficient: true, expertise: false, total: 3 + 2 });
    expect(skills.athletics).toMatchObject({ proficient: false, total: -1 });
    expect(savesOf(built)).toMatchObject({ dexterity: 3 + 2, intelligence: 2 + 2, strength: -1 });
    const combat = built.components.combat.getCombat();
    expect(combat.weaponsets["0"].ac).toMatchObject({ base: 11, dexterity: 3, total: 14 });
    expect(combat.hp.total).toBe(8 + 5 + 6 + 2 * 3);
  });
});
