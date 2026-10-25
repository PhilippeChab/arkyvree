import { afterAll, describe, expect, test } from "bun:test";

import { DND35_DMG_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import { addClassLevels, addFeats, addSkills, addSpells } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import type { LevelPlanRequest, StepOption, StepOptionGroup } from "@/engine/index.ts";
import type {
  Aptitude,
  Feat,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelSpell,
  KlassSkill,
  LevelAbilityIncrease,
  LevelFeat,
  LevelSkill,
  LevelSpell,
  Race,
  RulesetAbility,
  Skill,
  Spell,
} from "@/engine/rulesets/dnd3.5/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { toJson } from "@/server/errors/index.ts";
import {
  CharacterAdvancements,
  Characters,
  Entities,
  Joins,
  Modifiers,
  Picks,
  Requirements,
} from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { measure, runWhileLocked } from "@/tests/support/database.ts";
import { buildAs, createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import {
  addFighterLevels,
  createSeedCharacter,
  FIGHTER_LEVELS,
  levelUp,
  picks,
  SORCERER_1,
  WAR_CLERIC_1,
  WIZARD_1,
} from "@/tests/support/dnd3.5/levelFixtures.ts";
import {
  levelEditPlan,
  levelUpPlan,
  type PlannedClassLevel,
  type PlanPicks,
  savedPicksOf,
} from "@/tests/support/dnd3.5/levelPlans.ts";
import { addCharacterLevel, addOneLevel, findKlassLevel, increasesOf } from "@/tests/support/dnd3.5/levels.ts";
import { getPlanAnswer, getStepOptions, stepAnswerOf } from "@/tests/support/levels.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
  invalidateSeededRuleset,
} from "@/tests/support/rulesets.ts";
import { findSeededCharacter, findSeededRuleset, getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { findStoredValues, writeStoredValues } from "@/tests/support/storedValues.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS, FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

/** Where a pick step's picker opens: the advancement its pick lands on, and the tier or the group it lists. */
interface PickAt {
  advancement?: number;
  group?: string;
  search?: string;
  tier?: string;
}

/** A page of a step's options, its rows groups or not. */
type StepOptions = Awaited<ReturnType<typeof getStepOptions>>;

const lockPool = createTestPool();
const page = { limit: 500, page: 1 };
const session = makeSession();

/** An edit's plan of saved level `editedLevelId`: its hit points, its ability increases and its picks. */
function editPlan(
  editedLevelId: string,
  level: Parameters<typeof levelEditPlan>[0],
  picked: PlanPicks = {},
): LevelPlanRequest {
  return { ...levelEditPlan(level, picked), editedLevelId };
}

function names(rows: { name: string }[]) {
  return rows.map((r) => r.name);
}

/** A plan's level of class `klassId` at `level`, at the least hit points: a plan's answer and its pickers don't read them. */
function planned(klassId: string, level: number, abilityIncreases: PlannedClassLevel["abilityIncreases"] = []) {
  return { abilityIncreases, hp: 1, klassId, level };
}

function pool(pools: Record<string, { allowed: number; available: number; name: string }>, name: string) {
  return Object.values(pools).find((p) => p.name === name);
}

/** A page of options, its rows groups (`grouped`) or not: refused when they're the other's. */
function rowsOf<G extends boolean>(options: StepOptions, grouped: G) {
  if (options.grouped !== grouped) throw new Error(`The options are grouped: ${options.grouped}, not ${grouped}`);
  return options.items as (G extends true ? StepOptionGroup : StepOption)[];
}

function skillPoints(ctx: Awaited<ReturnType<typeof getSeedCtx>>, points: Record<string, number>) {
  return picks(ctx, { skills: points }).skills;
}

/** What the API answers a call's refusal with, its envelope and status: the server's error, or a ruleset's refusal. */
async function answerTo(call: () => Promise<unknown>) {
  const error = await call().then(
    () => undefined,
    (thrown: Error) => thrown,
  );
  if (!error) throw new Error("The call wasn't refused");
  const [body, status] = toJson(error);
  return { body, status };
}

/** The classes the plan can take next, searched. */
async function classOptions(as: Session, characterId: string, plan: LevelPlanRequest, search?: string) {
  return rowsOf(await getStepOptions(as, characterId, "class-plan", plan, {}, { ...page, search }), false);
}

/** A feat family's members (`group`) in a pool, over the plan, where `at` says. */
async function familyFeats(
  as: Session,
  characterId: string,
  plan: LevelPlanRequest,
  pool: string,
  group: string,
  { advancement, search }: Omit<PickAt, "group" | "tier"> = {},
) {
  return rowsOf(
    await getStepOptions(as, characterId, "feats", plan, { advancement, group, pool }, { ...page, search }),
    false,
  );
}

/** A feat pool's options over the plan, where `at` says, searched: its families grouped, a row each. */
async function featGroups(
  as: Session,
  characterId: string,
  plan: LevelPlanRequest,
  pool: string,
  { advancement, search }: Omit<PickAt, "group" | "tier"> = {},
) {
  return rowsOf(await getStepOptions(as, characterId, "feats", plan, { advancement, pool }, { ...page, search }), true);
}

/**
 * The Blackguard (Dungeon Master's Guide) needs BAB 6, 5 ranks of Hide, 2 of Knowledge (Religion), Power Attack, Cleave
 * and Improved Sunder. Each case leaves one out of the character and supplies it as a pending pick.
 */
async function setupCandidate(missing: { bab?: boolean; feat?: string; skill?: string }) {
  const ctx = await getSeedCtx();
  const fork = await RulesetsService.forkRuleset(session, ctx.rulesetId, {
    name: `Blackguard Fork ${uniqueId()}`,
    private: false,
  });
  const dmg = await findSeededRuleset(DND35_DMG_NAME);
  await RulesetExtensionsService.subscribeExtension(session, fork.id, [dmg.id]);
  const blackguard = (await Entities.findOne<Klass>(db, {
    entityType: "classes",
    name: "Blackguard",
    rulesetId: dmg.id,
  }))!;

  const characterId = await createSeedCharacter(ctx, "fighter", {
    xp: 36000,
    alignment: "Chaotic Evil",
    rulesetId: fork.id,
  });
  const fighterLevels = missing.bab ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
  const levelIds = await addClassLevels(
    db,
    ctx,
    characterId,
    "Fighter",
    fighterLevels,
    fighterLevels.map(() => 10),
  );
  // Both skills are cross-class for a fighter: 2 points a rank.
  const skills = [
    { skillName: "Hide", rank: 10 },
    { skillName: "Knowledge (Religion)", rank: 4 },
  ].filter((s) => s.skillName !== missing.skill);
  await addSkills(
    db,
    ctx,
    levelIds,
    skills.map((s) => ({ ...s, levelIndex: 0 })),
  );
  const feats = [
    { levelIndex: 0, aptitude: "General", featName: "Power Attack" },
    { levelIndex: 0, aptitude: "Fighter Bonus Feat", featName: "Improved Sunder" },
    { levelIndex: 1, aptitude: "Fighter Bonus Feat", featName: "Cleave" },
  ].filter((f) => f.featName !== missing.feat);
  await addFeats(db, ctx, levelIds, feats);

  // The plan's levels, in order, and its picks so far
  const eligible = async (levels: PlannedClassLevel[] = [], picked: PlanPicks = {}) =>
    (await classOptions(session, characterId, levelUpPlan(levels, picked))).find((k) => k.id === blackguard.id)!
      .eligible;
  const klassLevel = (klass: string, level: number) => planned(ctx.klassMap.pc[klass], level);
  return { ctx, eligible, klassLevel };
}

/** A dwarf with a barbarian level, then fighter levels, made in that order. */
async function setupMulticlass(fighterLevels: number) {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "dwarf", { xp: 9000 });
  const levelIds = [(await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]))[0]];
  for (let level = 1; level <= fighterLevels; level++)
    levelIds.push((await addClassLevels(db, ctx, characterId, "Fighter", [level], [8]))[0]);
  return { ctx, characterId, levelIds };
}

/**
 * A small ruleset of a new user's, with a class of five levels, three skills,
 * feats (Power Attack, Weapon Focus which stacks, Dodge) and spells each in an
 * aptitude of their own; and a character of the user's on it. With `fork`,
 * the content is another user's and the character is on the user's fork of it.
 */
async function setupRuleset({ fork = false } = {}) {
  const { user, session } = await createTestUser();
  const { user: author } = await createTestUser();
  const owner = fork ? author : user;
  const parent = await createTestRuleset(owner.id, { status: "Published" });
  const characterRuleset = fork
    ? await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] })
    : parent;
  const rulesetId = parent.id;

  const [race] = await Entities.create<Race>(db, "races", {
    name: "Test Race",
    rulesetId,
    size: "Medium",
    baseSpeed: 30,
  });
  const [klass] = await Entities.create<Klass>(db, "classes", { name: "Test Class", rulesetId, hd: 8 });
  const klassLevels = [];
  for (let level = 1; level <= 5; level++) {
    const [klassLevel] = await Entities.create<KlassLevel>(db, "class_levels", { klassId: klass.id, level });
    await writeStoredValues("class_levels", klassLevel.id, [
      [CLASS_LEVEL_BAB, level],
      [CLASS_LEVEL_SKILL_POINTS, 2 + Math.floor(level / 2)],
    ]);
    klassLevels.push(klassLevel);
  }
  const [generalAptitude] = await Entities.create<Aptitude>(db, "aptitudes", { name: "general", rulesetId });
  const [[featAptitude], [spellAptitude]] = [
    await Entities.create<Aptitude>(db, "aptitudes", { name: "Feat Aptitude", rulesetId }),
    await Entities.create<Aptitude>(db, "aptitudes", { name: "Spell Aptitude", rulesetId }),
  ];
  const abilities = await Entities.createMany<RulesetAbility>(
    db,
    "abilities",
    ["Charisma", "Dexterity", "Intelligence"].map((name) => ({ name, description: name, rulesetId })),
  );
  const skillList = await Entities.createMany<Skill>(
    db,
    "skills",
    [
      ["Diplomacy", 0],
      ["Stealth", 1],
      ["Knowledge (Arcana)", 2],
    ].map(([name, ability]) => ({
      name: name as string,
      rulesetId,
      primaryAbilityId: abilities[ability as number].id,
    })),
  );
  const featList = await Entities.createMany<Feat>(db, "feats", [
    { name: "Power Attack", rulesetId, stackable: false },
    { name: "Weapon Focus", rulesetId, stackable: true },
    { name: "Dodge", rulesetId, stackable: false },
  ]);
  const spellList = await Entities.createMany<Spell>(
    db,
    "spells",
    ["Sneak Attack", "Rage", "Uncanny Dodge"].map((name) => ({ name, rulesetId })),
  );
  await Joins.createMany(
    db,
    "feats_aptitudes",
    featList.map((f) => ({ featId: f.id, aptitudeId: featAptitude.id })),
  );
  await Joins.createMany(
    db,
    "spells_aptitudes",
    spellList.map((p) => ({ spellId: p.id, aptitudeId: spellAptitude.id })),
  );

  const character = await createTestCharacter(user.id, { rulesetId: characterRuleset.id, raceId: race.id });
  const byName = <T extends { name: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.name, r]));
  return {
    user,
    session,
    parent,
    ruleset: characterRuleset,
    character,
    race,
    klass,
    klassLevels,
    featAptitude,
    generalAptitude,
    spellAptitude,
    abilities,
    skills: byName(skillList),
    feats: byName(featList),
    spells: byName(spellList),
  };
}

/** The Wizard Spells a wizard's level `level` offers, at any spell level, with the feats the plan picks. */
async function spellNames(characterId: string, level: number, feats: PlanPicks["feats"] = {}) {
  const ctx = await getSeedCtx();
  const plan = levelUpPlan([planned(ctx.klassMap.pc["Wizard"], level)], { feats });
  return names(await spellOptions(session, characterId, plan, ctx.aptMap["Wizard Spells"]));
}

/** A spell pool's options over the plan, where `at` says: at a tier (a spell level), or at any. */
async function spellOptions(
  as: Session,
  characterId: string,
  plan: LevelPlanRequest,
  pool: string,
  { advancement, search, tier }: Omit<PickAt, "group"> = {},
) {
  return rowsOf(
    await getStepOptions(as, characterId, "spells", plan, { advancement, pool, tier }, { ...page, search }),
    false,
  );
}

afterAll(() => lockPool.end());

describe("LevelsService", () => {
  test("refuses a missing character, another user's, a missing class level, and removing from a character without levels", async () => {
    const { session, character, klass, featAptitude, spellAptitude } = await setupRuleset();
    const { session: other } = await createTestUser();
    const first = levelUpPlan([planned(klass.id, 1)]);
    // The class has five levels
    const past = levelUpPlan([planned(klass.id, 6)]);
    const notFound = [
      () => getStepOptions(session, NIL_UUID, "class-plan", { steps: {} }),
      () => getStepOptions(other, character.id, "class-plan", { steps: {} }),
      () => getPlanAnswer(session, NIL_UUID, first),
      () => getPlanAnswer(other, character.id, first),
      () => getPlanAnswer(session, character.id, past),
      () => getPlanAnswer(session, character.id, editPlan(NIL_UUID, { hp: 8 })),
      () => CharacterLevelsService.getLevelPlan(session, character.id, NIL_UUID),
      () => getStepOptions(session, NIL_UUID, "feats", first, { pool: featAptitude.id }),
      () => getStepOptions(session, character.id, "feats", past, { pool: featAptitude.id }),
      () => getStepOptions(session, NIL_UUID, "spells", first, { pool: spellAptitude.id }),
      () => getStepOptions(session, character.id, "spells", past, { pool: spellAptitude.id }),
      () => addOneLevel(session, NIL_UUID, klass.id, 1, 8, null, {}, {}, {}),
      () => addOneLevel(session, character.id, klass.id, 6, 8, null, {}, {}, {}),
      () => CharacterLevelsService.removeLevel(session, NIL_UUID),
      () => CharacterLevelsService.removeLevel(other, character.id),
      () => CharacterLevelsService.removeLevel(session, character.id),
    ];
    // One at a time: the test's transaction has a single connection.
    for (const call of notFound) expect((await answerTo(call)).status).toBe(404);
    // A level past the rules' last class level is refused before it's looked up
    const pastRules = levelUpPlan([planned(klass.id, 999)]);
    for (const call of [
      () => addOneLevel(session, character.id, klass.id, 999, 8, null, {}, {}, {}),
      () => getPlanAnswer(session, character.id, pastRules),
    ])
      expect((await answerTo(call)).status).toBe(400);
  });

  describe("classes a character can take", () => {
    test("lists each with its next level and whether the character qualifies", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
      const classes = () => classOptions(session, characterId, { steps: {} });
      expect(
        (await classes()).filter((k) => [ctx.klassMap.pc["Fighter"], ctx.klassMap.pc["Rogue"]].includes(k.id)),
      ).toMatchObject([
        { track: { next: 1 }, eligible: true },
        { track: { next: 1 }, eligible: true },
      ]);

      await addFighterLevels(session, ctx, characterId, 1);
      expect((await classes()).find((k) => k.id === ctx.klassMap.pc["Fighter"])).toMatchObject({
        track: { next: 2 },
        eligible: true,
      });
    });

    test("counts any feat of a family a class requires, and only those", async () => {
      const ctx = await getSeedCtx();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const [klass] = await Entities.create<Klass>(db, "classes", {
        name: `Kensai ${uniqueId()}`,
        rulesetId: fork.id,
        hd: 10,
      });
      const [level] = await Entities.create<KlassLevel>(db, "class_levels", { klassId: klass.id, level: 1 });
      await Requirements.create(db, {
        entityId: level.id,
        entityType: "class_levels",
        level: "1",
        target: "feats.weaponfocus.*.possessed",
        operator: "equal",
        value: "true",
        valueType: "boolean",
      });
      const eligibleWith = async (featName: string) => {
        const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000, rulesetId: fork.id });
        const levelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
        await addFeats(db, ctx, levelIds, [{ levelIndex: 0, aptitude: "Fighter Bonus Feat", featName }]);
        const items = await classOptions(session, characterId, { steps: {} });
        return items.find((k) => k.id === klass.id)?.eligible;
      };

      expect(await eligibleWith("Weapon Focus: Longsword")).toBe(true);
      expect(await eligibleWith("Power Attack")).toBe(false);
    });

    test("checks a class's own requirements with its next level's, in the list and on saving", async () => {
      const ctx = await getSeedCtx();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const [klass] = await Entities.create<Klass>(db, "classes", {
        name: `Duelist ${uniqueId()}`,
        rulesetId: fork.id,
        hd: 10,
      });
      const [level] = await Entities.create<KlassLevel>(db, "class_levels", { klassId: klass.id, level: 1 });
      // The class requires Power Attack, its first level a base attack bonus of +1, which a fighter 1 has
      for (const [entityId, entityType, target, operator, value, valueType] of [
        [klass.id, "classes", "feats.powerattack.possessed", "equal", "true", "boolean"],
        [level.id, "class_levels", "combat.bab", "greater_than_or_equal", "1", "number"],
      ])
        await Requirements.create(db, { entityId, entityType, level: "1", target, operator, value, valueType });

      const fighterWith = async (featName: string) => {
        const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000, rulesetId: fork.id });
        const levelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
        await addFeats(db, ctx, levelIds, [{ levelIndex: 0, aptitude: "Fighter Bonus Feat", featName }]);
        return characterId;
      };
      const eligible = async (characterId: string) =>
        (await classOptions(session, characterId, { steps: {} })).find((k) => k.id === klass.id)?.eligible;
      const saving = (characterId: string) =>
        addOneLevel(session, characterId, klass.id, 1, 8, null).then(
          () => "saved",
          (error: Error) => error.message,
        );

      const withPowerAttack = await fighterWith("Power Attack");
      const withWeaponFocus = await fighterWith("Weapon Focus: Longsword");
      expect(await eligible(withPowerAttack)).toBe(true);
      expect(await eligible(withWeaponFocus)).toBe(false);
      expect(await saving(withPowerAttack)).not.toContain("(Class)");
      expect(await saving(withWeaponFocus)).toContain(`Unmet prerequisite on ${klass.name} (Class)`);
    });

    describe("counts the levels, feats and skill ranks being added toward a prestige class", () => {
      test("a pending level brings the BAB", async () => {
        const { eligible, klassLevel } = await setupCandidate({ bab: true });
        expect(await eligible()).toBe(false);
        expect(await eligible([klassLevel("Fighter", 6)])).toBe(true);
      });

      test("a pending feat pick brings the missing feat", async () => {
        const { ctx, eligible } = await setupCandidate({ feat: "Cleave" });
        expect(await eligible()).toBe(false);
        expect(await eligible([], { feats: { [ctx.aptMap["General"]]: [ctx.featMap["Cleave"]] } })).toBe(true);
      });

      test("pending skill points bring the missing skill, spent over the planned levels as the save spends them", async () => {
        const { ctx, eligible, klassLevel } = await setupCandidate({ skill: "Hide" });
        const hide = { skills: { [ctx.skillMap["Hide"]]: 5 } };
        expect(await eligible()).toBe(false);
        // A rogue level takes them as a class skill's, a rank a point, wherever the plan puts it
        expect(await eligible([klassLevel("Fighter", 7), klassLevel("Rogue", 1)], hide)).toBe(true);
        // A fighter level alone takes as many as its points allow, at two a rank
        expect(await eligible([klassLevel("Fighter", 7)], hide)).toBe(false);
      });
    });
  });

  test("offers an ability increase every fourth character level, picked as the save checks it", async () => {
    const { session, character, klass, klassLevels, abilities } = await setupRuleset();
    await addCharacterLevel(character.id, klassLevels[0].id);
    await addCharacterLevel(character.id, klassLevels[1].id);
    const abilityStep = async (level: number, abilityIncreases: PlannedClassLevel["abilityIncreases"] = []) =>
      stepAnswerOf(
        await getPlanAnswer(session, character.id, levelUpPlan([planned(klass.id, level, abilityIncreases)])),
        "abilities",
        "choose",
      );
    // Nothing to pick at a level that takes none
    expect(await abilityStep(3)).toEqual({
      mechanic: "choose",
      advancements: [],
      amount: 1,
      chosen: true,
      options: expect.any(Array),
    });

    await addCharacterLevel(character.id, klassLevels[2].id);
    const fourth = await abilityStep(4);
    expect(fourth).toMatchObject({ advancements: [0], amount: 1, chosen: false, options: expect.any(Array) });
    // One at a time: the test's transaction has a single connection
    const picked = [];
    for (const amounts of [[1], [2], [1, 1]]) {
      const abilityIncreases = amounts.map((amount, i) => ({ abilityId: abilities[i].id, amount }));
      picked.push((await abilityStep(4, abilityIncreases)).chosen);
    }
    // One ability raised by 1, as 3.5's fourth level takes, and the save checks
    expect(picked).toEqual([true, false, false]);
  });

  describe("skill slots", () => {
    test("list the ruleset's skills with the class's marked and the character's current ranks", async () => {
      const { session, character, klass, klassLevels, skills } = await setupRuleset();
      await Joins.create<KlassSkill>(db, "class_skills", { klassId: klass.id, skillId: skills["Diplomacy"].id });
      const [level] = await CharacterAdvancements.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
      });
      await Picks.createMany(db, "skills", [{ characterLevelId: level.id, skillId: skills["Diplomacy"].id, rank: 1 }]);

      const answer = await getPlanAnswer(session, character.id, levelUpPlan([planned(klass.id, 2)]));
      // The character's second level
      expect(answer.advancements).toMatchObject([{ position: 2, track: { id: klass.id } }]);
      const slots = stepAnswerOf(answer, "skills", "spend");
      expect(slots.budget).toBeGreaterThan(0);
      expect(
        slots.rows
          .map(({ name, favored, current }) => ({ name, favored, current }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Diplomacy", favored: true, current: 1 },
        { name: "Knowledge (Arcana)", favored: false, current: 0 },
        { name: "Stealth", favored: false, current: 0 },
      ]);
    });

    test("add the skill points an intelligence increase earns back to earlier levels, and not those of a misc bonus", async () => {
      const ctx = await getSeedCtx();
      // INT 13: (2 + 1 + 1) = 4 points a level. Levels 1 to 3 spent 16 + 4 + 4 = 24.
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000, abilities: { Intelligence: 13 } });
      await addFighterLevels(session, ctx, characterId, 3);
      const budget = async (abilityId?: string) =>
        stepAnswerOf(
          await getPlanAnswer(
            session,
            characterId,
            levelUpPlan([planned(ctx.klassMap.pc["Fighter"], 4, increasesOf(abilityId))]),
          ),
          "skills",
          "spend",
        ).budget;

      expect(await budget()).toBe(4);
      // INT 14 makes it 5 a level: 20 + 5 + 5 + 5 = 35, less the 24 spent.
      expect(await budget(ctx.abilityMap["Intelligence"])).toBe(11);

      // A misc bonus to intelligence raises the score, not the skill points.
      await Modifiers.create(db, {
        sourceId: ctx.featMap["Power Attack"],
        sourceType: "feats",
        target: "abilities.intelligence.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      });
      invalidateSeededRuleset(ctx.rulesetId);
      expect(await budget()).toBe(4);
    });

    test("mark a class's skills on a fork of the seeded ruleset", async () => {
      const ctx = await getSeedCtx();
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const characterId = await createSeedCharacter(ctx, "cleric", { rulesetId: fork.id });

      const { rows } = stepAnswerOf(
        await getPlanAnswer(session, characterId, levelUpPlan([planned(ctx.klassMap.pc["Cleric"], 1)])),
        "skills",
        "spend",
      );
      const favored = (name: string) => rows.find((s) => s.name === name)!.favored;
      expect(favored("Heal")).toBe(true);
      expect(favored("Diplomacy")).toBe(true);
      expect(favored("Hide")).toBe(false);
    });

    test("list an inherited ruleset's skills, a class skill's subtypes counting as class skills", async () => {
      const { parent, session, character, klass, abilities } = await setupRuleset({ fork: true });
      const intelligence = abilities.find((a) => a.name === "Intelligence")!;
      const [[craft]] = [
        await Entities.create<Skill>(db, "skills", {
          name: "Craft",
          rulesetId: parent.id,
          primaryAbilityId: intelligence.id,
        }),
        await Entities.create<Skill>(db, "skills", {
          name: "Craft (Alchemy)",
          rulesetId: parent.id,
          primaryAbilityId: intelligence.id,
        }),
      ];
      await Joins.create<KlassSkill>(db, "class_skills", { klassId: klass.id, skillId: craft.id });

      const { rows } = stepAnswerOf(
        await getPlanAnswer(session, character.id, levelUpPlan([planned(klass.id, 1)])),
        "skills",
        "spend",
      );
      expect(
        rows
          .filter((s) => s.favored)
          .map((s) => s.name)
          .sort(),
      ).toEqual(["Craft", "Craft (Alchemy)"]);
      expect(names(rows).sort()).toEqual(["Craft", "Craft (Alchemy)", "Diplomacy", "Knowledge (Arcana)", "Stealth"]);
    });
  });

  describe("feat slots and the feats of a pool", () => {
    test("list a class level's granted feats, and leave them out of the picks unless they stack", async () => {
      const { session, character, klass, klassLevels, featAptitude, feats } = await setupRuleset();
      await Joins.create<KlassLevelFeat>(db, "class_level_feats", {
        klassLevelId: klassLevels[0].id,
        featId: feats["Power Attack"].id,
        aptitudeId: featAptitude.id,
        free: true,
      });

      const plan = levelUpPlan([planned(klass.id, 1)]);
      expect(stepAnswerOf(await getPlanAnswer(session, character.id, plan), "feats", "pick").granted).toMatchObject([
        { id: feats["Power Attack"].id },
      ]);
      const available = await featGroups(session, character.id, plan, featAptitude.id);
      expect(names(available).sort()).toEqual(["Dodge", "Weapon Focus"]);
      // Picking the granted feat anyway is refused.
      expect(
        addOneLevel(
          session,
          character.id,
          klass.id,
          1,
          8,
          null,
          {},
          { [featAptitude.id]: [feats["Power Attack"].id] },
          {},
        ),
      ).rejects.toThrow('Non-stackable feat "Power Attack" is already on this character');
    });

    test("count the feats a level grants, free or not, toward the prerequisites of the feats it picks", async () => {
      const { session, character, klass, klassLevels, featAptitude, generalAptitude, feats, skills } =
        await setupRuleset();
      await Joins.create<KlassLevelFeat>(db, "class_level_feats", {
        klassLevelId: klassLevels[0].id,
        featId: feats["Power Attack"].id,
        aptitudeId: featAptitude.id,
        free: false,
      });
      await Joins.create(db, "feats_aptitudes", { featId: feats["Dodge"].id, aptitudeId: generalAptitude.id });
      await Requirements.create(db, {
        entityId: feats["Dodge"].id,
        entityType: "feats",
        level: "1",
        target: "feats.powerattack.possessed",
        operator: "equal",
        value: "true",
        valueType: "boolean",
      });

      // Its 8 skill points on two cross-class skills, its general feat on Dodge, which takes Power Attack
      const points = { [skills["Diplomacy"].id]: 4, [skills["Stealth"].id]: 4 };
      const pick = { [generalAptitude.id]: [feats["Dodge"].id] };
      expect(await addOneLevel(session, character.id, klass.id, 1, 8, null, points, pick, {})).toBeDefined();
    });

    test("refuse a feat an earlier level grants once the fork copies the class, and leave it out of the picks", async () => {
      // Editing an inherited class in a fork copies it there (copy-on-write): the character's levels then read the
      // copy's, whose grants a lookup by the levels' stored class levels never reached
      const { session, ruleset, character, klass, klassLevels, featAptitude, feats } = await setupRuleset({
        fork: true,
      });
      await Joins.create<KlassLevelFeat>(db, "class_level_feats", {
        klassLevelId: klassLevels[0].id,
        featId: feats["Power Attack"].id,
        aptitudeId: featAptitude.id,
        free: true,
      });
      await addOneLevel(session, character.id, klass.id, 1, 8, null, {}, {}, {}, true);
      await EntitiesService.updateEntity(session, ruleset.id, "classes", klass.id, {
        name: "Test Class",
        description: "Ours",
      });
      const copy = (await Entities.findOne<Klass>(db, {
        entityType: "classes",
        name: "Test Class",
        rulesetId: ruleset.id,
      }))!;

      const available = await featGroups(session, character.id, levelUpPlan([planned(copy.id, 2)]), featAptitude.id);
      expect(names(available)).not.toContain("Power Attack");
      expect(
        addOneLevel(
          session,
          character.id,
          copy.id,
          2,
          8,
          null,
          {},
          { [featAptitude.id]: [feats["Power Attack"].id] },
          {},
          true,
        ),
      ).rejects.toThrow('Non-stackable feat "Power Attack" is already on this character');
    });

    test("leave out and refuse a feat the character has once the fork copies it", async () => {
      // Editing an inherited feat in a fork copies it there: the copy stands for the feat a level picked or was granted
      const { session, ruleset, character, klass, klassLevels, featAptitude, feats } = await setupRuleset({
        fork: true,
      });
      await Joins.create<KlassLevelFeat>(db, "class_level_feats", {
        klassLevelId: klassLevels[0].id,
        featId: feats["Power Attack"].id,
        aptitudeId: featAptitude.id,
        free: true,
      });
      await addCharacterLevel(character.id, klassLevels[0].id, {
        feats: [{ featId: feats["Dodge"].id, aptitudeId: featAptitude.id }],
      });
      const copies = [];
      for (const name of ["Dodge", "Power Attack"]) {
        copies.push(
          await EntitiesService.updateEntity(session, ruleset.id, "feats", feats[name].id, {
            name,
            description: "Ours",
          }),
        );
      }

      const available = await featGroups(session, character.id, levelUpPlan([planned(klass.id, 2)]), featAptitude.id);
      expect(names(available)).toEqual(["Weapon Focus"]);
      for (const copy of copies) {
        expect(
          addOneLevel(session, character.id, klass.id, 2, 8, null, {}, { [featAptitude.id]: [copy.id] }, {}, true),
        ).rejects.toThrow(`Non-stackable feat "${copy.name}" is already on this character`);
      }
    });

    test("stop granting a feat the fork deletes", async () => {
      // Deleting an inherited feat in a fork copies it there and deletes the copy: the fork no longer has the feat
      const { session, ruleset, character, klassLevels, featAptitude, feats } = await setupRuleset({ fork: true });
      await Joins.create<KlassLevelFeat>(db, "class_level_feats", {
        klassLevelId: klassLevels[0].id,
        featId: feats["Power Attack"].id,
        aptitudeId: featAptitude.id,
        free: true,
      });
      await addCharacterLevel(character.id, klassLevels[0].id);
      const held = async () => {
        const detailedCharacter = await buildAs(
          DetailedCharacter,
          (await Characters.findOne(db, { id: character.id }))!,
        );
        return detailedCharacter
          .getHeldFeats()
          .filter((feat) => !feat.stackable)
          .map((feat) => feat.id);
      };
      expect(await held()).toEqual([feats["Power Attack"].id]);

      await EntitiesService.deleteEntity(session, ruleset.id, "feats", feats["Power Attack"].id);
      expect(await held()).toEqual([]);
    });

    test("leave out a feat the character has, unless it stacks, and those that can't be picked", async () => {
      const { session: owner, character, klass, klassLevels, featAptitude, feats } = await setupRuleset();
      const [classFeature] = await Entities.create<Feat>(db, "feats", {
        name: "Class Feature",
        rulesetId: klass.rulesetId,
        selectable: false,
      });
      await Joins.create(db, "feats_aptitudes", { featId: classFeature.id, aptitudeId: featAptitude.id });
      await addCharacterLevel(character.id, klassLevels[0].id, {
        feats: [feats["Power Attack"], feats["Weapon Focus"]].map((f) => ({
          featId: f.id,
          aptitudeId: featAptitude.id,
        })),
      });

      const available = await featGroups(owner, character.id, levelUpPlan([planned(klass.id, 2)]), featAptitude.id);
      expect(
        available.map(({ name, eligible }) => ({ name, eligible })).sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Dodge", eligible: true },
        { name: "Weapon Focus", eligible: true },
      ]);

      // The seeded barbarian's class features are all picked for them.
      const ctx = await getSeedCtx();
      const barbarian = await createSeedCharacter(ctx, "fighter", { alignment: "Chaotic Neutral" });
      expect(
        await featGroups(
          session,
          barbarian,
          levelUpPlan([planned(ctx.klassMap.pc["Barbarian"], 1)]),
          ctx.aptMap["Barbarian Class Feature"],
        ),
      ).toEqual([]);
    });

    test("flag a pool that spells share, optional to the feats step", async () => {
      const { session, character, klass, feats, spells } = await setupRuleset();
      const [shared] = await Entities.create<Aptitude>(db, "aptitudes", {
        name: "Shared Aptitude",
        rulesetId: klass.rulesetId,
      });
      await Joins.create(db, "feats_aptitudes", { featId: feats["Dodge"].id, aptitudeId: shared.id });
      await Joins.create(db, "spells_aptitudes", { spellId: spells["Rage"].id, aptitudeId: shared.id });

      const { pools } = stepAnswerOf(
        await getPlanAnswer(session, character.id, levelUpPlan([planned(klass.id, 1)])),
        "feats",
        "pick",
      );
      const optionalByName = Object.fromEntries(Object.values(pools).map((p) => [p.name, p.optional]));
      expect(optionalByName).toMatchObject({
        "Shared Aptitude": true,
        "Spell Aptitude": true,
        "Feat Aptitude": false,
      });
    });

    test("mark a feat eligible only when the character meets its ability requirement", async () => {
      const ctx = await getSeedCtx();
      const eligibility = async (dexterity: number, search: string) => {
        const characterId = await createSeedCharacter(ctx, "fighter", { abilities: { Dexterity: dexterity } });
        const items = await featGroups(
          session,
          characterId,
          levelUpPlan([planned(ctx.klassMap.pc["Fighter"], 1)]),
          ctx.aptMap["General"],
          { search },
        );
        return items.find((f) => f.name === search)!.eligible;
      };
      // Dodge needs DEX 13.
      expect(await eligibility(8, "Dodge")).toBe(false);
      expect(await eligibility(14, "Dodge")).toBe(true);
      expect(await eligibility(8, "Improved Initiative")).toBe(true);
    });

    test.each([
      ["Fighter", 1, "Fighter Bonus Feat"],
      ["Monk", 1, "Monk Bonus Feat (1st)"],
      ["Ranger", 2, "Ranger Combat Style (2nd)"],
      ["Rogue", 10, "Rogue Special Ability"],
      ["Wizard", 1, "Wizard Specialization"],
    ])("open the %s's pool at level %i: %s", async (klass, level, poolName) => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, klass === "Wizard" ? "wizard" : "fighter", {
        xp: 45000,
        abilities: { Dexterity: 18, Wisdom: 16 },
      });
      if (level > 1) {
        const levelIds = await addClassLevels(
          db,
          ctx,
          characterId,
          klass,
          Array.from({ length: level - 1 }, (_, i) => i + 1),
          Array.from({ length: level - 1 }, () => 6),
        );
        const earlyFeats =
          klass === "Ranger" ? [{ levelIndex: 0, featName: "Track", aptitude: "Ranger Class Feature" }] : [];
        await addFeats(db, ctx, levelIds, earlyFeats);
      }
      const { pools } = stepAnswerOf(
        await getPlanAnswer(session, characterId, levelUpPlan([planned(ctx.klassMap.pc[klass], level)])),
        "feats",
        "pick",
      );
      expect(pool(pools, poolName)).toMatchObject({ available: 1 });
      // A wizard picks the schools to give up once specialized.
      if (klass === "Wizard") expect(pool(pools, "Prohibited School")?.available ?? 0).toBe(0);
    });

    test("tell how many prohibited schools each wizard specialty opens", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "wizard");
      const prohibited = async (specialty: string) => {
        const plan = levelUpPlan([planned(ctx.klassMap.pc["Wizard"], 1)], {
          feats: { [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap[specialty]] },
        });
        const { pools } = stepAnswerOf(await getPlanAnswer(session, characterId, plan), "feats", "pick");
        return pool(pools, "Prohibited School");
      };
      expect(await prohibited("Evocation Specialist")).toMatchObject({ allowed: 2 });
      expect(await prohibited("Divination Specialist")).toMatchObject({ allowed: 1 });
      expect((await prohibited("Generalist"))?.allowed ?? 0).toBe(0);
    });

    test("group a pool's feat families, leaving out what the character has and flagging single feats' eligibility", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
      await levelUp(session, ctx, characterId, "Fighter", 1, {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Weapon Focus: Longsword"] },
      });
      const plan = levelUpPlan([planned(ctx.klassMap.pc["Fighter"], 2)]);
      const general = ctx.aptMap["General"];
      const grouped = await featGroups(session, characterId, plan, general);

      const weaponFocus = await familyFeats(session, characterId, plan, general, "Weapon Focus");
      expect(weaponFocus.every((f) => f.name.startsWith("Weapon Focus: ") && typeof f.eligible === "boolean")).toBe(
        true,
      );
      expect(names(weaponFocus)).not.toContain("Weapon Focus: Longsword");
      expect(grouped.find((r) => r.group === "Weapon Focus")).toMatchObject({
        name: "Weapon Focus",
        count: weaponFocus.length,
      });
      // A family row is always offered: its variants carry the eligibility.
      expect(grouped.find((r) => r.group === "Weapon Specialization")).toMatchObject({ eligible: true });
      expect(grouped.find((r) => r.group === null && r.name === "Power Attack")).toBeUndefined();
      expect(grouped.find((r) => r.group === null && r.name === "Cleave")).toMatchObject({ eligible: true });
      // Fewer rows than the feats they hold
      expect(grouped.length).toBeLessThan(grouped.reduce((sum, r) => sum + r.count, 0));
    });

    test("offer Martial Weapon Proficiency one weapon at a time: every martial weapon is a class's, no pick", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "wizard");
      const plan = levelUpPlan([planned(ctx.klassMap.pc["Wizard"], 1)]);
      const general = ctx.aptMap["General"];
      const grouped = await featGroups(session, characterId, plan, general);
      const martial = await familyFeats(session, characterId, plan, general, "Martial Weapon Proficiency");

      // The 30 martial weapons, but the six an elf has by her race: the longsword, the rapier, the bows
      expect(martial).toHaveLength(24);
      expect(martial.every((f) => f.name.startsWith("Martial Weapon Proficiency: ") && f.eligible)).toBe(true);
      expect(martial.some((f) => f.name === "Martial Weapon Proficiency: Longsword")).toBe(false);
      expect(grouped.filter((r) => r.name === "Martial Weapon Proficiency")).toMatchObject([
        { group: "Martial Weapon Proficiency", count: 24 },
      ]);
      // Simple Weapon Proficiency is every simple weapon, a feat of its own
      expect(grouped.find((r) => r.name === "Simple Weapon Proficiency")).toMatchObject({ group: null });
    });

    test("leave out a feat that a pending level grants", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000 });
      const fighter = planned(ctx.klassMap.pc["Fighter"], 1);
      // The first ranger level grants Track: planned before the fighter's, the pick lands on the fighter's
      const ranger = planned(ctx.klassMap.pc["Ranger"], 1);
      const offered = async (levels: PlannedClassLevel[], advancement: number) =>
        names(
          await featGroups(session, characterId, levelUpPlan(levels), ctx.aptMap["General"], {
            advancement,
            search: "Track",
          }),
        );
      expect(await offered([fighter], 0)).toContain("Track");
      expect(await offered([ranger, fighter], 1)).not.toContain("Track");
    });

    test("leave out a feat that a level planned after the picker's grants, as the plan drops it and the save refuses it", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
      // A fighter's first level, then a ranger's, which grants Track
      const [fighter, ranger] = [planned(ctx.klassMap.pc["Fighter"], 1), planned(ctx.klassMap.pc["Ranger"], 1)];
      const offered = async (levels: PlannedClassLevel[]) =>
        names(
          await featGroups(session, characterId, levelUpPlan(levels), ctx.aptMap["General"], {
            advancement: 0,
            search: "Track",
          }),
        );
      expect(await offered([fighter])).toContain("Track");
      expect(await offered([fighter, ranger])).not.toContain("Track");

      const levels = ["Fighter", "Ranger"].map((klass) => ({
        abilityIncreases: [],
        hp: 8,
        klassId: ctx.klassMap.pc[klass],
        level: 1,
      }));
      const { skills, feats } = picks(ctx, {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Power Attack", "Track"], "Fighter Bonus Feat": ["Improved Initiative"] },
      });
      const plan = levelUpPlan(levels, { skills, feats });
      const answer = await getPlanAnswer(session, characterId, plan);
      expect(stepAnswerOf(answer, "feats", "pick").fitted[ctx.aptMap["General"]]).toEqual([
        ctx.featMap["Power Attack"],
      ]);
      for (const force of [false, true]) {
        expect(CharacterLevelsService.addLevels(session, characterId, plan, force)).rejects.toThrow(
          'Non-stackable feat "Track" is already on this character',
        );
      }
    });

    test("count the feats picked in the same level-up", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter");
      const general = ctx.aptMap["General"];
      const powerAttack = { [general]: [ctx.featMap["Power Attack"]] };
      const offered = (feats: PlanPicks["feats"], search?: string) =>
        featGroups(session, characterId, levelUpPlan([planned(ctx.klassMap.pc["Fighter"], 1)], { feats }), general, {
          search,
        });
      const cleave = async (feats?: PlanPicks["feats"]) => ({
        searched: (await offered(feats, "Cleave")).find((f) => f.name === "Cleave")!.eligible,
        grouped: (await offered(feats)).find((r) => r.group === null && r.name === "Cleave")!.eligible,
      });

      // Cleave needs Power Attack.
      expect(await cleave()).toEqual({ searched: false, grouped: false });
      expect(await cleave(powerAttack)).toEqual({ searched: true, grouped: true });
      expect(names(await offered(powerAttack, "Power Attack"))).not.toContain("Power Attack");
    });

    test("judge requirements at the level being edited, not the character's last", async () => {
      const ctx = await getSeedCtx();
      const featsAtFirstLevel = async (klass: string, search: string) => {
        const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
        const [firstLevel] = await addClassLevels(db, ctx, characterId, klass, [1, 2], [4, 3]);
        const plan = editPlan(firstLevel, { hp: 4 });
        const general = ctx.aptMap["General"];
        return {
          flat: (await familyFeats(session, characterId, plan, general, "Weapon Focus", { search })).filter((f) =>
            f.name.startsWith(search),
          ),
          grouped: await featGroups(session, characterId, plan, general),
        };
      };
      // A first wizard level has BAB +0: Weapon Focus and Cleave need +1.
      const wizard = await featsAtFirstLevel("Wizard", "Weapon Focus");
      expect(wizard.flat.length).toBeGreaterThan(0);
      expect(wizard.flat.every((f) => !f.eligible)).toBe(true);
      expect(wizard.grouped.find((r) => r.group === null && r.name === "Cleave")).toMatchObject({
        eligible: false,
      });
      // A first fighter level has +1.
      expect((await featsAtFirstLevel("Fighter", "Weapon Focus: Longsword")).flat).toMatchObject([{ eligible: true }]);
    });

    test("leave a feat that doesn't stack out of an edited level's pool when a later level takes it, as its step drops it and the edit refuses it", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000 });
      const first = await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
      // The second level picks Dodge, the third, a ranger's first, is granted Track
      await levelUp(session, ctx, characterId, "Fighter", 2, FIGHTER_LEVELS[1]);
      await levelUp(session, ctx, characterId, "Ranger", 1, { hp: 8 }, true);
      const general = ctx.aptMap["General"];
      const offered = async (search: string) =>
        names(await featGroups(session, characterId, editPlan(first.id, { hp: 10 }), general, { search }));

      // The edited level's own Power Attack, which it picks again once removed
      expect(await offered("Power Attack")).toContain("Power Attack");
      for (const feat of ["Dodge", "Track"]) {
        expect(await offered(feat)).not.toContain(feat);
        const picked = { feats: { [general]: ["Power Attack", feat].map((name) => ctx.featMap[name]) } };
        const answer = await getPlanAnswer(session, characterId, editPlan(first.id, { hp: 10 }, picked));
        expect(stepAnswerOf(answer, "feats", "pick").fitted[general]).toEqual([ctx.featMap["Power Attack"]]);
        const { skills, feats, spells } = picks(ctx, {
          ...FIGHTER_LEVELS[0],
          feats: { General: ["Power Attack", feat], "Fighter Bonus Feat": ["Improved Initiative"] },
        });
        expect(
          CharacterLevelsService.updatePlannedLevel(
            session,
            characterId,
            first.id,
            levelEditPlan({ hp: 10 }, { skills, feats, spells }),
          ),
        ).rejects.toThrow(`Non-stackable feat "${feat}" is already on this character`);
      }
    });

    test("list a fork's inherited feats", async () => {
      const { session, character, klass, featAptitude } = await setupRuleset({ fork: true });
      const items = await featGroups(session, character.id, levelUpPlan([planned(klass.id, 1)]), featAptitude.id);
      expect(
        items.map(({ name, eligible }) => ({ name, eligible })).sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Dodge", eligible: true },
        { name: "Power Attack", eligible: true },
        { name: "Weapon Focus", eligible: true },
      ]);
    });
  });

  describe("the War domain", () => {
    test("opens a war weapon pick among thirty martial weapons, each granting Weapon Focus and the weapon's proficiency", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "cleric");
      const cleric = planned(ctx.klassMap.pc["Cleric"], 1);
      const weaponPool = async (domains: string[]) => {
        const plan = levelUpPlan([cleric], {
          feats: { [ctx.aptMap["Cleric Domain"]]: domains.map((name) => ctx.featMap[name]) },
        });
        return pool(
          stepAnswerOf(await getPlanAnswer(session, characterId, plan), "feats", "pick").pools,
          "War Domain Weapon",
        );
      };

      expect((await weaponPool(["Good Domain"]))?.allowed ?? 0).toBe(0);
      expect(await weaponPool(["War Domain", "Good Domain"])).toMatchObject({ allowed: 1 });

      const weapons = await featGroups(
        session,
        characterId,
        levelUpPlan([cleric], { feats: { [ctx.aptMap["Cleric Domain"]]: [ctx.featMap["War Domain"]] } }),
        ctx.aptMap["War Domain Weapon"],
      );
      expect(weapons).toHaveLength(30);
      expect(weapons.every((f) => f.name.startsWith("War Domain Weapon: ") && f.eligible)).toBe(true);
      expect(names(weapons)).toEqual(
        expect.arrayContaining(["War Domain Weapon: Longsword", "War Domain Weapon: Greataxe"]),
      );

      const longsword = ctx.featMap["War Domain Weapon: Longsword"];
      expect(
        (await Modifiers.findMany(db, { sourceIds: [longsword], sourceType: "feats" }))
          .filter((m) => m.target.endsWith(".possessed"))
          .map(({ target, value, operator }) => ({ target, value, operator }))
          .sort((a, b) => a.target.localeCompare(b.target)),
      ).toEqual([
        { target: "feats.martialweaponproficiencylongsword.possessed", value: "true", operator: "set" },
        { target: "feats.weaponfocuslongsword.possessed", value: "true", operator: "set" },
      ]);
      expect((await findStoredValues("feats", longsword)).fields[FEAT_FAMILY].toSorted()).toEqual([
        "Martial Weapon Proficiency",
        "Weapon Focus",
      ]);
    });

    test("takes Weapon Focus in that weapon off the list, and no other", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "cleric", { xp: 1000 });
      await addFighterLevels(session, ctx, characterId, 1);
      await levelUp(session, ctx, characterId, "Cleric", 1, WAR_CLERIC_1);
      const weaponFocus = async (weapon: string) =>
        (
          await familyFeats(
            session,
            characterId,
            levelUpPlan([planned(ctx.klassMap.pc["Fighter"], 2)]),
            ctx.aptMap["General"],
            "Weapon Focus",
            { search: `Weapon Focus: ${weapon}` },
          )
        ).find((f) => f.name === `Weapon Focus: ${weapon}`);

      expect(await weaponFocus("Longsword")).toBeUndefined();
      expect(await weaponFocus("Dagger")).toMatchObject({ eligible: true });
      expect(await weaponFocus("Greataxe")).toMatchObject({ eligible: true });
    });

    test("stays open to a character with Weapon Focus in the weapon, and next to Weapon Focus in another", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "cleric", { xp: 1000 });
      await levelUp(session, ctx, characterId, "Fighter", 1, {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Weapon Focus: Longsword"] },
      });
      const items = await featGroups(
        session,
        characterId,
        levelUpPlan([planned(ctx.klassMap.pc["Cleric"], 1)], {
          feats: { [ctx.aptMap["Cleric Domain"]]: [ctx.featMap["War Domain"]] },
        }),
        ctx.aptMap["War Domain Weapon"],
      );
      expect(items.find((f) => f.name === "War Domain Weapon: Longsword")).toMatchObject({ eligible: true });

      const other = await createSeedCharacter(ctx, "cleric", { xp: 1000 });
      await levelUp(session, ctx, other, "Fighter", 1, {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Weapon Focus: Greataxe"] },
      });
      await levelUp(session, ctx, other, "Cleric", 1, WAR_CLERIC_1);
      const levels = await CharacterAdvancements.findMany(db, { characterId: other });
      const picked = (
        await Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: levels.map((l) => l.id) })
      ).map((f) => f.featId);
      expect(picked).toEqual(
        expect.arrayContaining([ctx.featMap["Weapon Focus: Greataxe"], ctx.featMap["War Domain Weapon: Longsword"]]),
      );
    });
  });

  describe("spell slots and the spells of a pool", () => {
    test("list a class level's granted spells, and leave them and those the character has out of the picks", async () => {
      const { session, character, klass, klassLevels, spellAptitude, spells } = await setupRuleset();
      await Joins.createMany<KlassLevelSpell>(db, "class_level_spells", [
        { klassLevelId: klassLevels[1].id, spellId: spells["Rage"].id, aptitudeId: spellAptitude.id },
      ]);
      await addCharacterLevel(character.id, klassLevels[0].id, {
        spells: [{ spellId: spells["Sneak Attack"].id, aptitudeId: spellAptitude.id }],
      });

      const plan = levelUpPlan([planned(klass.id, 2)]);
      expect(stepAnswerOf(await getPlanAnswer(session, character.id, plan), "spells", "pick").granted).toMatchObject([
        { id: spells["Rage"].id },
      ]);
      const items = await spellOptions(session, character.id, plan, spellAptitude.id);
      expect(items.map(({ name, eligible }) => ({ name, eligible }))).toEqual([
        { name: "Uncanny Dodge", eligible: true },
      ]);
    });

    test("leave a spell the level's class level grants out of its own pool only, as once the level is saved", async () => {
      // Each pool is a list of its own: a spell known in one is offered in another that lists it
      const { session, parent, character, klass, klassLevels, spellAptitude, spells } = await setupRuleset();
      const [otherAptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
        name: "Other Spell Aptitude",
        rulesetId: parent.id,
      });
      await Joins.createMany(db, "spells_aptitudes", [{ spellId: spells["Rage"].id, aptitudeId: otherAptitude.id }]);
      await Joins.createMany<KlassLevelSpell>(db, "class_level_spells", [
        { klassLevelId: klassLevels[1].id, spellId: spells["Rage"].id, aptitudeId: spellAptitude.id },
      ]);
      await addCharacterLevel(character.id, klassLevels[0].id);
      const offered = async (aptitudeId: string, level: number) =>
        names(await spellOptions(session, character.id, levelUpPlan([planned(klass.id, level)]), aptitudeId));

      // Taking the level that grants Rage, then the one after it
      for (const level of [2, 3]) {
        expect(await offered(otherAptitude.id, level)).toContain("Rage");
        expect(await offered(spellAptitude.id, level)).not.toContain("Rage");
        await addCharacterLevel(character.id, klassLevels[level - 1].id);
      }
    });

    test("leave a spell a modifier makes known out of its own list only", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      await Modifiers.create(db, {
        sourceId: characterId,
        sourceType: "characters",
        target: "spells.magicmissile.wizard.known",
        value: "true",
        valueType: "boolean",
        operator: "set",
      });
      const firstLevelSpells = async (list: "Sorcerer Spells" | "Wizard Spells") =>
        names(
          await spellOptions(
            session,
            characterId,
            levelUpPlan([planned(ctx.klassMap.pc["Sorcerer"], 1)]),
            ctx.aptMap[list],
            { tier: "1" },
          ),
        );

      expect(await firstLevelSpells("Sorcerer Spells")).toContain("Magic Missile");
      expect(await firstLevelSpells("Wizard Spells")).not.toContain("Magic Missile");
    });

    test("leave a spell a later level knows out of an edited level's list, as the edit refuses it", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
      const first = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      await levelUp(
        session,
        ctx,
        characterId,
        "Sorcerer",
        2,
        { hp: 4, spells: { "Sorcerer Spells": ["Resistance"] } },
        true,
      );
      const cantrips = async (list: "Sorcerer Spells" | "Wizard Spells") =>
        names(await spellOptions(session, characterId, editPlan(first.id, { hp: 4 }), ctx.aptMap[list], { tier: "0" }));

      // The second level's Resistance, but the edited level's own Light, which it can pick again once removed
      expect(await cantrips("Sorcerer Spells")).not.toContain("Resistance");
      expect(await cantrips("Sorcerer Spells")).toContain("Light");
      expect(await cantrips("Wizard Spells")).toContain("Resistance");
    });

    test("leave a spell a level planned after the picker's grants out of its list, as the plan drops it and the save refuses it", async () => {
      // No seeded class level grants a spell: a fork's sorcerer, whose second level grants Resistance
      const ctx = await getSeedCtx();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const sorcerer = await copyEntity(db, "classes", ctx.klassMap.pc["Sorcerer"], fork);
      const second = (
        await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [sorcerer.id] })
      ).find(({ level }) => level === 2)!;
      const [sorcererSpells, resistance] = [ctx.aptMap["Sorcerer Spells"], ctx.spellMap["Resistance"]];
      await Joins.createMany<KlassLevelSpell>(db, "class_level_spells", [
        { klassLevelId: second.id, spellId: resistance, aptitudeId: sorcererSpells },
      ]);
      RulesetViews.invalidate(fork.id);
      const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000, rulesetId: fork.id });
      const cantrips = async (levels: number[]) =>
        names(
          await spellOptions(
            session,
            characterId,
            levelUpPlan(levels.map((level) => planned(sorcerer.id, level))),
            sorcererSpells,
            { advancement: 0, tier: "0" },
          ),
        );

      expect(await cantrips([1])).toContain("Resistance");
      expect(await cantrips([1, 2])).not.toContain("Resistance");
      const levels = [1, 2].map((level) => ({ abilityIncreases: [], hp: 4, klassId: sorcerer.id, level }));
      const plan = levelUpPlan(levels, { spells: { [sorcererSpells]: [ctx.spellMap["Light"], resistance] } });
      const answer = await getPlanAnswer(session, characterId, plan);
      expect(stepAnswerOf(answer, "spells", "pick").fitted[sorcererSpells]).toEqual([ctx.spellMap["Light"]]);
      expect(CharacterLevelsService.addLevels(session, characterId, plan, true)).rejects.toThrow(
        'Spell "Resistance" is already known in Sorcerer Spells',
      );
    });

    test("list a fork's inherited spells", async () => {
      const { session, character, klass, spellAptitude } = await setupRuleset({ fork: true });
      const items = await spellOptions(session, character.id, levelUpPlan([planned(klass.id, 1)]), spellAptitude.id);
      expect(
        items.map(({ name, eligible }) => ({ name, eligible })).sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Rage", eligible: true },
        { name: "Sneak Attack", eligible: true },
        { name: "Uncanny Dodge", eligible: true },
      ]);
    });

    test("leave out a spell the character knows once the fork copies it", async () => {
      // Editing an inherited spell in a fork copies it there: the copy stands for the spell a level picked or was granted
      const { session, ruleset, character, klass, klassLevels, spellAptitude, spells } = await setupRuleset({
        fork: true,
      });
      await Joins.createMany<KlassLevelSpell>(db, "class_level_spells", [
        { klassLevelId: klassLevels[0].id, spellId: spells["Rage"].id, aptitudeId: spellAptitude.id },
      ]);
      await addCharacterLevel(character.id, klassLevels[0].id, {
        spells: [{ spellId: spells["Sneak Attack"].id, aptitudeId: spellAptitude.id }],
      });
      for (const name of ["Rage", "Sneak Attack"]) {
        await EntitiesService.updateEntity(session, ruleset.id, "spells", spells[name].id, {
          name,
          description: "Ours",
        });
      }

      const items = await spellOptions(session, character.id, levelUpPlan([planned(klass.id, 2)]), spellAptitude.id);
      expect(names(items)).toEqual(["Uncanny Dodge"]);
    });

    test("leave out a spell the character knows under the copy of another book the ruleset merged", async () => {
      // Two books' copies of a spell merge into the one the list shows: a level that picked the other knows it
      const ctx = await getSeedCtx();
      const fork = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
      const wizardSpells = ctx.aptMap["Wizard Spells"];
      const merged = await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
        const listed = new Set(Dnd35View.of(rulesetData).listSpellIds({ aptitudeId: wizardSpells, level: 1 }));
        const loserId = [...rulesetData.cow.siblingIds].find(
          (id) => rulesetData.cow.resolve(id) !== id && listed.has(rulesetData.cow.resolve(id)),
        )!;
        return { loserId, name: Dnd35View.of(rulesetData).spellsById.get(loserId)!.name };
      });
      const characterId = await createSeedCharacter(ctx, "wizard", { rulesetId: fork.id });
      const [characterLevelId] = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
      await Picks.createMany(db, "spells", [{ characterLevelId, spellId: merged.loserId, aptitudeId: wizardSpells }]);

      expect(await spellNames(characterId, 2)).not.toContain(merged.name);
    });

    test("offer every spell of a class's list, extensions' copies included", async () => {
      const ctx = await getSeedCtx();
      const spells = async (build: "sorcerer" | "wizard", klass: string, tier: string) => {
        const characterId = await createSeedCharacter(ctx, build);
        return await spellOptions(
          session,
          characterId,
          levelUpPlan([planned(ctx.klassMap.pc[klass], 1)]),
          ctx.aptMap[`${klass} Spells`],
          { tier },
        );
      };
      // Being on the list is what makes a spell eligible: an extension's copy once kept only another class's requirement.
      for (const items of [await spells("sorcerer", "Sorcerer", "0"), await spells("wizard", "Wizard", "1")]) {
        expect(items.length).toBeGreaterThan(0);
        expect(items.filter((s) => !s.eligible)).toEqual([]);
      }
    });

    test("frees the edited level's own spells", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      const { pools } = stepAnswerOf(
        await getPlanAnswer(session, characterId, editPlan(level.id, { hp: 4 })),
        "spells",
        "pick",
      );
      // Four cantrips and two first-level spells, all picked at that level.
      expect(Object.values(pools).reduce((sum, p) => sum + p.available, 0)).toBe(6);
    });

    describe("prohibited schools", () => {
      const ILLUSION = "Silent Image";
      const NECROMANCY = ["Disrupt Undead", "Touch of Fatigue", "Ray of Enfeeblement"];

      test("leave out the schools the feats being picked give up", async () => {
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter(ctx, "wizard");
        const prohibit = (...schools: string[]) => ({
          [ctx.aptMap["Prohibited School"]]: schools.map((school) => ctx.featMap[`Prohibit ${school}`]),
        });

        const all = await spellNames(characterId, 1);
        expect(all).toEqual(expect.arrayContaining([ILLUSION, "Disrupt Undead", "Touch of Fatigue", "Magic Missile"]));
        const withoutIllusion = await spellNames(characterId, 1, prohibit("Illusion"));
        expect(withoutIllusion.length).toBeLessThan(all.length);
        expect(withoutIllusion).not.toContain(ILLUSION);

        const withoutBoth = await spellNames(characterId, 1, prohibit("Illusion", "Necromancy"));
        expect(withoutBoth.filter((name) => [ILLUSION, ...NECROMANCY].includes(name))).toEqual([]);
        expect(withoutBoth).toContain("Magic Missile");
      });

      test("leave out the schools the character gave up, and the spells it knows", async () => {
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter(ctx, "wizard", { xp: 3000 });
        await levelUp(session, ctx, characterId, "Wizard", 1, WIZARD_1);

        const offered = await spellNames(characterId, 2);
        expect(
          offered.filter((name) => [ILLUSION, ...NECROMANCY, "Detect Magic", "Magic Missile"].includes(name)),
        ).toEqual([]);
        expect(offered).toEqual(expect.arrayContaining(["Burning Hands", "Charm Person"]));
      });

      test("still leave them out once a fork copies the feat that gave one up", async () => {
        // Regression: the character's saved feat ids weren't resolved to the fork's copies.
        const ctx = await getSeedCtx();
        const fork = await createTestRuleset(SEED_USER_ID, {
          rulesetId: ctx.rulesetId,
          ancestorRulesetIds: [ctx.rulesetId],
        });
        const characterId = await createSeedCharacter(ctx, "wizard", { xp: 3000, rulesetId: fork.id });
        await levelUp(session, ctx, characterId, "Wizard", 1, WIZARD_1);
        await EntitiesService.updateEntity(session, fork.id, "feats", ctx.featMap["Prohibit Illusion"], {
          name: "Prohibit Illusion",
          description: "Copied",
        });

        const offered = await spellNames(characterId, 2);
        expect(offered).not.toContain(ILLUSION);
        expect(offered).not.toContain("Ray of Enfeeblement");
        expect(offered).toContain("Burning Hands");
      });
    });
  });

  describe("finalizing a level", () => {
    test("saves the level with its hit points, skill ranks, feats and spells", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      expect(level).toMatchObject({ characterId, hp: 4 });
      expect(
        await Picks.findMany<LevelAbilityIncrease>(db, { pick: "abilityIncreases", characterLevelIds: [level.id] }),
      ).toEqual([]);

      const { skills, feats, spells } = picks(ctx, SORCERER_1);
      const saved = async <T>(rows: Promise<T[]>, key: (row: T) => string) => (await rows).map(key).sort();
      expect(
        await saved(
          Picks.findMany<LevelSkill>(db, { pick: "skills", characterLevelIds: [level.id] }),
          (s) => `${s.skillId}:${s.rank}`,
        ),
      ).toEqual(
        Object.entries(skills)
          .map(([id, rank]) => `${id}:${rank}`)
          .sort(),
      );
      expect(
        await saved(
          Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: [level.id] }),
          (f) => `${f.aptitudeId}:${f.featId}`,
        ),
      ).toEqual(
        Object.entries(feats)
          .flatMap(([aptitude, ids]) => ids.map((id) => `${aptitude}:${id}`))
          .sort(),
      );
      expect(
        await saved(
          Picks.findMany<LevelSpell>(db, { pick: "spells", characterLevelIds: [level.id] }),
          (p) => p.spellId,
        ),
      ).toEqual(Object.values(spells).flat().sort());
    });

    test("saves the ability increase of every fourth level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
      await addFighterLevels(session, ctx, characterId, 3);
      const level = await levelUp(session, ctx, characterId, "Fighter", 4, FIGHTER_LEVELS[3]);
      expect(
        await Picks.findMany<LevelAbilityIncrease>(db, { pick: "abilityIncreases", characterLevelIds: [level.id] }),
      ).toMatchObject([{ abilityId: ctx.abilityMap["Strength"], amount: 1 }]);
    });

    test("refuses picks the level can't take", async () => {
      const ctx = await getSeedCtx();
      const fighter = FIGHTER_LEVELS[0];
      const refusals: [string, () => Promise<unknown>][] = [
        [
          "Ability increase is not available at this level",
          async () =>
            levelUp(session, ctx, await createSeedCharacter(ctx), "Fighter", 1, { ...fighter, ability: "Strength" }),
        ],
        [
          "HP must be between 1 and 10",
          async () => levelUp(session, ctx, await createSeedCharacter(ctx), "Fighter", 1, { ...fighter, hp: 11 }),
        ],
        [
          "HP must be between 1 and 10",
          async () => levelUp(session, ctx, await createSeedCharacter(ctx), "Fighter", 1, { ...fighter, hp: 0 }),
        ],
        [
          "Feat is not linked to the specified aptitude",
          async () =>
            levelUp(session, ctx, await createSeedCharacter(ctx), "Fighter", 1, {
              ...fighter,
              feats: { "Fighter Bonus Feat": ["Great Fortitude"], General: ["Improved Initiative"] },
            }),
        ],
        [
          "Spell is not linked to the specified aptitude",
          async () =>
            levelUp(session, ctx, await createSeedCharacter(ctx, "sorcerer"), "Sorcerer", 1, {
              ...SORCERER_1,
              spells: { General: ["Magic Missile"] },
            }),
        ],
        [
          "Ability increase is required at this level",
          async () => {
            const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
            await addFighterLevels(session, ctx, characterId, 3);
            return levelUp(session, ctx, characterId, "Fighter", 4, { ...FIGHTER_LEVELS[3], ability: undefined });
          },
        ],
        [
          'Non-stackable feat "Power Attack" is already on this character',
          async () => {
            const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
            await addFighterLevels(session, ctx, characterId, 1);
            return levelUp(session, ctx, characterId, "Fighter", 2, {
              ...FIGHTER_LEVELS[1],
              feats: { "Fighter Bonus Feat": ["Power Attack"] },
            });
          },
        ],
        [
          "This level has already been finalized",
          async () => {
            const characterId = await createSeedCharacter(ctx);
            await addFighterLevels(session, ctx, characterId, 1);
            return levelUp(session, ctx, characterId, "Fighter", 1, fighter);
          },
        ],
      ];
      for (const [message, attempt] of refusals) {
        const outcome = await attempt().then(
          () => "saved",
          (error: Error) => error.message,
        );
        expect(outcome).toEndWith(message);
      }
    });

    test("refuses a feat or a spell its ruleset has none of, naming it: a level-up's, an edit's and a plan's answer", async () => {
      const ctx = await getSeedCtx();
      const unknown = { message: `Spell ${NIL_UUID} does not belong to the character's ruleset`, refusal: "invalid" };
      const { feats, spells, skills } = picks(ctx, SORCERER_1);
      const withUnknown = { [ctx.aptMap["Sorcerer Spells"]]: [...spells[ctx.aptMap["Sorcerer Spells"]], NIL_UUID] };
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const klassId = ctx.klassMap.pc["Sorcerer"];
      const levels = [{ klassId, level: 1, hp: 4, abilityIncreases: [] }];
      for (const force of [false, true]) {
        const levelUp = CharacterLevelsService.addLevels(
          session,
          characterId,
          levelUpPlan(levels, { skills, feats, spells: withUnknown }),
          force,
        );
        expect(levelUp).rejects.toMatchObject(unknown);
      }

      const level = await addOneLevel(session, characterId, klassId, 1, 4, null, skills, feats, spells);
      const edit = CharacterLevelsService.updatePlannedLevel(
        session,
        characterId,
        level.id,
        levelEditPlan({ hp: 4 }, { skills, feats, spells: withUnknown }),
      );
      expect(edit).rejects.toMatchObject(unknown);

      // A feat the plan's answer would count in its pool
      const otherId = await createSeedCharacter(ctx, "sorcerer");
      const withUnknownFeat = { ...feats, [ctx.aptMap["General"]]: [NIL_UUID] };
      expect(
        getPlanAnswer(session, otherId, levelUpPlan([planned(klassId, 1)], { skills, feats: withUnknownFeat, spells })),
      ).rejects.toMatchObject({
        message: `Feat ${NIL_UUID} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
    });

    test("refuses a class or a feat of an unrelated ruleset", async () => {
      const { user, session, character, klass, featAptitude } = await setupRuleset({ fork: true });
      const unrelated = await setupRuleset();
      expect(
        (await answerTo(() => addOneLevel(session, character.id, unrelated.klass.id, 1, 8, null, {}, {}, {}))).status,
      ).toBe(400);
      expect(
        (
          await answerTo(() =>
            addOneLevel(
              session,
              character.id,
              klass.id,
              1,
              8,
              null,
              {},
              { [featAptitude.id]: [unrelated.feats["Power Attack"].id] },
              {},
            ),
          )
        ).status,
      ).toBe(400);
      void user;
    });

    test("refuses a level that breaks the rules, unless forced", async () => {
      const ctx = await getSeedCtx();
      // Dodge needs DEX 13.
      const plan = {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Dodge", "Great Fortitude"], "Fighter Bonus Feat": ["Improved Initiative"] },
      };
      const refused = await answerTo(async () =>
        levelUp(
          session,
          ctx,
          await createSeedCharacter(ctx, "fighter", { abilities: { Dexterity: 8 } }),
          "Fighter",
          1,
          plan,
        ),
      );
      // Its issues come with it: what the character fails
      expect(refused).toMatchObject({
        status: 400,
        body: {
          error: "BadRequestError",
          issues: [expect.objectContaining({ message: expect.stringMatching(/dodge/i) })],
        },
      });

      const characterId = await createSeedCharacter(ctx, "fighter", { abilities: { Dexterity: 8 } });
      const level = await levelUp(session, ctx, characterId, "Fighter", 1, plan, true);
      expect(
        (await Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: [level.id] })).map((f) => f.featId),
      ).toContain(ctx.featMap["Dodge"]);
    });

    test("works on a fork, with the content it inherits", async () => {
      const ctx = await getSeedCtx();
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const characterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
      // The skill point ability comes from the parent: 16 points take INT's +1 into account.
      expect(await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0])).toMatchObject({ characterId });

      const wizard = await createSeedCharacter(ctx, "wizard", { rulesetId: fork.id });
      const level = await levelUp(session, ctx, wizard, "Wizard", 1, WIZARD_1);
      expect(
        (await Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: [level.id] })).map((f) => f.featId),
      ).toEqual(expect.arrayContaining(Object.values(picks(ctx, WIZARD_1).feats).flat()));
    });
  });

  describe("editing a level", () => {
    test("counts a human fighter's bonus feats at the first level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx);
      const [level] = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
      const { pools } = stepAnswerOf(
        await getPlanAnswer(session, characterId, editPlan(level, { hp: 10 })),
        "feats",
        "pick",
      );
      // One General feat for the first level, one for being human.
      expect(pool(pools, "General")).toMatchObject({ allowed: 2 });
      expect(pool(pools, "Fighter Bonus Feat")).toMatchObject({ allowed: 1 });
    });

    test("lists the level's picks by name", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx);
      const [level] = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
      await addFeats(
        db,
        ctx,
        [level],
        [
          { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
          { levelIndex: 0, featName: "Dodge", aptitude: "General" },
        ],
      );
      const general = ctx.aptMap["General"];
      const saved = await CharacterLevelsService.getLevelPlan(session, characterId, level);
      expect(savedPicksOf(saved).feats[general]).toEqual([ctx.featMap["Dodge"], ctx.featMap["Power Attack"]]);
      const answer = await getPlanAnswer(session, characterId, saved);
      expect(stepAnswerOf(answer, "feats", "pick").picked[general].map((feat) => feat.name)).toEqual([
        "Dodge",
        "Power Attack",
      ]);
      // The bounds its class's d10 sets its hit points, which Edit Level's HP step reads
      expect(stepAnswerOf(answer, "hp", "value").advancements).toEqual([{ average: 5, max: 10, min: 1, roll: "d10" }]);
    });

    describe("of a multiclass character", () => {
      test("keeps a General feat saved at a level that grants none", async () => {
        const {
          ctx,
          characterId,
          levelIds: [barbarian, fighter1],
        } = await setupMulticlass(2);
        // The second General feat comes at character level 3, but was saved at fighter 1.
        await addFeats(
          db,
          ctx,
          [barbarian, fighter1],
          [
            { levelIndex: 0, featName: "Acrobatic", aptitude: "General" },
            { levelIndex: 1, featName: "Power Attack", aptitude: "General" },
            { levelIndex: 1, featName: "Weapon Focus: Battleaxe", aptitude: "Fighter Bonus Feat" },
          ],
        );
        const { pools } = stepAnswerOf(
          await getPlanAnswer(session, characterId, editPlan(fighter1, { hp: 10 })),
          "feats",
          "pick",
        );
        expect(pool(pools, "General")!.available).toBeGreaterThanOrEqual(1);

        const { feats } = picks(ctx, {
          feats: { General: ["Power Attack"], "Fighter Bonus Feat": ["Weapon Focus: Battleaxe"] },
        });
        await CharacterLevelsService.updatePlannedLevel(
          session,
          characterId,
          fighter1,
          levelEditPlan({ hp: 10 }, { feats }),
          true,
        );
        expect(
          (await Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: [fighter1] }))
            .map((f) => f.featId)
            .sort(),
        ).toEqual(Object.values(feats).flat().sort());
      });

      test("reports the skill budget the save validates, the first level keeping its ×4", async () => {
        // 22 points: 16 for the first (barbarian) level, 2 for each fighter level.
        const { ctx, characterId, levelIds } = await setupMulticlass(3);
        await addSkills(db, ctx, levelIds, [
          { levelIndex: 0, skillName: "Climb", rank: 2 },
          { levelIndex: 0, skillName: "Jump", rank: 2 },
          { levelIndex: 1, skillName: "Climb", rank: 4 },
          { levelIndex: 1, skillName: "Intimidate", rank: 4 },
          { levelIndex: 2, skillName: "Climb", rank: 1 },
          { levelIndex: 2, skillName: "Intimidate", rank: 1 },
          { levelIndex: 3, skillName: "Climb", rank: 4 },
          { levelIndex: 3, skillName: "Intimidate", rank: 4 },
        ]);
        const edit = async (index: number, points: Record<string, number>) => {
          const { budget, rows } = stepAnswerOf(
            await getPlanAnswer(session, characterId, editPlan(levelIds[index], { hp: 8 })),
            "skills",
            "spend",
          );
          // The most points Intimidate and Jump take at the level, the ranks the other levels give them capped
          const room = Object.fromEntries(
            rows.filter((row) => ["Intimidate", "Jump"].includes(row.name)).map((row) => [row.name, row.maxPoints]),
          );
          await CharacterLevelsService.updatePlannedLevel(
            session,
            characterId,
            levelIds[index],
            levelEditPlan({ hp: 8 }, { skills: skillPoints(ctx, points) }),
            true,
          );
          const saved = await Picks.findMany<LevelSkill>(db, { pick: "skills", characterLevelIds: [levelIds[index]] });
          return { budget, room, saved: saved.reduce((sum, s) => sum + s.rank, 0) };
        };

        // Editing the barbarian level: 22 less the 18 the fighter levels spent; Intimidate's 9 ranks elsewhere are past
        // the cap already
        expect(await edit(0, { Climb: 2, Jump: 2 })).toEqual({ budget: 4, room: { Intimidate: 0, Jump: 4 }, saved: 4 });
        // Editing a middle level: 22 less the 4 + 2 + 8 of the others. The rank cap is the whole character's level's
        // (4 + 3 = 7 ranks), not the level's place: Intimidate's 5 ranks elsewhere leave 2, Jump's 2 leave 5
        expect(await edit(1, { Climb: 4, Intimidate: 4 })).toEqual({
          budget: 8,
          room: { Intimidate: 2, Jump: 5 },
          saved: 8,
        });
      });

      test("keeps the spells of the character's other levels", async () => {
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 3000 });
        const levelIds = [
          ...(await addClassLevels(db, ctx, characterId, "Sorcerer", [1], [4])),
          ...(await addClassLevels(db, ctx, characterId, "Fighter", [1], [10])),
          ...(await addClassLevels(db, ctx, characterId, "Sorcerer", [2], [4])),
        ];
        await addSpells(db, ctx, levelIds, [
          { levelIndex: 0, spellName: "Light", aptitude: "Sorcerer Spells" },
          { levelIndex: 0, spellName: "Detect Magic", aptitude: "Sorcerer Spells" },
          { levelIndex: 2, spellName: "Magic Missile", aptitude: "Sorcerer Spells" },
        ]);

        await CharacterLevelsService.updatePlannedLevel(
          session,
          characterId,
          levelIds[2],
          levelEditPlan({ hp: 4 }, { spells: picks(ctx, { spells: { "Sorcerer Spells": ["Magic Missile"] } }).spells }),
          true,
        );
        expect(
          await Picks.findMany<LevelSpell>(db, { pick: "spells", characterLevelIds: [levelIds[2]] }),
        ).toMatchObject([{ spellId: ctx.spellMap["Magic Missile"] }]);
        expect(await Picks.findMany<LevelSpell>(db, { pick: "spells", characterLevelIds: [levelIds[0]] })).toHaveLength(
          2,
        );
      });
    });

    test("refuses to drop a feat a later level's feat needs, naming it", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000 });
      const levelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1, 2, 3], [10, 8, 7]);
      await addFeats(
        db,
        ctx,
        [levelIds[0], levelIds[2]],
        [
          { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
          { levelIndex: 1, featName: "Cleave", aptitude: "General" },
        ],
      );
      const refused = await answerTo(() =>
        CharacterLevelsService.updatePlannedLevel(
          session,
          characterId,
          levelIds[0],
          levelEditPlan({ hp: 10 }, { feats: { [ctx.aptMap["General"]]: [] } }),
          false,
        ),
      );
      expect(refused).toMatchObject({ status: 400, body: { message: expect.stringMatching(/cleave/i) } });
    });

    test("keeps the familiar a feat of the edited level brings", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      const familiar = await Characters.findOne(db, { parentCharacterId: characterId, kind: "familiar" });

      await CharacterLevelsService.updatePlannedLevel(
        session,
        characterId,
        level.id,
        levelEditPlan({ hp: 4 }, picks(ctx, SORCERER_1)),
      );
      expect(await Characters.findOne(db, { parentCharacterId: characterId, kind: "familiar" })).toMatchObject({
        id: familiar!.id,
      });
    });

    test("counts cross-class ranks at one point each in the character's skill budget", async () => {
      // A documented choice: a level spending 6 points on 4 ranks, 2 cross-class, doesn't overspend.
      const ctx = await getSeedCtx();
      // INT 10: (2 + 0 + 1) = 3 points a level, 12 at the first: 18 in all.
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000, abilities: { Intelligence: 10 } });
      const levelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1, 2, 3], [10, 8, 7]);
      await addSkills(db, ctx, levelIds, [
        { levelIndex: 0, skillName: "Climb", rank: 4 },
        { levelIndex: 0, skillName: "Intimidate", rank: 4 },
        { levelIndex: 0, skillName: "Jump", rank: 4 },
        { levelIndex: 1, skillName: "Swim", rank: 1 },
        { levelIndex: 1, skillName: "Spot", rank: 1 },
        { levelIndex: 2, skillName: "Climb", rank: 2 },
        { levelIndex: 2, skillName: "Spot", rank: 2 },
      ]);

      const detailed = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
      expect(detailed.components.skills.getSkillBudget()).toMatchObject({
        total: 18,
        spent: 18,
        available: 0,
      });
      expect(
        detailed.validate().issues.filter((i) => i.category === "skills" && /skill point/.test(i.message)),
      ).toEqual([]);
    });
  });

  describe("the ruleset's view", () => {
    test("each flow composes it once, and builds the character in it", async () => {
      const { session, character, klass, featAptitude, spellAptitude } = await setupRuleset();
      const scope = await measure(() => withRulesetScope(db, character.rulesetId, async () => {}));
      const once = scope.timing.cacheHits + scope.timing.cacheMisses;
      const plan = levelUpPlan([planned(klass.id, 1)]);
      const flows: [string, () => Promise<unknown>][] = [
        ["plan", () => getPlanAnswer(session, character.id, plan)],
        ["classes", () => getStepOptions(session, character.id, "class-plan", { steps: {} }, {}, page)],
        ["feats", () => getStepOptions(session, character.id, "feats", plan, { pool: featAptitude.id }, page)],
        ["spells", () => getStepOptions(session, character.id, "spells", plan, { pool: spellAptitude.id }, page)],
        ["finalize", () => addOneLevel(session, character.id, klass.id, 1, 8, null, {}, {}, {}, true)],
        ["remove", () => CharacterLevelsService.removeLevel(session, character.id)],
      ];
      for (const [flow, run] of flows) {
        const { timing } = await measure(run);
        expect({ flow, composed: timing.cacheHits + timing.cacheMisses }).toEqual({ flow, composed: once });
      }
    });

    test("an edited level's builds compose it once", async () => {
      const { session, character, klass } = await setupRuleset();
      const level = await addOneLevel(session, character.id, klass.id, 1, 8, null, {}, {}, {}, true);
      const scope = await measure(() => withRulesetScope(db, character.rulesetId, async () => {}));
      const { timing } = await measure(() =>
        CharacterLevelsService.updatePlannedLevel(session, character.id, level.id, levelEditPlan({ hp: 6 }), true),
      );
      expect(timing.cacheHits + timing.cacheMisses).toBe(scope.timing.cacheHits + scope.timing.cacheMisses);
    });
  });

  describe("removing a level", () => {
    test("removes the last one taken, with its picks, even when an earlier one is higher", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000 });
      const klassLevel = async (klass: string, level: number) =>
        (await findKlassLevel(ctx.klassMap.pc[klass], level))!.id;
      const [fighter2] = await CharacterAdvancements.create(db, {
        characterId,
        klassLevelId: await klassLevel("Fighter", 2),
        hp: 10,
      });
      const [rogue1] = await CharacterAdvancements.create(db, {
        characterId,
        klassLevelId: await klassLevel("Rogue", 1),
        hp: 6,
      });
      await addSkills(db, ctx, [rogue1.id], [{ levelIndex: 0, skillName: "Hide", rank: 4 }]);
      await addFeats(db, ctx, [rogue1.id], [{ levelIndex: 0, featName: "Dodge", aptitude: "General" }]);

      expect(await CharacterLevelsService.removeLevel(session, characterId)).toMatchObject({ success: true });
      expect(await CharacterAdvancements.findMany(db, { characterId })).toMatchObject([{ id: fighter2.id }]);
      expect(await Picks.findMany<LevelSkill>(db, { pick: "skills", characterLevelIds: [rogue1.id] })).toEqual([]);
      expect(await Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: [rogue1.id] })).toEqual([]);
    });
  });

  describe("the order of a character's levels", () => {
    test("numbers them in the order they were made, though the test's one transaction made them at one time", async () => {
      const { ctx, characterId, levelIds } = await setupMulticlass(2);
      const positions = async () =>
        (await CharacterAdvancements.findMany(db, { characterId })).map((level) => [level.id, level.position]);
      expect(await positions()).toEqual(levelIds.map((id, index) => [id, index + 1]));
      // The last one goes, and the next takes its place
      await CharacterLevelsService.removeLevel(session, characterId);
      const [fighter2] = await addClassLevels(db, ctx, characterId, "Fighter", [2], [8]);
      expect(await positions()).toEqual([...levelIds.slice(0, 2).map((id, index) => [id, index + 1]), [fighter2, 3]]);
    });

    test("runs a character's level flows one at a time: a removal waits for the flow that holds the character", async () => {
      const kael = await findSeededCharacter("Kael Stormborn");
      const levels = await CharacterAdvancements.findMany(db, { characterId: kael.id });
      await runWhileLocked(
        lockPool,
        (blockerDb) => Characters.lock(blockerDb, { id: kael.id }),
        () => CharacterLevelsService.removeLevel(session, kael.id),
      );
      expect(await CharacterAdvancements.findMany(db, { characterId: kael.id })).toEqual(levels.slice(0, -1));
    });
  });
});
