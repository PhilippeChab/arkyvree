import { describe, expect, test } from "bun:test";

import type { AdvancementPlanAnswer } from "@/engine/core/module/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Modifiers, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import { getPlanAnswer, stepAnswerOf } from "@/tests/support/advancementPlans.ts";
import { buildCharacter, createDnd52Character } from "@/tests/support/dnd5.2/characters.ts";
import { levelEditPlan, levelUpPlan, savedPicksOf } from "@/tests/support/dnd5.2/levelPlans.ts";
import { addLevel, findPicks, type LevelPlan, picksOf } from "@/tests/support/dnd5.2/levels.ts";
import { getDnd52SeedCtx } from "@/tests/support/dnd5.2/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { DND52_BASE_RULES } from "@/vocabulary/dnd5.2/baseRules.ts";

/**
 * A Human Soldier fighter's first level: its background's spread and gaming set, a human's Skillful and Versatile
 * picks, its two class skills, its Fighting Style and its three weapons' masteries.
 */
const FIGHTER_1: LevelPlan = {
  hp: 10,
  feats: {
    "Soldier Ability Scores": ["Soldier: Strength +2, Constitution +1"],
    "Soldier Tools": ["Tool Proficiency: Dice"],
    "Skill Proficiencies": ["Skill Proficiency: Perception"],
    Origin: ["Alert"],
    "Fighter Skills": ["Skill Proficiency: Insight", "Skill Proficiency: Survival"],
    "Fighting Style": ["Defense"],
    "Weapon Mastery": ["Weapon Mastery: Longsword", "Weapon Mastery: Greatsword", "Weapon Mastery: Javelin"],
  },
};

/** A fighter's first level, a multiclass's: its Fighting Style and its three weapons' masteries. */
const FIGHTER_MULTICLASS: LevelPlan = {
  hp: 7,
  feats: {
    "Fighting Style": ["Defense"],
    "Weapon Mastery": ["Weapon Mastery: Longsword", "Weapon Mastery: Dagger", "Weapon Mastery: Javelin"],
  },
};

/** A fighter's scores, the standard array's. */
const FIGHTER_SCORES = { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 10 };

const session = makeSession();

/**
 * A Human Soldier wizard's first level: its background's and a human's picks, its two class skills, its three cantrips
 * and its four level 1 spells.
 */
const WIZARD_1: LevelPlan = {
  hp: 6,
  feats: {
    "Soldier Ability Scores": ["Soldier: Constitution +2, Strength +1"],
    "Soldier Tools": ["Tool Proficiency: Dice"],
    "Skill Proficiencies": ["Skill Proficiency: Perception"],
    Origin: ["Alert"],
    "Wizard Skills": ["Skill Proficiency: Arcana", "Skill Proficiency: History"],
  },
  spells: {
    "Wizard Spells": ["Fire Bolt", "Light", "Mage Hand", "Magic Missile", "Shield", "Sleep", "Detect Magic"],
  },
};

/** A wizard's scores: Intelligence and Strength 13 or more, a fighter's multiclass's. */
const WIZARD_SCORES = { Strength: 13, Dexterity: 14, Constitution: 12, Intelligence: 15, Wisdom: 10, Charisma: 8 };

/** The names of what a plan's answer says its feats step grants. */
function grantedNamesOf(answer: AdvancementPlanAnswer) {
  return stepAnswerOf(answer, "feats", "pick").granted.map(({ name }) => name);
}

/** A pool's room in a pick step's answer, by the pool's name. */
function poolOf(answer: AdvancementPlanAnswer, step: "feats" | "spells", name: string) {
  return Object.values(stepAnswerOf(answer, step, "pick").pools).find((pool) => pool.name === name);
}

/** A Human Soldier fighter of `levels` levels, its Fighting Style at its first, the Champion at its third. */
async function createFighter(levels: number) {
  const character = await createHuman(FIGHTER_SCORES);
  const saved = [];
  for (let level = 1; level <= levels; level++) {
    const picks: Record<number, Record<string, string[]>> = {
      1: { "Fighting Style": ["Defense"] },
      3: { "Fighter Subclass": ["Champion"] },
    };
    const feats = picks[level] ?? {};
    saved.push(await addLevel(session, character.id, "Fighter", level, { hp: level === 1 ? 10 : 6, feats }, true));
  }
  return { character, saved };
}

/** A new Human Soldier of `scores`. */
async function createHuman(scores: Record<string, number>) {
  return await createDnd52Character(session, { abilities: scores });
}

/** A Human Soldier wizard with its first level. */
async function createWizard(scores: Record<string, number> = WIZARD_SCORES) {
  const character = await createHuman(scores);
  const first = await addLevel(session, character.id, "Wizard", 1, WIZARD_1);
  return { character, first };
}

/** The answer to a plan of one level of `klass` for `characterId`, its `level`, with `plan`'s picks. */
async function levelAnswer(characterId: string, klass: string, level: number, plan: Omit<LevelPlan, "hp"> = {}) {
  const ctx = await getDnd52SeedCtx();
  return await getPlanAnswer(
    session,
    characterId,
    levelUpPlan([{ classId: ctx.classMap[klass], level, hp: 1 }], picksOf(ctx, plan)),
  );
}

/** What a call answers: its result, or its refusal's message. */
async function outcomeOf(call: () => Promise<unknown>) {
  return await call().then(
    () => "saved",
    (error: Error) => error.message,
  );
}

/** The ids of a level's picks of a step, sorted. */
async function pickedIds(step: string, advancementId: string) {
  return (await findPicks(step, [advancementId])).map(({ entityId }) => entityId).sort();
}

describe("A D&D 5th Edition character's levels", () => {
  describe("creating a character", () => {
    test("makes one on the seeded core rules, of its species and background, with its scores", async () => {
      const ctx = await getDnd52SeedCtx();
      const character = await createDnd52Character(session, {
        species: "Elf",
        background: "Sage",
        abilities: { Intelligence: 15 },
      });
      const ruleset = await Rulesets.findOne(db, { id: character.rulesetId });
      expect(ruleset).toMatchObject({ name: "Core SRD 5.2", baseRules: DND52_BASE_RULES });
      expect(character.links).toEqual({ species: ctx.speciesMap["Elf"], background: ctx.backgroundMap["Sage"] });
      expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toEqual([]);
      // No species' or background's increase: the background's are a pick at the first level
      const { intelligence } = (await buildCharacter(character.id)).components.abilities.getAbilities();
      expect(intelligence.total).toBe(15);
    });
  });

  describe("planning a Human Soldier fighter's first level", () => {
    test("opens its class's, its background's and its species' pools", async () => {
      const character = await createHuman(FIGHTER_SCORES);
      const answer = await levelAnswer(character.id, "Fighter", 1);
      const pools = [
        "Fighter Skills",
        "Fighting Style",
        "Weapon Mastery",
        "Soldier Ability Scores",
        "Soldier Tools",
        "Skill Proficiencies",
        "Origin",
        "Fighter Subclass",
        "Ability Score Improvement",
      ];
      expect(Object.fromEntries(pools.map((name) => [name, poolOf(answer, "feats", name)?.allowed ?? 0]))).toEqual({
        "Fighter Skills": 2,
        "Fighting Style": 1,
        "Weapon Mastery": 3,
        "Soldier Ability Scores": 1,
        "Soldier Tools": 1,
        "Skill Proficiencies": 1,
        Origin: 1,
        "Fighter Subclass": 0,
        "Ability Score Improvement": 0,
      });
    });

    test("gives its hit die's highest, the character's first level's", async () => {
      const character = await createHuman(FIGHTER_SCORES);
      const hp = stepAnswerOf(await levelAnswer(character.id, "Fighter", 1), "hp", "value");
      expect(hp.advancements).toMatchObject([{ max: 10, min: 10 }]);
    });
  });

  describe("listing what a level grants", () => {
    test("names what a class's starting proficiencies give at a first level, its saving throws", async () => {
      const character = await createHuman(FIGHTER_SCORES);
      const granted = grantedNamesOf(await levelAnswer(character.id, "Fighter", 1));
      expect(granted).toEqual(
        expect.arrayContaining([
          "Fighter Starting Proficiencies",
          "Saving Throw Proficiency: Strength",
          "Saving Throw Proficiency: Constitution",
        ]),
      );
      expect(granted).not.toContain("Saving Throw Proficiency: Dexterity");
    });

    test("names a subclass's features its pick gives at the level it's picked", async () => {
      const { character } = await createFighter(2);
      const granted = grantedNamesOf(
        await levelAnswer(character.id, "Fighter", 3, { feats: { "Fighter Subclass": ["Champion"] } }),
      );
      expect(granted).toEqual(
        expect.arrayContaining(["Improved Critical (Champion)", "Remarkable Athlete (Champion)"]),
      );
      expect(granted).not.toContain("Additional Fighting Style (Champion)");
    });

    test("names a subclass's feature at its class level, and opens the pick it gives in the same level", async () => {
      const { character } = await createFighter(6);
      const answer = await levelAnswer(character.id, "Fighter", 7);
      expect(grantedNamesOf(answer)).toEqual(["Additional Fighting Style (Champion)"]);
      expect(poolOf(answer, "feats", "Fighting Style")).toMatchObject({ allowed: 2, spent: 1, available: 1 });
    });

    test("names a spell a level's modifier makes known on two lists once", async () => {
      const { character } = await createWizard();
      // The character's own modifiers, from its second level: Dispel Magic known on the Wizard's list and the Cleric's
      for (const list of ["wizard", "cleric"]) {
        const [modifier] = await Modifiers.create(db, {
          sourceId: character.id,
          sourceType: "characters",
          target: `spells.dispelmagic.${list}.known`,
          value: "true",
          valueType: "boolean",
          operator: "set",
        });
        await Requirements.create(db, {
          entityId: modifier.id,
          entityType: "modifiers",
          level: "1",
          target: "classes.wizard.level",
          operator: "greater_than_or_equal",
          value: "2",
          valueType: "number",
        });
      }
      const granted = stepAnswerOf(await levelAnswer(character.id, "Wizard", 2), "spells", "pick").granted;
      expect(granted.filter(({ name }) => name === "Dispel Magic")).toMatchObject([{ free: true }]);
    });

    test("names what an edited level gave when it was taken, not what the levels after it give", async () => {
      const { character, saved } = await createFighter(7);
      const ctx = await getDnd52SeedCtx();
      const edit = levelEditPlan(6, picksOf(ctx, { feats: { "Fighter Subclass": ["Champion"] } }));
      const granted = grantedNamesOf(
        await getPlanAnswer(session, character.id, { ...edit, editedAdvancementId: saved[2].id }),
      );
      expect(granted).toEqual(
        expect.arrayContaining(["Improved Critical (Champion)", "Remarkable Athlete (Champion)"]),
      );
      expect(granted).not.toContain("Additional Fighting Style (Champion)");
    });
  });

  describe("saving a first level", () => {
    test("saves its picks, and gives its class's starting proficiencies", async () => {
      const ctx = await getDnd52SeedCtx();
      const character = await createHuman(FIGHTER_SCORES);
      const level = await addLevel(session, character.id, "Fighter", 1, FIGHTER_1);
      expect(level).toMatchObject({ characterId: character.id, position: 1 });
      expect(await findPicks("hp", [level.id])).toMatchObject([{ amount: 10 }]);
      expect(await pickedIds("feats", level.id)).toEqual(Object.values(picksOf(ctx, FIGHTER_1).feats!).flat().sort());

      const built = await buildCharacter(character.id);
      const saves = built.components.saves.getSaves();
      expect([saves.strength.proficient, saves.constitution.proficient, saves.dexterity.proficient]).toEqual([
        true,
        true,
        false,
      ]);
      expect(built.components.combat.getCombat().armortraining).toEqual({
        light: true,
        medium: true,
        heavy: true,
        shields: true,
      });
      // The background's spread: 15 + 2 Strength, 14 + 1 Constitution
      const { strength, constitution } = built.components.abilities.getAbilities();
      expect([strength.total, constitution.total]).toEqual([17, 15]);
    });

    test("refuses a first level that leaves a pool's picks unmade, unless forced", async () => {
      const character = await createHuman(FIGHTER_SCORES);
      const { "Fighting Style": _, ...feats } = FIGHTER_1.feats!;
      const plan = { ...FIGHTER_1, feats };
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, plan))).toContain(
        "Fighting Style: 1 unspent slot(s) (0/1)",
      );
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, plan, true))).toBe("saved");
    });

    test("refuses an Expertise in a skill the character isn't proficient in", async () => {
      const character = await createDnd52Character(session, { background: "Criminal", species: "Halfling" });
      const rogue = (expertise: string) => ({
        hp: 8,
        feats: {
          "Criminal Ability Scores": ["Criminal: Dexterity +2, Constitution +1"],
          "Rogue Skills": [
            "Skill Proficiency: Acrobatics",
            "Skill Proficiency: Deception",
            "Skill Proficiency: Insight",
            "Skill Proficiency: Perception",
          ],
          Expertise: ["Expertise: Stealth", expertise],
          "Weapon Mastery": ["Weapon Mastery: Dagger", "Weapon Mastery: Shortsword"],
        },
      });
      // Athletics is none of its skills; Perception is a rogue's pick
      expect(await outcomeOf(() => addLevel(session, character.id, "Rogue", 1, rogue("Expertise: Athletics")))).toMatch(
        /Expertise: Athletics/,
      );
      await addLevel(session, character.id, "Rogue", 1, rogue("Expertise: Perception"));
      const skills = (await buildCharacter(character.id)).components.skills.getSkills();
      // Dexterity 12's +1 and Wisdom 10's +0, each with twice the Proficiency Bonus
      expect([skills.stealth.total, skills.perception.total]).toEqual([1 + 4, 0 + 4]);
    });
  });

  describe("multiclassing", () => {
    test("gives a second class's multiclass proficiencies, its saving throws and skills none", async () => {
      const { character } = await createWizard();
      const answer = await levelAnswer(character.id, "Fighter", 1);
      expect(poolOf(answer, "feats", "Fighter Skills")?.allowed ?? 0).toBe(0);
      await addLevel(session, character.id, "Fighter", 1, FIGHTER_MULTICLASS);
      const built = await buildCharacter(character.id);
      const combat = built.components.combat.getCombat();
      // A fighter's multiclass: light and medium armor, Shields and martial weapons, no heavy armor
      expect(combat.armortraining).toEqual({ light: true, medium: true, heavy: false, shields: true });
      const saves = built.components.saves.getSaves();
      expect(
        [saves.intelligence, saves.wisdom, saves.strength, saves.constitution].map(({ proficient }) => proficient),
      ).toEqual([true, true, false, false]);
      // A wizard's first level at its die's highest, a later class's rolled
      expect(combat.hp.base).toBe(6 + 7);
    });

    test("refuses a class whose primary ability is under 13, unless forced", async () => {
      // Strength 12 (11 and the background's +1) and Dexterity 12: a fighter takes 13 in one of them. Its first level's
      // requirements unmet, its rooms are too: a forced level saves without its picks
      const { character } = await createWizard({ ...WIZARD_SCORES, Strength: 11, Dexterity: 12 });
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, FIGHTER_MULTICLASS))).not.toBe(
        "saved",
      );
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, { hp: 7 }, true))).toBe("saved");
      const { issues } = (await buildCharacter(character.id)).validate();
      expect(issues.map(({ message }) => message).join("; ")).toMatch(/Fighter Level 1/);
    });

    test("refuses a multiclass whose first class's primary ability is under 13, which its first level needn't meet", async () => {
      // Intelligence 12: a wizard of one class needn't have 13, a multiclass's must
      const { character } = await createWizard({ ...WIZARD_SCORES, Intelligence: 12 });
      expect((await buildCharacter(character.id)).validate()).toEqual({ valid: true, issues: [] });
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, FIGHTER_MULTICLASS))).not.toBe(
        "saved",
      );
    });

    test("doesn't add up two classes' Extra Attacks, and a fighter's later ones raise them", async () => {
      const character = await createHuman({ ...FIGHTER_SCORES, Charisma: 13 });
      // Forced: the levels' picks don't matter here, the first's hit points its die's highest
      for (let level = 1; level <= 5; level++)
        await addLevel(session, character.id, "Fighter", level, { hp: level === 1 ? 10 : 6 }, true);
      for (let level = 1; level <= 5; level++) await addLevel(session, character.id, "Paladin", level, { hp: 5 }, true);
      const attacks = async () => (await buildCharacter(character.id)).components.combat.getCombat().attacks;
      expect(await attacks()).toBe(2);
      for (let level = 6; level <= 11; level++)
        await addLevel(session, character.id, "Fighter", level, { hp: 6 }, true);
      expect(await attacks()).toBe(3);
    });
  });

  describe("a wizard's prepared spells", () => {
    test("mix their levels: a new spell counted at the 2nd level may be a 1st-level one", async () => {
      const ctx = await getDnd52SeedCtx();
      const { character } = await createWizard();
      await addLevel(session, character.id, "Wizard", 2, { hp: 4, spells: { "Wizard Spells": ["Burning Hands"] } });
      const third = { hp: 4, feats: { "Wizard Subclass": ["Evoker"] }, spells: { "Wizard Spells": ["Thunderwave"] } };
      const answer = await levelAnswer(character.id, "Wizard", 3, third);
      expect(stepAnswerOf(answer, "spells", "pick")).toBeDefined();
      const level = await addLevel(session, character.id, "Wizard", 3, third);
      expect(await pickedIds("spells", level.id)).toEqual([ctx.spellMap["Thunderwave"]]);
      // Six prepared spells, of the 1st level all; the 2nd level's slots all the same
      const built = await buildCharacter(character.id);
      expect(built.validate()).toEqual({ valid: true, issues: [] });
      expect(built.components.spellcasting.getSpellcasting().slots).toMatchObject({ 1: 4, 2: 2 });
    });

    test("refuse a spell above the highest level the wizard casts", async () => {
      const { character } = await createWizard();
      // A wizard 2 casts 1st-level spells alone
      const plan = { hp: 4, spells: { "Wizard Spells": ["Fireball"] } };
      expect(await outcomeOf(() => addLevel(session, character.id, "Wizard", 2, plan))).toMatch(/Wizard Spells/);
    });
  });

  describe("a warlock's Mystic Arcanum", () => {
    test("gives a Warlock 11 one level 6 spell, apart from its prepared spells, whose Pact slots cap them", async () => {
      const character = await createDnd52Character(session, { abilities: { Charisma: 15 } });
      // Forced: the levels' picks don't matter here, the first's hit points its die's highest
      for (let level = 1; level <= 10; level++)
        await addLevel(session, character.id, "Warlock", level, { hp: level === 1 ? 8 : 5 }, true);
      const eleventh = (spells: Record<string, string[]>) =>
        outcomeOf(() => addLevel(session, character.id, "Warlock", 11, { hp: 5, spells }, true));
      // A second level 6 spell, forced or not: refused
      expect(await eleventh({ "Mystic Arcanum (Level 6)": ["Circle of Death", "Eyebite"] })).toMatch(
        /Mystic Arcanum \(Level 6\)/,
      );
      // A level 6 spell among the prepared ones: above the Pact slots' 5th level
      expect(await eleventh({ "Warlock Spells": ["Circle of Death"] })).toMatch(/Warlock Spells/);
      expect(await eleventh({ "Mystic Arcanum (Level 6)": ["Circle of Death"] })).toBe("saved");
    });
  });

  describe("editing a saved level", () => {
    test("reads its picks back, and saves new ones in their place", async () => {
      const ctx = await getDnd52SeedCtx();
      const character = await createHuman(FIGHTER_SCORES);
      const first = await addLevel(session, character.id, "Fighter", 1, FIGHTER_1);
      const saved = savedPicksOf(
        await CharacterAdvancementsService.getAdvancementPlan(session, character.id, first.id),
      );
      const sorted = (pools: Record<string, string[]> = {}) =>
        Object.fromEntries(Object.entries(pools).map(([pool, ids]) => [pool, ids.toSorted()]));
      expect({ hp: saved.hp, feats: sorted(saved.feats) }).toEqual({
        hp: 10,
        feats: sorted(picksOf(ctx, FIGHTER_1).feats),
      });

      const changed = picksOf(ctx, { feats: { ...FIGHTER_1.feats, "Fighting Style": ["Archery"] } });
      await CharacterAdvancementsService.updateSavedAdvancement(
        session,
        character.id,
        first.id,
        levelEditPlan(10, changed),
      );
      expect(await pickedIds("feats", first.id)).toContain(ctx.featMap["Archery"]);
      expect(await pickedIds("feats", first.id)).not.toContain(ctx.featMap["Defense"]);
    });
  });

  describe("removing a level", () => {
    test("removes the last one, with its picks", async () => {
      const character = await createHuman(FIGHTER_SCORES);
      const first = await addLevel(session, character.id, "Fighter", 1, FIGHTER_1);
      const second = await addLevel(session, character.id, "Fighter", 2, { hp: 6 });
      expect(await CharacterAdvancementsService.removeAdvancement(session, character.id)).toMatchObject({
        success: true,
      });
      expect((await CharacterAdvancements.findMany(db, { characterId: character.id })).map(({ id }) => id)).toEqual([
        first.id,
      ]);
      expect(await findPicks("hp", [second.id])).toEqual([]);
    });
  });
});
