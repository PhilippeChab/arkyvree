import { describe, expect, test } from "bun:test";

import { addClassLevels, createCharacter } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Characters, Picks } from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { levelEditPlan, levelUpPlan, savedPicksOf } from "@/tests/support/dnd3.5/levelPlans.ts";
import { findPicks } from "@/tests/support/dnd3.5/levels.ts";
import { getPlanAnswer, stepAnswerOf } from "@/tests/support/levels.ts";
import { findFormValues } from "@/tests/support/ownerValues.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
  RULESET_ABILITY_INCREASES,
  RULESET_FEAT_ADVANCEMENT,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** The core rules' feats: one every 3 levels, and one more at the first. */
const CORE_FEATS = { every: 3, extra: [{ amount: 1, level: 1 }] };

/**
 * The core rules' progression, which a fork of theirs reads until it saves its own: its feats, and an ability increase
 * every 4 levels.
 */
const CORE_PROGRESSION = {
  [RULESET_FEAT_ADVANCEMENT]: CORE_FEATS,
  [RULESET_ABILITY_INCREASES]: { every: 4, extra: [] },
};

/**
 * A human fighter of the fork's, Intelligence 10 and Wisdom 18, of `levels` fighter levels, as the fork builds it, its
 * row's id and its levels'.
 */
async function buildFighter(rulesetId: string, levels = 1) {
  const ctx = await getSeedCtx();
  const scores = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 18, Charisma: 10 };
  const characterId = await createCharacter(db, ctx, {
    name: "Wise Fighter",
    description: "Test",
    abilities: scores,
    languages: ["Common"],
    rulesetId,
    links: { race: "Human" },
    fields: {
      [CHARACTER_XP]: 0,
      [CHARACTER_ALIGNMENT]: "Neutral Good",
      [CHARACTER_AGE]: 30,
      [CHARACTER_GENDER]: "Male",
      [CHARACTER_HEIGHT]: "180",
      [CHARACTER_WEIGHT]: "80",
    },
  });
  const numbers = Array.from({ length: levels }, (_, i) => i + 1);
  const levelIds = await addClassLevels(
    db,
    ctx,
    characterId,
    "Fighter",
    numbers,
    numbers.map(() => 10),
  );
  const character = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
  return { character, characterId, levelIds };
}

/** A human fighter 1 of the fork's, Intelligence 10 and Wisdom 18: its skill points' budget, as the fork reads it. */
async function fighterBudget(rulesetId: string) {
  const { character } = await buildFighter(rulesetId);
  return character.components.skills.getSkillBudget().total;
}

/** The general feats a fighter of `levels` levels of the fork's picks, as the fork builds it. */
async function fighterGeneralFeats(rulesetId: string, levels: number) {
  const { character } = await buildFighter(rulesetId, levels);
  return character.components.aptitudes.getAptitudes()["general"].allowed;
}

/** A new user's fork of the seeded core rules, and the seeded abilities' ids by name. */
async function setup() {
  const { session, user } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  const { abilityMap } = await getSeedCtx();
  return { session, fork, abilityMap };
}

describe("RulesetSettingsService", () => {
  test("reads a fork's Settings off its source's, until it saves its own", async () => {
    const { session, fork, abilityMap } = await setup();
    expect(await RulesetSettingsService.getSettings(fork.id)).toEqual({
      id: fork.id,
      fields: CORE_PROGRESSION,
      links: { skillPointAbility: abilityMap["Intelligence"] },
    });
    // A human fighter's 2 a level, and the human's 1, four times over at the first: with Intelligence's +0
    expect(await fighterBudget(fork.id)).toBe(12);

    const saved = await RulesetSettingsService.updateSettings(session, fork.id, {
      links: { skillPointAbility: abilityMap["Wisdom"] },
    });
    expect(saved).toEqual({
      id: fork.id,
      fields: CORE_PROGRESSION,
      links: { skillPointAbility: abilityMap["Wisdom"] },
    });
    expect(await RulesetSettingsService.getSettings(fork.id)).toEqual(saved);
    // With Wisdom's +4
    expect(await fighterBudget(fork.id)).toBe(28);

    // Its own row in place of the copy it held; its source's as they were
    expect((await findFormValues("rulesets", fork.id)).links).toEqual({ skillPointAbility: abilityMap["Wisdom"] });
    expect(await RulesetSettingsService.getSettings(fork.rulesetId!)).toMatchObject({
      links: { skillPointAbility: abilityMap["Intelligence"] },
    });
    expect(await activityTypes(session.userId, rulesetsInRules, fork.id)).toEqual(["updateRulesetSettings"]);
  });

  test("give every character of the fork its feats and ability increases at the levels it says, whatever its class", async () => {
    const { session, fork } = await setup();
    // The core rules': two general feats at the fifth level, and the human's bonus feat; an ability increase at the
    // fourth level, none at the second
    expect(await fighterGeneralFeats(fork.id, 5)).toBe(3);
    // The fighter is the seed user's, whose level-up it is
    const { characterId } = await buildFighter(fork.id);
    // Its next level, the second, as Add Level plans it
    const { classMap } = await getSeedCtx();
    const second = levelUpPlan([{ classId: classMap.pc["Fighter"], level: 2, hp: 10 }]);
    const abilityStep = async () =>
      stepAnswerOf(await getPlanAnswer(makeSession(), characterId, second), "abilities", "choose");
    expect(await abilityStep()).toMatchObject({ advancements: [] });

    // A feat more at levels 3 and 5, and an ability increase at the second level alone, none every so many levels
    const featAdvancement = {
      every: 3,
      extra: [
        { amount: 1, level: 1 },
        { amount: 1, level: 3 },
        { amount: 1, level: 5 },
      ],
    };
    const abilityIncreases = { every: 0, extra: [{ amount: 1, level: 2 }] };
    const saved = await RulesetSettingsService.updateSettings(session, fork.id, {
      fields: { [RULESET_ABILITY_INCREASES]: abilityIncreases, [RULESET_FEAT_ADVANCEMENT]: featAdvancement },
    });
    expect(saved.fields).toMatchObject({
      [RULESET_ABILITY_INCREASES]: abilityIncreases,
      [RULESET_FEAT_ADVANCEMENT]: featAdvancement,
    });
    expect(await RulesetSettingsService.getSettings(fork.id)).toEqual(saved);

    expect(await fighterGeneralFeats(fork.id, 3)).toBe(4);
    expect(await fighterGeneralFeats(fork.id, 5)).toBe(5);
    expect(await abilityStep()).toMatchObject({ advancements: [0], chosen: false });
    // Its source's characters follow the core rules still
    expect(await RulesetSettingsService.getSettings(fork.rulesetId!)).toMatchObject({ fields: CORE_PROGRESSION });

    // None at any level stands for the fork, its source's progression aside
    const none = { every: 0, extra: [] };
    await RulesetSettingsService.updateSettings(session, fork.id, { fields: { [RULESET_ABILITY_INCREASES]: none } });
    expect(await RulesetSettingsService.getSettings(fork.id)).toMatchObject({
      fields: { [RULESET_ABILITY_INCREASES]: none, [RULESET_FEAT_ADVANCEMENT]: featAdvancement },
    });
  });

  test("count no increase its Settings no longer give, which a level's edit opens without and writes away", async () => {
    const { session, fork, abilityMap } = await setup();
    const { characterId, levelIds } = await buildFighter(fork.id, 4);
    const fourth = levelIds[3];
    const strength = { abilityId: abilityMap["Strength"], amount: 1 };
    await Picks.createMany(db, [{ advancementId: fourth, step: "abilities", entityId: strength.abilityId, amount: 1 }]);
    // The seed user's fighter, whose edit opens its level and saves it, its unspent skill points and bonus feat aside
    const seedUser = makeSession();
    const edit = (increases: (typeof strength)[]) =>
      CharacterLevelsService.updatePlannedLevel(
        seedUser,
        characterId,
        fourth,
        levelEditPlan({ hp: 10, abilityIncreases: increases }),
        true,
      );
    // The level as its edit opens it
    const savedLevel = async () =>
      savedPicksOf(await CharacterLevelsService.getLevelPlan(seedUser, characterId, fourth));
    // The fighter's Strength, as the fork builds it
    const strengthScore = async () => {
      const row = await Characters.findOne(db, { id: characterId });
      return (await buildAs(DetailedCharacter, row!)).components.abilities.getAbility("Strength")?.total;
    };
    expect(await savedLevel()).toMatchObject({ abilityIncreases: [strength] });
    expect(await strengthScore()).toBe(11);

    // The increases move to every fifth level
    const abilityIncreases = { every: 5, extra: [] };
    await RulesetSettingsService.updateSettings(session, fork.id, {
      fields: { [RULESET_ABILITY_INCREASES]: abilityIncreases },
    });
    expect(await savedLevel()).toMatchObject({ abilityIncreases: [] });
    expect(await strengthScore()).toBe(10);
    for (const increases of [[strength], [{ ...strength, abilityId: abilityMap["Dexterity"] }]])
      expect(edit(increases)).rejects.toMatchObject({ message: "Ability increase is not available at this level" });
    await edit([]);
    expect(await findPicks("abilities", [fourth])).toEqual([]);
  });

  test("refuses a setting its rules don't take: an ability the ruleset lacks, none, another field", async () => {
    const { session, fork, abilityMap } = await setup();
    const update = (fields: Record<string, unknown>, links: Record<string, unknown> = {}) =>
      RulesetSettingsService.updateSettings(session, fork.id, { fields: fields as never, links: links as never });
    expect(update({}, { skillPointAbility: NIL_UUID })).rejects.toMatchObject({
      refusal: "invalid",
      message: `Ability ${NIL_UUID} does not belong to this ruleset`,
    });
    expect(update({}, { skillPointAbility: null })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: "links.skillPointAbility" }],
    });
    expect(update({ EPIC_FEATS: 3 }, { skillPointAbility: abilityMap["Wisdom"] })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: "fields.EPIC_FEATS", message: "Not a field of this entity" }],
    });
    // A field's name in its declaration is no stored field
    expect(update({ abilityIncreases: { every: 4, extra: [] } })).rejects.toMatchObject({
      issues: [{ category: "fields.abilityIncreases", message: "Not a field of this entity" }],
    });
    // An increase at a level its frequency gives one already, a progression not of its shape
    const twice = { every: 4, extra: [{ amount: 1, level: 8 }] };
    expect(update({ [RULESET_ABILITY_INCREASES]: twice })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [
        {
          category: `fields.${RULESET_ABILITY_INCREASES}.extra.0.level`,
          message: "Level 8 gives one already, every 4 levels",
        },
      ],
    });
    expect(update({ [RULESET_FEAT_ADVANCEMENT]: [1, 0, 1] })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: `fields.${RULESET_FEAT_ADVANCEMENT}` }],
    });
    expect(await RulesetSettingsService.getSettings(fork.id)).toMatchObject({
      fields: CORE_PROGRESSION,
      links: { skillPointAbility: abilityMap["Intelligence"] },
    });
  });

  test("refuses who can't edit the ruleset's content, and a system ruleset", async () => {
    const { fork, abilityMap } = await setup();
    const { session: other } = await createTestUser();
    const links = { skillPointAbility: abilityMap["Wisdom"] };
    expect(RulesetSettingsService.updateSettings(other, fork.id, { links })).rejects.toThrow(ForbiddenError);
    const { session } = await setup();
    expect(RulesetSettingsService.updateSettings(session, fork.rulesetId!, { links })).rejects.toThrow(ForbiddenError);
  });
});
