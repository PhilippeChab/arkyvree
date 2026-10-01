import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { DND35_DMG_NAME } from "@/database/packages/dnd35/names.ts";
import { addClassLevels, addFeats, addPowers, addSkills, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import {
  abilitiesInRules,
  featsInRules,
  klassLevelPowersInRules,
  levelsInCharacter,
  powersInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  Aptitudes,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  Feats,
  FeatsAptitudes,
  Klasses,
  KlassLevelFeats,
  KlassLevels,
  KlassSkills,
  Modifiers,
  PowersAptitudes,
  Properties,
  Races,
  Rulesets,
  Skills,
} from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { CharacterLevelsMethods } from "@/server/services/characters/CharacterLevelsService.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import {
  addCharacterLevel,
  addOneLevel,
  createTestCharacter,
  createTestRuleset,
  createTestUser,
  findKlassLevel,
  getSeedCtx,
  insertRows,
  invalidateSeededRuleset,
  makeSession,
  NIL_UUID,
  uniqueId,
} from "@/tests/helpers.ts";
import {
  addFighterLevels,
  createSeedCharacter,
  FIGHTER_LEVELS,
  levelUp,
  picks,
  SORCERER_1,
  WAR_CLERIC_1,
  WIZARD_1,
} from "@/tests/levelFixtures.ts";

const session = makeSession(SEED_USER_ID);
const page = { limit: 500, page: 1 };

/**
 * A small ruleset of a new user's, with a class of five levels, three skills,
 * feats (Power Attack, Weapon Focus which stacks, Dodge) and powers each in an
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

  const [race] = await Races.create(db, { name: "Test Race", rulesetId, size: "Medium", baseSpeed: 30 });
  const [klass] = await Klasses.create(db, { name: "Test Class", rulesetId, hd: 8 });
  const klassLevels = [];
  for (let level = 1; level <= 5; level++) {
    const [klassLevel] = await KlassLevels.create(db, { klassId: klass.id, level });
    await Properties.createMany(db, [
      { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: String(level) },
      {
        entityId: klassLevel.id,
        entityType: "klass_levels",
        type: KLASS_LEVEL_SKILL_POINTS,
        value: String(2 + Math.floor(level / 2)),
      },
    ]);
    klassLevels.push(klassLevel);
  }
  await Aptitudes.create(db, { name: "general", rulesetId });
  const [[featAptitude], [powerAptitude]] = [
    await Aptitudes.create(db, { name: "Feat Aptitude", rulesetId }),
    await Aptitudes.create(db, { name: "Power Aptitude", rulesetId }),
  ];
  const abilities = await insertRows(
    abilitiesInRules,
    ["Charisma", "Dexterity", "Intelligence"].map((name) => ({ name, description: name, rulesetId })),
  );
  const skillList = await insertRows(
    skillsInRules,
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
  const featList = await insertRows(featsInRules, [
    { name: "Power Attack", rulesetId, stackable: false },
    { name: "Weapon Focus", rulesetId, stackable: true },
    { name: "Dodge", rulesetId, stackable: false },
  ]);
  const powerList = await insertRows(
    powersInRules,
    ["Sneak Attack", "Rage", "Uncanny Dodge"].map((name) => ({ name, rulesetId })),
  );
  await FeatsAptitudes.createMany(
    db,
    featList.map((f) => ({ featId: f.id, aptitudeId: featAptitude.id })),
  );
  await PowersAptitudes.createMany(
    db,
    powerList.map((p) => ({ powerId: p.id, aptitudeId: powerAptitude.id })),
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
    powerAptitude,
    abilities,
    skills: byName(skillList),
    feats: byName(featList),
    powers: byName(powerList),
  };
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

/** The levels, ability increases, feats and skill ranks being added, which getAvailableKlasses takes after its paging. */
type PendingPicks =
  Parameters<typeof CharacterLevelsMethods.getAvailableKlasses> extends [
    unknown,
    unknown,
    unknown,
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never;

describe("LevelsService", () => {
  test("refuses a missing character, another user's, a missing class level, and removing from a character without levels", async () => {
    const { session, character, klass, featAptitude } = await setupRuleset();
    const { session: other } = await createTestUser();
    const notFound = [
      () => CharacterLevelsMethods.getAvailableKlasses(session, NIL_UUID, {}, page),
      () => CharacterLevelsMethods.getAvailableKlasses(other, character.id, {}, page),
      () => CharacterLevelsMethods.getAttributeSlots(session, NIL_UUID),
      () => CharacterLevelsMethods.getSkillSlots(session, NIL_UUID, klass.id, 1),
      () => CharacterLevelsMethods.getSkillSlots(session, character.id, klass.id, 999),
      () => CharacterLevelsMethods.getFeatSlots(session, NIL_UUID, klass.id, 1),
      () => CharacterLevelsMethods.getFeatSlots(session, character.id, klass.id, 999),
      () => CharacterLevelsMethods.getPowerSlots(session, NIL_UUID, klass.id, 1),
      () => CharacterLevelsMethods.getPowerSlots(session, character.id, klass.id, 999),
      () => CharacterLevelsMethods.getEditPowerSlots(session, character.id, klass.id, 1, NIL_UUID),
      () => CharacterLevelsMethods.getAvailablePowers(session, NIL_UUID, featAptitude.id, klass.id, 1, {}, page),
      () => addOneLevel(session, NIL_UUID, klass.id, 1, 8, null, {}, {}, {}),
      () => addOneLevel(session, character.id, klass.id, 999, 8, null, {}, {}, {}),
      () => CharacterLevelsMethods.removeLevel(session, NIL_UUID),
      () => CharacterLevelsMethods.removeLevel(other, character.id),
      () => CharacterLevelsMethods.removeLevel(session, character.id),
    ];
    // One at a time: the test's transaction has a single connection.
    for (const call of notFound) await expect(call()).rejects.toThrow(NotFoundError);
  });

  describe("classes a character can take", () => {
    test("lists each with its next level and whether the character qualifies", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
      const classes = async () =>
        (await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, page)).items;
      expect(
        (await classes()).filter((k) => [ctx.klassMap.pc["Fighter"], ctx.klassMap.pc["Rogue"]].includes(k.id)),
      ).toMatchObject([
        { nextLevel: 1, eligible: true },
        { nextLevel: 1, eligible: true },
      ]);

      await addFighterLevels(session, ctx, characterId, 1);
      expect((await classes()).find((k) => k.id === ctx.klassMap.pc["Fighter"])).toMatchObject({
        nextLevel: 2,
        eligible: true,
      });
    });

    describe("counts the levels, feats and skill ranks being added toward a prestige class", () => {
      // The Blackguard (Dungeon Master's Guide) needs BAB 6, 5 ranks of Hide, 2 of
      // Knowledge (Religion), Power Attack, Cleave and Improved Sunder. Each case
      // leaves one out of the character and supplies it as a pending pick.
      async function setupCandidate(missing: { bab?: boolean; feat?: string; skill?: string }) {
        const ctx = await getSeedCtx();
        const fork = await RulesetsMethods.forkRuleset(session, ctx.rulesetId, {
          name: `Blackguard Fork ${uniqueId()}`,
          private: false,
        });
        const dmg = (await Rulesets.findOne(db, { name: DND35_DMG_NAME }))!;
        await RulesetsMethods.subscribeExtension(session, fork.id, [dmg.id]);
        const blackguard = (await Klasses.findOne(db, { name: "Blackguard", rulesetId: dmg.id }))!;

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

        const eligible = async (...pending: PendingPicks) =>
          (await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, page, ...pending)).items.find(
            (k) => k.id === blackguard.id,
          )!.eligible;
        const fighterLevel = async (level: number) => (await findKlassLevel(ctx.klassMap.pc["Fighter"], level))!.id;
        return { ctx, eligible, fighterLevel };
      }

      test("a pending level brings the BAB", async () => {
        const { eligible, fighterLevel } = await setupCandidate({ bab: true });
        expect(await eligible()).toBe(false);
        expect(await eligible([await fighterLevel(6)])).toBe(true);
      });

      test("a pending feat pick brings the missing feat", async () => {
        const { ctx, eligible } = await setupCandidate({ feat: "Cleave" });
        expect(await eligible()).toBe(false);
        expect(
          await eligible(undefined, undefined, [{ featId: ctx.featMap["Cleave"], aptitudeId: ctx.aptMap["General"] }]),
        ).toBe(true);
      });

      test("pending skill ranks bring the missing skill", async () => {
        const { ctx, eligible, fighterLevel } = await setupCandidate({ skill: "Hide" });
        expect(await eligible()).toBe(false);
        expect(
          await eligible([await fighterLevel(7)], undefined, undefined, [{ skillId: ctx.skillMap["Hide"], rank: 10 }]),
        ).toBe(true);
      });
    });
  });

  test("offers an ability increase every fourth character level", async () => {
    const { session, character, klassLevels } = await setupRuleset();
    await addCharacterLevel(character.id, klassLevels[0].id);
    await addCharacterLevel(character.id, klassLevels[1].id);
    expect(await CharacterLevelsMethods.getAttributeSlots(session, character.id)).toEqual({
      isAvailable: false,
      attributes: {},
    });

    await addCharacterLevel(character.id, klassLevels[2].id);
    expect(await CharacterLevelsMethods.getAttributeSlots(session, character.id)).toMatchObject({
      isAvailable: true,
      attributes: expect.any(Object),
    });
  });

  describe("skill slots", () => {
    test("list the ruleset's skills with the class's marked and the character's current ranks", async () => {
      const { session, character, klass, klassLevels, skills } = await setupRuleset();
      await KlassSkills.create(db, { klassId: klass.id, skillId: skills["Diplomacy"].id });
      const [level] = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
      });
      await CharacterLevelSkills.create(db, { characterLevelId: level.id, skillId: skills["Diplomacy"].id, rank: 1 });

      const slots = await CharacterLevelsMethods.getSkillSlots(session, character.id, klass.id, 2);
      expect(slots.totalCharacterLevel).toBe(2);
      expect(slots.skillPointsToSpend).toBeGreaterThan(0);
      expect(
        slots.skills
          .map(({ name, isClassSkill, currentRank }) => ({ name, isClassSkill, currentRank }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Diplomacy", isClassSkill: true, currentRank: 1 },
        { name: "Knowledge (Arcana)", isClassSkill: false, currentRank: 0 },
        { name: "Stealth", isClassSkill: false, currentRank: 0 },
      ]);
    });

    test("add the skill points an intelligence increase earns back to earlier levels, and not those of a misc bonus", async () => {
      const ctx = await getSeedCtx();
      // INT 13: (2 + 1 + 1) = 4 points a level. Levels 1 to 3 spent 16 + 4 + 4 = 24.
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000, abilities: { Intelligence: 13 } });
      await addFighterLevels(session, ctx, characterId, 3);
      const slots = (abilityId?: string) =>
        CharacterLevelsMethods.getSkillSlots(session, characterId, ctx.klassMap.pc["Fighter"], 4, undefined, abilityId);

      expect((await slots()).skillPointsToSpend).toBe(4);
      // INT 14 makes it 5 a level: 20 + 5 + 5 + 5 = 35, less the 24 spent.
      expect((await slots(ctx.abilityMap["Intelligence"])).skillPointsToSpend).toBe(11);

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
      expect((await slots()).skillPointsToSpend).toBe(4);
    });

    test("mark a class's skills on a fork of the seeded ruleset", async () => {
      const ctx = await getSeedCtx();
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const characterId = await createSeedCharacter(ctx, "cleric", { rulesetId: fork.id });

      const { skills } = await CharacterLevelsMethods.getSkillSlots(session, characterId, ctx.klassMap.pc["Cleric"], 1);
      const flags = (name: string) => {
        const { isClassSkill, isCurrentClassSkill } = skills.find((s) => s.name === name)!;
        return { isClassSkill, isCurrentClassSkill };
      };
      expect(flags("Heal")).toEqual({ isClassSkill: true, isCurrentClassSkill: true });
      expect(flags("Diplomacy")).toEqual({ isClassSkill: true, isCurrentClassSkill: true });
      expect(flags("Hide")).toEqual({ isClassSkill: false, isCurrentClassSkill: false });
    });

    test("list an inherited ruleset's skills, a class skill's subtypes counting as class skills", async () => {
      const { parent, session, character, klass, abilities } = await setupRuleset({ fork: true });
      const intelligence = abilities.find((a) => a.name === "Intelligence")!;
      const [[craft]] = [
        await Skills.create(db, { name: "Craft", rulesetId: parent.id, primaryAbilityId: intelligence.id }),
        await Skills.create(db, { name: "Craft (Alchemy)", rulesetId: parent.id, primaryAbilityId: intelligence.id }),
      ];
      await KlassSkills.create(db, { klassId: klass.id, skillId: craft.id });

      const { skills } = await CharacterLevelsMethods.getSkillSlots(session, character.id, klass.id, 1);
      expect(
        skills
          .filter((s) => s.isClassSkill && s.isCurrentClassSkill)
          .map((s) => s.name)
          .sort(),
      ).toEqual(["Craft", "Craft (Alchemy)"]);
      expect(names(skills).sort()).toEqual(["Craft", "Craft (Alchemy)", "Diplomacy", "Knowledge (Arcana)", "Stealth"]);
    });
  });

  describe("feat slots and the feats of a pool", () => {
    test("list a class level's granted feats, and leave them out of the picks unless they stack", async () => {
      const { session, character, klass, klassLevels, featAptitude, feats } = await setupRuleset();
      await KlassLevelFeats.create(db, {
        klassLevelId: klassLevels[0].id,
        featId: feats["Power Attack"].id,
        aptitudeId: featAptitude.id,
        free: true,
      });

      expect(
        (await CharacterLevelsMethods.getFeatSlots(session, character.id, klass.id, 1)).autoGrantedFeats,
      ).toMatchObject([{ id: feats["Power Attack"].id }]);
      const available = await CharacterLevelsMethods.getAvailableFeats(
        session,
        character.id,
        featAptitude.id,
        klass.id,
        1,
        {},
        page,
      );
      expect(names(available.items).sort()).toEqual(["Dodge", "Weapon Focus"]);
      // Picking the granted feat anyway is refused.
      await expect(
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

    test("leave out a feat the character has, unless it stacks, and those that can't be picked", async () => {
      const { session: owner, character, klass, klassLevels, featAptitude, feats } = await setupRuleset();
      const [classFeature] = await Feats.create(db, {
        name: "Class Feature",
        rulesetId: klass.rulesetId,
        selectable: false,
      });
      await FeatsAptitudes.create(db, { featId: classFeature.id, aptitudeId: featAptitude.id });
      await addCharacterLevel(character.id, klassLevels[0].id, {
        feats: [feats["Power Attack"], feats["Weapon Focus"]].map((f) => ({
          featId: f.id,
          aptitudeId: featAptitude.id,
        })),
      });

      const available = await CharacterLevelsMethods.getAvailableFeats(
        owner,
        character.id,
        featAptitude.id,
        klass.id,
        2,
        {},
        page,
      );
      expect(
        available.items.map(({ name, eligible }) => ({ name, eligible })).sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Dodge", eligible: true },
        { name: "Weapon Focus", eligible: true },
      ]);

      // The seeded barbarian's class features are all picked for them.
      const ctx = await getSeedCtx();
      const barbarian = await createSeedCharacter(ctx, "fighter", { alignment: "Chaotic Neutral" });
      expect(
        (
          await CharacterLevelsMethods.getAvailableFeats(
            session,
            barbarian,
            ctx.aptMap["Barbarian Class Feature"],
            ctx.klassMap.pc["Barbarian"],
            1,
            {},
            page,
          )
        ).items,
      ).toEqual([]);
    });

    test("flag a pool that powers share, and leave it out of the feats to pick", async () => {
      const { session, character, klass, feats, powers } = await setupRuleset();
      const [shared] = await Aptitudes.create(db, { name: "Shared Aptitude", rulesetId: klass.rulesetId });
      await FeatsAptitudes.create(db, { featId: feats["Dodge"].id, aptitudeId: shared.id });
      await PowersAptitudes.create(db, { powerId: powers["Rage"].id, aptitudeId: shared.id });

      const { aptitudePools, featsToSelect } = await CharacterLevelsMethods.getFeatSlots(
        session,
        character.id,
        klass.id,
        1,
      );
      const sharedByName = Object.fromEntries(Object.values(aptitudePools).map((p) => [p.name, p.shared]));
      expect(sharedByName).toMatchObject({ "Shared Aptitude": true, "Power Aptitude": true, "Feat Aptitude": false });
      expect(featsToSelect).toBe(
        Object.values(aptitudePools)
          .filter((p) => !p.shared)
          .reduce((sum, p) => sum + p.available, 0),
      );
    });

    test("mark a feat eligible only when the character meets its ability requirement", async () => {
      const ctx = await getSeedCtx();
      const eligibility = async (dexterity: number, search: string) => {
        const characterId = await createSeedCharacter(ctx, "fighter", { abilities: { Dexterity: dexterity } });
        const { items } = await CharacterLevelsMethods.getAvailableFeats(
          session,
          characterId,
          ctx.aptMap["General"],
          ctx.klassMap.pc["Fighter"],
          1,
          { search },
          page,
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
    ])("open the %s's pool at level %i: %s", async (klass, level, pool) => {
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
      const { aptitudePools } = await CharacterLevelsMethods.getFeatSlots(
        session,
        characterId,
        ctx.klassMap.pc[klass],
        level,
      );
      expect(Object.values(aptitudePools).find((p) => p.name === pool)).toMatchObject({ available: 1 });
      // A wizard picks the schools to give up once specialized.
      if (klass === "Wizard")
        expect(Object.values(aptitudePools).find((p) => p.name === "Prohibited School")?.available ?? 0).toBe(0);
    });

    test("tell how many prohibited schools each wizard specialty opens", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "wizard");
      const { items } = await CharacterLevelsMethods.getAvailableFeats(
        session,
        characterId,
        ctx.aptMap["Wizard Specialization"],
        ctx.klassMap.pc["Wizard"],
        1,
        {},
        page,
      );
      const prohibited = (name: string) =>
        items
          .find((f) => f.name === name)!
          .aptitudeModifiers.find((m) => m.aptitudeId === ctx.aptMap["Prohibited School"]);
      expect(prohibited("Evocation Specialist")).toMatchObject({ value: 2, operator: "add" });
      expect(prohibited("Divination Specialist")).toMatchObject({ value: 1 });
      expect(prohibited("Generalist")).toBeUndefined();
    });

    test("group a pool's feat families, leaving out what the character has and flagging single feats' eligibility", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
      await levelUp(session, ctx, characterId, "Fighter", 1, {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Weapon Focus: Longsword"] },
      });
      const query = (where = {}) =>
        CharacterLevelsMethods.getAvailableFeats(
          session,
          characterId,
          ctx.aptMap["General"],
          ctx.klassMap.pc["Fighter"],
          2,
          where,
          page,
        );
      const grouped = (
        await CharacterLevelsMethods.getAvailableFeatsGrouped(
          session,
          characterId,
          ctx.aptMap["General"],
          ctx.klassMap.pc["Fighter"],
          2,
          {},
          page,
        )
      ).items;

      const weaponFocus = (await query({ family: "Weapon Focus" })).items;
      expect(weaponFocus.every((f) => f.name.startsWith("Weapon Focus: ") && typeof f.eligible === "boolean")).toBe(
        true,
      );
      expect(names(weaponFocus)).not.toContain("Weapon Focus: Longsword");
      expect(grouped.find((r) => r.family === "Weapon Focus")).toMatchObject({
        displayName: "Weapon Focus",
        variantCount: weaponFocus.length,
      });
      // A family row is always offered: its variants carry the eligibility.
      expect(grouped.find((r) => r.family === "Weapon Specialization")).toMatchObject({ eligible: true });
      expect(grouped.find((r) => r.family === null && r.displayName === "Power Attack")).toBeUndefined();
      expect(grouped.find((r) => r.family === null && r.displayName === "Cleave")).toMatchObject({ eligible: true });
      expect(grouped.length).toBeLessThan((await query()).items.length);
    });

    test("leave out a feat that a pending level grants", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000 });
      // The first ranger level grants Track.
      const pending = [
        (await findKlassLevel(ctx.klassMap.pc["Ranger"], 1))!.id,
        (await findKlassLevel(ctx.klassMap.pc["Fighter"], 1))!.id,
      ];
      const args = [
        session,
        characterId,
        ctx.aptMap["General"],
        ctx.klassMap.pc["Fighter"],
        1,
        { search: "Track" },
        page,
      ] as const;
      expect(names((await CharacterLevelsMethods.getAvailableFeats(...args)).items)).toContain("Track");
      expect(names((await CharacterLevelsMethods.getAvailableFeats(...args, undefined, pending)).items)).not.toContain(
        "Track",
      );
      expect(
        (await CharacterLevelsMethods.getAvailableFeatsGrouped(...args, undefined, pending)).items.map(
          (r) => r.displayName,
        ),
      ).not.toContain("Track");
    });

    test("count the feats picked in the same level-up", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter");
      const powerAttack = [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }];
      const args = (where: object) =>
        [session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1, where, page] as const;
      const cleave = async (selectedFeatPicks?: typeof powerAttack) => ({
        flat: (
          await CharacterLevelsMethods.getAvailableFeats(...args({ search: "Cleave", selectedFeatPicks }))
        ).items.find((f) => f.name === "Cleave")!.eligible,
        grouped: (await CharacterLevelsMethods.getAvailableFeatsGrouped(...args({ selectedFeatPicks }))).items.find(
          (r) => r.family === null && r.displayName === "Cleave",
        )!.eligible,
      });

      // Cleave needs Power Attack.
      expect(await cleave()).toEqual({ flat: false, grouped: false });
      expect(await cleave(powerAttack)).toEqual({ flat: true, grouped: true });
      expect(
        names(
          (
            await CharacterLevelsMethods.getAvailableFeats(
              ...args({ search: "Power Attack", selectedFeatPicks: powerAttack }),
            )
          ).items,
        ),
      ).not.toContain("Power Attack");
    });

    test("judge requirements at the level being edited, not the character's last", async () => {
      const ctx = await getSeedCtx();
      const featsAtFirstLevel = async (klass: string, search: string) => {
        const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
        const [firstLevel] = await addClassLevels(db, ctx, characterId, klass, [1, 2], [4, 3]);
        const args = [session, characterId, ctx.aptMap["General"], ctx.klassMap.pc[klass], 1] as const;
        return {
          flat: (await CharacterLevelsMethods.getAvailableFeats(...args, { search }, page, firstLevel)).items.filter(
            (f) => f.name.startsWith(search),
          ),
          grouped: (await CharacterLevelsMethods.getAvailableFeatsGrouped(...args, {}, page, firstLevel)).items,
        };
      };
      // A first wizard level has BAB +0: Weapon Focus and Cleave need +1.
      const wizard = await featsAtFirstLevel("Wizard", "Weapon Focus");
      expect(wizard.flat.length).toBeGreaterThan(0);
      expect(wizard.flat.every((f) => !f.eligible)).toBe(true);
      expect(wizard.grouped.find((r) => r.family === null && r.displayName === "Cleave")).toMatchObject({
        eligible: false,
      });
      // A first fighter level has +1.
      expect((await featsAtFirstLevel("Fighter", "Weapon Focus: Longsword")).flat).toMatchObject([{ eligible: true }]);
    });

    test("list a fork's inherited feats", async () => {
      const { session, character, klass, featAptitude } = await setupRuleset({ fork: true });
      const { items } = await CharacterLevelsMethods.getAvailableFeats(
        session,
        character.id,
        featAptitude.id,
        klass.id,
        1,
        {},
        page,
      );
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
      const pool = (aptitude: string) =>
        CharacterLevelsMethods.getAvailableFeats(
          session,
          characterId,
          ctx.aptMap[aptitude],
          ctx.klassMap.pc["Cleric"],
          1,
          {},
          page,
        );

      const warDomain = (await pool("Cleric Domain")).items.find((f) => f.name === "War Domain")!;
      expect(warDomain.aptitudeModifiers.find((m) => m.aptitudeId === ctx.aptMap["War Domain Weapon"])).toMatchObject({
        value: 1,
        operator: "add",
      });

      const weapons = (await pool("War Domain Weapon")).items;
      expect(weapons).toHaveLength(30);
      expect(weapons.every((f) => f.name.startsWith("War Domain Weapon: ") && f.eligible)).toBe(true);
      expect(names(weapons)).toEqual(
        expect.arrayContaining(["War Domain Weapon: Longsword", "War Domain Weapon: Greataxe"]),
      );

      const longsword = ctx.featMap["War Domain Weapon: Longsword"];
      expect(
        (await Modifiers.findManyBySource(db, { sourceIds: [longsword], sourceType: "feats" }))
          .filter((m) => m.target.endsWith(".possessed"))
          .map(({ target, value, operator }) => ({ target, value, operator }))
          .sort((a, b) => a.target.localeCompare(b.target)),
      ).toEqual([
        { target: "feats.martialweaponproficiencylongsword.possessed", value: "true", operator: "set" },
        { target: "feats.weaponfocuslongsword.possessed", value: "true", operator: "set" },
      ]);
      expect(
        (await Properties.findManyByEntity(db, { entityIds: [longsword], entityType: "feats", type: "FEAT_FAMILY" }))
          .map((p) => p.value)
          .sort(),
      ).toEqual(["Martial Weapon Proficiency", "Weapon Focus"]);
    });

    test("takes Weapon Focus in that weapon off the list, and no other", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "cleric", { xp: 1000 });
      await addFighterLevels(session, ctx, characterId, 1);
      await levelUp(session, ctx, characterId, "Cleric", 1, WAR_CLERIC_1);
      const weaponFocus = async (weapon: string) =>
        (
          await CharacterLevelsMethods.getAvailableFeats(
            session,
            characterId,
            ctx.aptMap["General"],
            ctx.klassMap.pc["Fighter"],
            2,
            { search: `Weapon Focus: ${weapon}` },
            page,
          )
        ).items.find((f) => f.name === `Weapon Focus: ${weapon}`);

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
      const { items } = await CharacterLevelsMethods.getAvailableFeats(
        session,
        characterId,
        ctx.aptMap["War Domain Weapon"],
        ctx.klassMap.pc["Cleric"],
        1,
        {},
        page,
      );
      expect(items.find((f) => f.name === "War Domain Weapon: Longsword")).toMatchObject({ eligible: true });

      const other = await createSeedCharacter(ctx, "cleric", { xp: 1000 });
      await levelUp(session, ctx, other, "Fighter", 1, {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Weapon Focus: Greataxe"] },
      });
      await levelUp(session, ctx, other, "Cleric", 1, WAR_CLERIC_1);
      const levels = await CharacterLevels.findMany(db, { characterId: other });
      const picked = (await CharacterLevelFeats.findMany(db, { characterLevelIds: levels.map((l) => l.id) })).map(
        (f) => f.featId,
      );
      expect(picked).toEqual(
        expect.arrayContaining([ctx.featMap["Weapon Focus: Greataxe"], ctx.featMap["War Domain Weapon: Longsword"]]),
      );
    });
  });

  describe("power slots and the powers of a pool", () => {
    test("list a class level's granted powers, and leave them and those the character has out of the picks", async () => {
      const { session, character, klass, klassLevels, powerAptitude, powers } = await setupRuleset();
      await insertRows(klassLevelPowersInRules, [
        { klassLevelId: klassLevels[1].id, powerId: powers["Rage"].id, aptitudeId: powerAptitude.id },
      ]);
      await addCharacterLevel(character.id, klassLevels[0].id, {
        powers: [{ powerId: powers["Sneak Attack"].id, aptitudeId: powerAptitude.id }],
      });

      expect(
        (await CharacterLevelsMethods.getPowerSlots(session, character.id, klass.id, 2)).autoGrantedPowers,
      ).toMatchObject([{ id: powers["Rage"].id }]);
      const { items } = await CharacterLevelsMethods.getAvailablePowers(
        session,
        character.id,
        powerAptitude.id,
        klass.id,
        2,
        {},
        page,
      );
      expect(items.map(({ name, eligible }) => ({ name, eligible }))).toEqual([
        { name: "Uncanny Dodge", eligible: true },
      ]);
    });

    test("list a fork's inherited powers", async () => {
      const { session, character, klass, powerAptitude } = await setupRuleset({ fork: true });
      const { items } = await CharacterLevelsMethods.getAvailablePowers(
        session,
        character.id,
        powerAptitude.id,
        klass.id,
        1,
        {},
        page,
      );
      expect(
        items.map(({ name, eligible }) => ({ name, eligible })).sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: "Rage", eligible: true },
        { name: "Sneak Attack", eligible: true },
        { name: "Uncanny Dodge", eligible: true },
      ]);
    });

    test("offer every spell of a class's list, extensions' copies included", async () => {
      const ctx = await getSeedCtx();
      const spells = async (build: "sorcerer" | "wizard", klass: string, powerLevel: number) => {
        const characterId = await createSeedCharacter(ctx, build);
        return (
          await CharacterLevelsMethods.getAvailablePowers(
            session,
            characterId,
            ctx.aptMap[`${klass} Spells`],
            ctx.klassMap.pc[klass],
            1,
            { powerLevel },
            page,
          )
        ).items;
      };
      // Being on the list is what makes a spell eligible: an extension's copy once kept only another class's requirement.
      for (const items of [await spells("sorcerer", "Sorcerer", 0), await spells("wizard", "Wizard", 1)]) {
        expect(items.length).toBeGreaterThan(0);
        expect(items.filter((s) => !s.eligible)).toEqual([]);
      }
    });

    test("frees the edited level's own spells", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      // Four cantrips and two first-level spells, all picked at that level.
      expect(
        (await CharacterLevelsMethods.getEditPowerSlots(session, characterId, ctx.klassMap.pc["Sorcerer"], 1, level.id))
          .powersToSelect,
      ).toBe(6);
    });

    describe("prohibited schools", () => {
      const spellNames = async (characterId: string, level: number, where: object = {}) => {
        const ctx = await getSeedCtx();
        return names(
          (
            await CharacterLevelsMethods.getAvailablePowers(
              session,
              characterId,
              ctx.aptMap["Wizard Spells"],
              ctx.klassMap.pc["Wizard"],
              level,
              where,
              page,
            )
          ).items,
        );
      };
      const ILLUSION = "Silent Image";
      const NECROMANCY = ["Disrupt Undead", "Touch of Fatigue", "Ray of Enfeeblement"];

      test("leave out the schools asked for, and those the feats being picked give up", async () => {
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter(ctx, "wizard");
        const prohibit = (...schools: string[]) => ({
          selectedFeatPicks: schools.map((school) => ({
            featId: ctx.featMap[`Prohibit ${school}`],
            aptitudeId: ctx.aptMap["Prohibited School"],
          })),
        });

        const all = await spellNames(characterId, 1);
        expect(all).toEqual(expect.arrayContaining([ILLUSION, "Disrupt Undead", "Touch of Fatigue", "Magic Missile"]));
        const withoutIllusion = await spellNames(characterId, 1, { excludeSchools: ["Illusion"] });
        expect(withoutIllusion.length).toBeLessThan(all.length);
        expect(withoutIllusion).not.toContain(ILLUSION);
        expect(await spellNames(characterId, 1, prohibit("Illusion"))).not.toContain(ILLUSION);

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
        await FeatsMethods.updateRulesetFeat(session, fork.id, ctx.featMap["Prohibit Illusion"], {
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
    test("saves the level with its hit points, skill ranks, feats and powers", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      expect(level).toMatchObject({ characterId, hp: 4, abilityId: null });

      const { skills, feats, powers } = picks(ctx, SORCERER_1);
      const saved = async <T>(rows: Promise<T[]>, key: (row: T) => string) => (await rows).map(key).sort();
      expect(
        await saved(
          CharacterLevelSkills.findMany(db, { characterLevelIds: [level.id] }),
          (s) => `${s.skillId}:${s.rank}`,
        ),
      ).toEqual(
        Object.entries(skills)
          .map(([id, rank]) => `${id}:${rank}`)
          .sort(),
      );
      expect(
        await saved(
          CharacterLevelFeats.findMany(db, { characterLevelIds: [level.id] }),
          (f) => `${f.aptitudeId}:${f.featId}`,
        ),
      ).toEqual(
        Object.entries(feats)
          .flatMap(([aptitude, ids]) => ids.map((id) => `${aptitude}:${id}`))
          .sort(),
      );
      expect(
        await saved(CharacterLevelPowers.findMany(db, { characterLevelIds: [level.id] }), (p) => p.powerId),
      ).toEqual(Object.values(powers).flat().sort());
    });

    test("saves the ability increase of every fourth level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
      await addFighterLevels(session, ctx, characterId, 3);
      expect(await levelUp(session, ctx, characterId, "Fighter", 4, FIGHTER_LEVELS[3])).toMatchObject({
        abilityId: ctx.abilityMap["Strength"],
      });
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
          "Power is not linked to the specified aptitude",
          async () =>
            levelUp(session, ctx, await createSeedCharacter(ctx, "sorcerer"), "Sorcerer", 1, {
              ...SORCERER_1,
              powers: { General: ["Magic Missile"] },
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

    test("refuses a class or a feat of an unrelated ruleset", async () => {
      const { user, session, character, klass, featAptitude } = await setupRuleset({ fork: true });
      const unrelated = await setupRuleset();
      await expect(addOneLevel(session, character.id, unrelated.klass.id, 1, 8, null, {}, {}, {})).rejects.toThrow(
        BadRequestError,
      );
      await expect(
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
      ).rejects.toThrow(BadRequestError);
      void user;
    });

    test("refuses a level that breaks the rules, unless forced", async () => {
      const ctx = await getSeedCtx();
      // Dodge needs DEX 13.
      const plan = {
        ...FIGHTER_LEVELS[0],
        feats: { General: ["Dodge", "Great Fortitude"], "Fighter Bonus Feat": ["Improved Initiative"] },
      };
      await expect(
        levelUp(
          session,
          ctx,
          await createSeedCharacter(ctx, "fighter", { abilities: { Dexterity: 8 } }),
          "Fighter",
          1,
          plan,
        ),
      ).rejects.toThrow(BadRequestError);

      const characterId = await createSeedCharacter(ctx, "fighter", { abilities: { Dexterity: 8 } });
      const level = await levelUp(session, ctx, characterId, "Fighter", 1, plan, true);
      expect(
        (await CharacterLevelFeats.findMany(db, { characterLevelIds: [level.id] })).map((f) => f.featId),
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
      expect((await CharacterLevelFeats.findMany(db, { characterLevelIds: [level.id] })).map((f) => f.featId)).toEqual(
        expect.arrayContaining(Object.values(picks(ctx, WIZARD_1).feats).flat()),
      );
    });
  });

  describe("editing a level", () => {
    const pool = (pools: Record<string, { name: string; allowed: number; available: number }>, name: string) =>
      Object.values(pools).find((p) => p.name === name);

    test("counts a human fighter's bonus feats at the first level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx);
      const [level] = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
      const { aptitudePools } = await CharacterLevelsMethods.getEditFeatSlots(
        session,
        characterId,
        ctx.klassMap.pc["Fighter"],
        1,
        level,
      );
      // One General feat for the first level, one for being human.
      expect(pool(aptitudePools, "General")).toMatchObject({ allowed: 2 });
      expect(pool(aptitudePools, "Fighter Bonus Feat")).toMatchObject({ allowed: 1 });
    });

    describe("of a multiclass character", () => {
      /** A dwarf with a barbarian level, then fighter levels, made in that order. */
      async function setupMulticlass(fighterLevels: number) {
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter(ctx, "dwarf", { xp: 9000 });
        const levelIds = [(await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]))[0]];
        for (let level = 1; level <= fighterLevels; level++)
          levelIds.push((await addClassLevels(db, ctx, characterId, "Fighter", [level], [8]))[0]);
        // Rows made in one transaction share a creation time: order them.
        for (const [offset, id] of levelIds.entries()) {
          await db
            .update(levelsInCharacter)
            .set({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, offset)).toISOString() })
            .where(eq(levelsInCharacter.id, id));
        }
        return { ctx, characterId, levelIds };
      }
      const skillRanks = (ctx: Awaited<ReturnType<typeof getSeedCtx>>, ranks: Record<string, number>) =>
        picks(ctx, { skills: ranks }).skills;

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
        const { aptitudePools } = await CharacterLevelsMethods.getEditFeatSlots(
          session,
          characterId,
          ctx.klassMap.pc["Fighter"],
          1,
          fighter1,
        );
        expect(pool(aptitudePools, "General")!.available).toBeGreaterThanOrEqual(1);

        const { feats } = picks(ctx, {
          feats: { General: ["Power Attack"], "Fighter Bonus Feat": ["Weapon Focus: Battleaxe"] },
        });
        await CharacterLevelsMethods.updateLevel(session, characterId, fighter1, 10, null, {}, feats, {}, true);
        expect(
          (await CharacterLevelFeats.findMany(db, { characterLevelIds: [fighter1] })).map((f) => f.featId).sort(),
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
        const edit = async (index: number, klass: string, ranks: Record<string, number>) => {
          const slots = await CharacterLevelsMethods.getSkillSlots(
            session,
            characterId,
            ctx.klassMap.pc[klass],
            1,
            levelIds[index],
          );
          await CharacterLevelsMethods.updateLevel(
            session,
            characterId,
            levelIds[index],
            8,
            null,
            skillRanks(ctx, ranks),
            {},
            {},
            true,
          );
          const saved = await CharacterLevelSkills.findMany(db, { characterLevelIds: [levelIds[index]] });
          return { ...slots, saved: saved.reduce((sum, s) => sum + s.rank, 0) };
        };

        // Editing the barbarian level: 22 less the 18 the fighter levels spent.
        expect(await edit(0, "Barbarian", { Climb: 2, Jump: 2 })).toMatchObject({
          skillPointsToSpend: 4,
          totalCharacterLevel: 4,
          saved: 4,
        });
        // Editing a middle level: 22 less the 4 + 2 + 8 of the others; the rank cap needs the whole character's level.
        expect(await edit(1, "Fighter", { Climb: 4, Intimidate: 4 })).toMatchObject({
          skillPointsToSpend: 8,
          totalCharacterLevel: 4,
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
        await addPowers(db, ctx, levelIds, [
          { levelIndex: 0, powerName: "Light", aptitude: "Sorcerer Spells" },
          { levelIndex: 0, powerName: "Detect Magic", aptitude: "Sorcerer Spells" },
          { levelIndex: 2, powerName: "Magic Missile", aptitude: "Sorcerer Spells" },
        ]);

        await CharacterLevelsMethods.updateLevel(
          session,
          characterId,
          levelIds[2],
          4,
          null,
          {},
          {},
          picks(ctx, { powers: { "Sorcerer Spells": ["Magic Missile"] } }).powers,
          true,
        );
        expect(await CharacterLevelPowers.findMany(db, { characterLevelIds: [levelIds[2]] })).toMatchObject([
          { powerId: ctx.powerMap["Magic Missile"] },
        ]);
        expect(await CharacterLevelPowers.findMany(db, { characterLevelIds: [levelIds[0]] })).toHaveLength(2);
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
      await expect(
        CharacterLevelsMethods.updateLevel(
          session,
          characterId,
          levelIds[0],
          10,
          null,
          {},
          { [ctx.aptMap["General"]]: [] },
          {},
          false,
        ),
      ).rejects.toThrow(
        expect.objectContaining({ constructor: BadRequestError, message: expect.stringMatching(/cleave/i) }),
      );
    });

    test("keeps the familiar a feat of the edited level brings", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "sorcerer");
      const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
      const familiar = await Characters.findOne(db, { parentCharacterId: characterId, kind: "familiar" });

      const { skills, feats, powers } = picks(ctx, SORCERER_1);
      await CharacterLevelsMethods.updateLevel(session, characterId, level.id, 4, null, skills, feats, powers);
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

      const { detailedCharacter: detailed } = await CharactersMethods.getCharacter(session, characterId);
      if (!(detailed instanceof DetailedCharacter)) throw new Error("Not a D&D 3.5 character");
      expect(detailed.getDetailedCharacterSkills().getSkillBudget()).toMatchObject({
        total: 18,
        spent: 18,
        available: 0,
      });
      expect(
        detailed.validate().issues.filter((i) => i.category === "skills" && /skill point/.test(i.message)),
      ).toEqual([]);
    });
  });

  describe("removing a level", () => {
    test("removes the last one taken, with its picks, even when an earlier one is higher", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 3000 });
      const klassLevel = async (klass: string, level: number) =>
        (await findKlassLevel(ctx.klassMap.pc[klass], level))!.id;
      const [fighter2] = await CharacterLevels.create(db, {
        characterId,
        klassLevelId: await klassLevel("Fighter", 2),
        hp: 10,
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const [rogue1] = await CharacterLevels.create(db, {
        characterId,
        klassLevelId: await klassLevel("Rogue", 1),
        hp: 6,
        createdAt: "2020-01-02T00:00:00.000Z",
      });
      await addSkills(db, ctx, [rogue1.id], [{ levelIndex: 0, skillName: "Hide", rank: 4 }]);
      await addFeats(db, ctx, [rogue1.id], [{ levelIndex: 0, featName: "Dodge", aptitude: "General" }]);

      expect(await CharacterLevelsMethods.removeLevel(session, characterId)).toMatchObject({ success: true });
      expect(await CharacterLevels.findMany(db, { characterId })).toMatchObject([{ id: fighter2.id }]);
      expect(await CharacterLevelSkills.findMany(db, { characterLevelIds: [rogue1.id] })).toEqual([]);
      expect(await CharacterLevelFeats.findMany(db, { characterLevelIds: [rogue1.id] })).toEqual([]);
    });
  });
});
