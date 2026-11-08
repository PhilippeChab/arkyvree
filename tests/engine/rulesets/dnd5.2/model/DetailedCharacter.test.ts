import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { buildCharacter, createDnd52Character } from "@/tests/support/dnd5.2/characters.ts";
import { addLevel } from "@/tests/support/dnd5.2/levels.ts";
import { getDnd52SeedCtx } from "@/tests/support/dnd5.2/seed.ts";
import { findSeededCharacter, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";
import { MULTICLASS_ABILITY_MINIMUM } from "@/vocabulary/dnd5.2/classes.ts";
import { CLASS_MULTICLASS_SLOTS } from "@/vocabulary/dnd5.2/fields/index.ts";

/** Each class's hit die, its first level's hit points as a character's first. */
const HIT_DICE: Record<string, number> = {
  Barbarian: 12,
  Bard: 8,
  Fighter: 10,
  Monk: 8,
  Paladin: 10,
  Ranger: 10,
  Sorcerer: 6,
  Warlock: 8,
  Wizard: 6,
};

const session = makeSession();

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

/**
 * A private fork of the seeded core rules whose classes of these names (`classNames`) count none of their levels
 * toward a multiclass's slots, the field's default, as a homebrew caster's is until its creator sets it.
 */
async function forkCountingNone(classNames: string[]) {
  const ctx = await getDnd52SeedCtx();
  const fork = await RulesetsService.forkRuleset(session, ctx.rulesetId, { name: `Fork ${uniqueId()}`, private: true });
  for (const className of classNames) {
    const klass = await EntitiesService.getEntity(session, fork.id, "classes", ctx.classMap[className]);
    await EntitiesService.updateEntity(session, fork.id, "classes", klass.id, {
      name: klass.name,
      description: klass.description,
      fields: { ...klass.fields, [CLASS_MULTICLASS_SLOTS]: "Its levels don't count" },
      // Its links, each one entity: its spellcasting ability, its starting and multiclass proficiencies
      links: Object.fromEntries(klass.links.map(({ role, toId }) => [role, toId])),
    });
  }
  return fork.id;
}

/**
 * A new character of these classes' levels (`classes`, each a class and how many of its levels, in order), its scores
 * 13 each but those `abilities` gives, every class's multiclass prerequisites met unless they say otherwise (a class's
 * first level's modifiers wait on them), forced past its picks, on `rulesetId` (the seeded core rules, unless given),
 * built as the engine builds it.
 */
async function leveled(
  classes: [string, number][],
  { abilities = {}, rulesetId }: { abilities?: Record<string, number>; rulesetId?: string } = {},
) {
  const scores = Object.fromEntries(ABILITY_NAMES.map((ability) => [ability, MULTICLASS_ABILITY_MINIMUM]));
  const character = await createDnd52Character(session, { abilities: { ...scores, ...abilities }, rulesetId });
  let first = true;
  for (const [klass, count] of classes) {
    for (let level = 1; level <= count; level++) {
      await addLevel(session, character.id, klass, level, { hp: first ? HIT_DICE[klass] : 1 }, true);
      first = false;
    }
  }
  return await buildCharacter(character.id);
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
    // Listed as the abilities are
    expect(Object.keys(savesOf(built))).toEqual([
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ]);
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
    // A cleric knows every spell of its list of a level it casts, unpicked: level 2's Spiritual Weapon, not level 3's
    expect(built.components.spellGroupings.getDcs().spiritualweapon?.cleric).toBeDefined();
    expect(built.components.spellGroupings.getDcs().spiritguardians).toBeUndefined();
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
  test("of a raised Proficiency Bonus: its saves, skills and attacks take it", async () => {
    // A Fighter 1 with an Ioun Stone of Mastery's +1, as its own modifier
    const fighter = await createDnd52Character(session, { abilities: { Strength: 14 } });
    await addLevel(session, fighter.id, "Fighter", 1, { hp: HIT_DICE.Fighter }, true);
    const bonus = { target: "combat.proficiency.misc", operator: "add", value: "1", valueType: "number" };
    await CharacterModifiersService.createModifier(session, fighter.id, bonus);
    const built = await buildCharacter(fighter.id);
    const combat = built.components.combat.getCombat();
    expect(combat.proficiency).toMatchObject({ base: 2, misc: 1, total: 3 });
    // Its Strength save, a fighter's: Strength's +2 and the raised bonus's +3
    expect(savesOf(built)).toMatchObject({ strength: 2 + 3 });
    expect(combat.weaponsets["0"].mainhand!.tohit.total).toBe(2 + 3);
  });

  test("of a goliath's carrying capacity: its Powerful Build counts it a size larger", async () => {
    const capacityOf = async (species: string) => {
      const character = await createDnd52Character(session, { abilities: { Strength: 15 }, species });
      await addLevel(session, character.id, "Fighter", 1, { hp: HIT_DICE.Fighter }, true);
      return (await buildCharacter(character.id)).components.combat.getCombat().carrying.capacity;
    };
    // Strength 15 times 15 lb., a Medium human's; times 30, a Large creature's, for a Medium goliath
    expect(await capacityOf("Human")).toBe(15 * 15);
    expect(await capacityOf("Goliath")).toBe(15 * 30);
  });

  test("of a bard's Jack of All Trades: every skill, a fork's own too", async () => {
    const ctx = await getDnd52SeedCtx();
    const fork = await RulesetsService.forkRuleset(session, ctx.rulesetId, {
      name: `Fork ${uniqueId()}`,
      private: true,
    });
    await EntitiesService.createEntity(session, fork.id, "skills", {
      name: "Sailing",
      links: { keyAbility: ctx.abilityMap["Wisdom"] },
    });
    const built = await leveled([["Bard", 2]], { rulesetId: fork.id });
    const skills = built.components.skills.getSkills();
    expect(skills.sailing?.halfproficient).toBe(true);
    expect(skills.stealth?.halfproficient).toBe(true);
  });

  test("of a new character: Common, which its species grants", async () => {
    const built = await leveled([["Fighter", 1]]);
    expect(built.components.languages.getGranted().map(({ name }) => name)).toEqual(["Common"]);
    expect(built.components.languages.getLanguages().common).toEqual({ known: true });
  });

  test("of an Unarmored Defense: 10, Dexterity and its ability, the better of two, never below 10 and Dexterity", async () => {
    // A Barbarian 1 / Monk 1: the Monk's Wisdom (+3), the better calculation, not the Barbarian's Constitution (+2) too
    const both = await leveled(
      [
        ["Barbarian", 1],
        ["Monk", 1],
      ],
      { abilities: { Dexterity: 14, Constitution: 14, Wisdom: 16 } },
    );
    expect(both.components.combat.getCombat().weaponsets["0"].ac).toMatchObject({
      base: 10 + 3,
      dexterity: 2,
      misc: 0,
      total: 15,
    });
    // A Barbarian of Constitution 8: 10 and Dexterity, the SRD's own calculation, which the −1 would lower
    const frail = await leveled([["Barbarian", 1]], { abilities: { Dexterity: 14, Constitution: 8 } });
    expect(frail.components.combat.getCombat().weaponsets["0"].ac).toMatchObject({ base: 10, dexterity: 2, total: 12 });
  });

  test("of a monk's Martial Arts: its Unarmed Strike with Dexterity, rolling its die by its Monk level", async () => {
    const unarmedOf = async (level: number) => {
      const built = await leveled([["Monk", level]], { abilities: { Strength: 10, Dexterity: 16 } });
      const strike = built.components.combat.getCombat().weaponsets["0"].mainhand!;
      return { ability: strike.ability, tohit: strike.tohit.total, damage: strike.damage.total };
    };
    // The SRD's Monk 1 with Dexterity 16: +5 to hit (Dexterity's +3, the Proficiency Bonus's +2) for 1d6+3, not 1
    expect(await unarmedOf(1)).toEqual({ ability: "Dexterity", tohit: 5, damage: "1d6+3" });
    // Its Martial Arts die grows at its 5th level
    expect(await unarmedOf(5)).toEqual({ ability: "Dexterity", tohit: 6, damage: "1d8+3" });
    // A Monk weapon rolls its own dice when they're better: a Quarterstaff's d8 in two hands, not the d6
    const ctx = await getDnd52SeedCtx();
    const monk = await createDnd52Character(session, { abilities: { Strength: 10, Dexterity: 16 } });
    await addLevel(session, monk.id, "Monk", 1, { hp: HIT_DICE.Monk }, true);
    const staff = (await Entities.findOne(db, {
      entityType: "items",
      name: "Quarterstaff",
      rulesetId: ctx.rulesetId,
    }))!;
    await CharacterInventoryService.addItem(session, monk.id, staff.id, 1, "Two Handed", null, null, [0], true);
    const held = (await buildCharacter(monk.id)).components.combat.getCombat().weaponsets["0"].twohanded!;
    expect({ ability: held.ability, damage: held.damage.total }).toEqual({ ability: "Dexterity", damage: "1d8+3" });
  });

  test("of a Shield +1: its +2 and its +1 with Shield training, nothing without", async () => {
    const ctx = await getDnd52SeedCtx();
    const shield = (await Entities.findOne(db, { entityType: "items", name: "Shield +1", rulesetId: ctx.rulesetId }))!;
    const shieldAcOf = async (klass: string) => {
      const character = await createDnd52Character(session);
      await addLevel(session, character.id, klass, 1, { hp: HIT_DICE[klass] }, true);
      await CharacterInventoryService.addItem(session, character.id, shield.id, 1, "Off Hand", null, null, [0], true);
      const { ac } = (await buildCharacter(character.id)).components.combat.getCombat().weaponsets["0"];
      return { shield: ac.shield, total: ac.total };
    };
    // A fighter's training: the Shield's +2 and its +1; a wizard's none, its +1 neither
    expect(await shieldAcOf("Fighter")).toEqual({ shield: 3, total: 13 });
    expect(await shieldAcOf("Wizard")).toEqual({ shield: 0, total: 10 });
  });

  test("of a paladin's Blessed Warrior: two Cleric cantrips, cast with its Charisma", async () => {
    const character = await createDnd52Character(session, { abilities: { Strength: 15, Charisma: 16 } });
    await addLevel(session, character.id, "Paladin", 1, { hp: HIT_DICE.Paladin }, true);
    const plan = {
      hp: 1,
      feats: { "Paladin Fighting Style": ["Blessed Warrior"] },
      spells: { "Cleric Spells": ["Guidance", "Sacred Flame"] },
    };
    await addLevel(session, character.id, "Paladin", 2, plan, true);
    const built = await buildCharacter(character.id);
    // Sacred Flame's DC on the Cleric list: 8, the Proficiency Bonus's +2 and Charisma's +3, the paladin's ability
    expect(built.components.spellGroupings.getDcs().sacredflame?.cleric?.total).toBe(8 + 2 + 3);
  });

  test("of a monk with a Shield in another set: its Unarmored Defense and Martial Arts in the set without it", async () => {
    const ctx = await getDnd52SeedCtx();
    const monk = await createDnd52Character(session, { abilities: { Dexterity: 16, Wisdom: 16 } });
    await addLevel(session, monk.id, "Monk", 1, { hp: HIT_DICE.Monk }, true);
    const itemId = async (name: string) =>
      (await Entities.findOne(db, { entityType: "items", name, rulesetId: ctx.rulesetId }))!.id;
    await CharacterInventoryService.addItem(
      session,
      monk.id,
      await itemId("Quarterstaff"),
      1,
      "Two Handed",
      null,
      null,
      [0],
      true,
    );
    await CharacterInventoryService.addItem(
      session,
      monk.id,
      await itemId("Shield"),
      1,
      "Off Hand",
      null,
      null,
      [1],
      true,
    );
    const { weaponsets } = (await buildCharacter(monk.id)).components.combat.getCombat();
    // The first set holds no Shield: 10, Dexterity's +3 and Wisdom's +3; its Quarterstaff with Dexterity, its d8
    expect(weaponsets["0"].ac.total).toBe(16);
    expect({ ability: weaponsets["0"].twohanded!.ability, damage: weaponsets["0"].twohanded!.damage.total }).toEqual({
      ability: "Dexterity",
      damage: "1d8+3",
    });
    // The second holds one, which a monk has no training with: 10 and Dexterity's +3 alone
    expect(weaponsets["1"].ac.total).toBe(13);
  });

  test("of a Sage fighter's Magic Initiate (Wizard): its spells cast with the ability it picks", async () => {
    const sageFighter = async (picks: Record<string, string[]>) => {
      const character = await createDnd52Character(session, { abilities: { Intelligence: 14 }, background: "Sage" });
      const spells = { "Wizard Spells": ["Fire Bolt", "Light", "Burning Hands"] };
      await addLevel(session, character.id, "Fighter", 1, { hp: HIT_DICE.Fighter, feats: picks, spells }, true);
      return (await buildCharacter(character.id)).components.spellGroupings.getDcs().burninghands?.wizard?.total;
    };
    // Without the pick, a fighter casts Burning Hands with no ability: no DC
    expect(await sageFighter({})).toBeUndefined();
    // With Intelligence: 8, the Proficiency Bonus's +2 and Intelligence's +2
    const intelligence = { "Magic Initiate (Wizard) Ability": ["Magic Initiate (Wizard): Intelligence"] };
    expect(await sageFighter(intelligence)).toBe(8 + 2 + 2);
  });

  test("of an Acolyte paladin's Magic Initiate (Cleric) and Blessed Warrior: each its level's ability", async () => {
    const abilities = { Strength: 15, Intelligence: 10, Charisma: 16 };
    const character = await createDnd52Character(session, { abilities, background: "Acolyte" });
    await addLevel(
      session,
      character.id,
      "Paladin",
      1,
      {
        hp: HIT_DICE.Paladin,
        feats: { "Magic Initiate (Cleric) Ability": ["Magic Initiate (Cleric): Intelligence"] },
        spells: { "Cleric Spells": ["Light", "Thaumaturgy", "Command"] },
      },
      true,
    );
    const blessed = { "Paladin Fighting Style": ["Blessed Warrior"] };
    await addLevel(
      session,
      character.id,
      "Paladin",
      2,
      { hp: 1, feats: blessed, spells: { "Cleric Spells": ["Guidance", "Sacred Flame"] } },
      true,
    );
    const dcs = (await buildCharacter(character.id)).components.spellGroupings.getDcs();
    // Magic Initiate's Command, picked with its Intelligence at the first level: 8, +2, Intelligence's +0
    expect(dcs.command?.cleric?.total).toBe(8 + 2 + 0);
    // Blessed Warrior's Sacred Flame, at the second: the paladin's Charisma, +3
    expect(dcs.sacredflame?.cleric?.total).toBe(8 + 2 + 3);
  });

  test("of two classes' Extra Attacks: the most either gives, whichever class came first", async () => {
    const attacksOf = async (classes: [string, number][]) =>
      (await leveled(classes)).components.combat.getCombat().attacks;
    // A Fighter 11's Two Extra Attacks make 3, a Paladin 5's Extra Attack 2: 3, the Paladin's levels first or last
    expect(
      await attacksOf([
        ["Fighter", 11],
        ["Paladin", 5],
      ]),
    ).toBe(3);
    expect(
      await attacksOf([
        ["Paladin", 5],
        ["Fighter", 11],
      ]),
    ).toBe(3);
  });

  describe("its spell slots, as the SRD 5.2.1's Multiclassing rules give them", () => {
    test("of one casting class: its own, its levels', a fighter's levels counting none", async () => {
      const built = await leveled([
        ["Paladin", 3],
        ["Fighter", 2],
      ]);
      expect(slotsOf(built)).toEqual(["1: 3"]);
    });

    test("of several: the Multiclass Spellcaster table's at all their full casters' levels and half the others'", async () => {
      // The SRD's example: a level 4 Ranger / level 3 Sorcerer counts as a level 5 caster
      const example = await leveled([
        ["Ranger", 4],
        ["Sorcerer", 3],
      ]);
      expect(example.components.spellcasting.getSpellcasting()).toMatchObject({ casterlevel: 5 });
      expect(slotsOf(example)).toEqual(["1: 4", "2: 3", "3: 2"]);
      // A Wizard 3 / Paladin 2 counts 3 + 1, not the 4 and 2 level 1 slots and the 2 level 2 slots of its own two
      const wizardPaladin = await leveled([
        ["Wizard", 3],
        ["Paladin", 2],
      ]);
      expect(slotsOf(wizardPaladin)).toEqual(["1: 4", "2: 3"]);
    });

    test("of a warlock: its Pact Magic, apart, beside another class's own slots", async () => {
      const warlock = await leveled([["Warlock", 3]]);
      expect(warlock.components.spellcasting.getSpellcasting().pact).toEqual({ level: 2, slots: 2 });
      expect(slotsOf(warlock)).toEqual([]);
      // Pact Magic isn't the Spellcasting feature: a Warlock 3 / Wizard 2 has the wizard's own slots beside it
      const warlockWizard = await leveled([
        ["Warlock", 3],
        ["Wizard", 2],
      ]);
      expect(warlockWizard.components.spellcasting.getSpellcasting().pact).toEqual({ level: 2, slots: 2 });
      expect(slotsOf(warlockWizard)).toEqual(["1: 3"]);
    });

    test("of a class whose levels count none: its own, alone or beside a multiclass's shared slots", async () => {
      // A fork's Wizard and Sorcerer as a homebrew caster stands, its Multiclass Spell Slots left at its default
      const rulesetId = await forkCountingNone(["Wizard", "Sorcerer"]);
      expect(slotsOf(await leveled([["Wizard", 3]], { rulesetId }))).toEqual(["1: 4", "2: 2"]);
      // Beside a Cleric 3 / Bard 2, which share the table's 5th row: the wizard's 4 and 2 on top
      const beside = await leveled(
        [
          ["Wizard", 3],
          ["Cleric", 3],
          ["Bard", 2],
        ],
        { rulesetId },
      );
      expect(slotsOf(beside)).toEqual(["1: 8", "2: 5", "3: 2"]);
      // Two that count none keep their own each: the wizard's 4 and 2, the sorcerer's 3
      expect(
        slotsOf(
          await leveled(
            [
              ["Wizard", 3],
              ["Sorcerer", 2],
            ],
            { rulesetId },
          ),
        ),
      ).toEqual(["1: 7", "2: 2"]);
    });
  });
});
