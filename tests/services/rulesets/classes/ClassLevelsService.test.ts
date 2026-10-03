import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  featsInRules,
  klassLevelFeatsInRules,
  klassLevelPowersInRules,
  klassLevelSavesInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import {
  Abilities,
  Aptitudes,
  EntitySnapshots,
  Feats,
  KlassLevelFeats,
  KlassLevels,
  Modifiers,
  Powers,
  Properties,
  Requirements,
  Saves,
} from "@/server/repositories/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import {
  addCharacterLevel,
  createTestCharacter,
  createTestRuleset,
  createTestUserAndRuleset,
  insertRows,
  NIL_UUID,
} from "@/tests/helpers.ts";

/** A new user's empty ruleset with a class and an aptitude. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const klass = await ClassesService.createRulesetKlass(session, ruleset.id, { name: "Test Class" });
  const [aptitude] = await Aptitudes.create(db, { name: "Fighter Bonus Feat", rulesetId: ruleset.id });
  return { user, session, ruleset, klass, aptitude, poolTarget: `aptitudes.${stripSeparators(aptitude.name)}.allowed` };
}

type LevelBody = Omit<Parameters<typeof ClassLevelsService.createClassLevel>[3], "level">;

function createLevel(
  session: Session,
  rulesetId: string,
  klassId: string,
  level: number,
  body: Partial<LevelBody> = {},
) {
  return ClassLevelsService.createClassLevel(session, rulesetId, klassId, { level, bab: level, skills: 4, ...body });
}

async function createSave(rulesetId: string, name: string) {
  const [ability] = await Abilities.create(db, { name: `${name} Ability`, description: name, rulesetId });
  const [save] = await Saves.create(db, { name, abilityId: ability.id, rulesetId });
  return save;
}

const modifier = (sourceId: string, target: string, value: string) =>
  ({ sourceId, sourceType: "klass_levels", target, value, valueType: "number", operator: "add" }) as const;

// Creating, reading, updating and deleting a level, and the requirement on the previous level, are covered in the class levels router test.
describe("ClassLevelsService", () => {
  describe("feats and saves", () => {
    test("lists a class's levels in order, with the feats they grant through an aptitude and their base saves", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
        name: "Cleave",
        aptitudeIds: [aptitude.id],
      });
      const fortitude = await createSave(ruleset.id, "Fortitude");
      await createLevel(session, ruleset.id, klass.id, 2);
      await createLevel(session, ruleset.id, klass.id, 1, {
        feats: [{ featId: feat.id, aptitudeId: aptitude.id, free: false }],
        saves: [{ saveId: fortitude.id, base: 2 }],
      });

      expect(await ClassLevelsService.getClassLevels(ruleset.id, klass.id)).toMatchObject([
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ id: feat.id, aptitudeId: aptitude.id, aptitudeName: aptitude.name, free: false }],
          saves: [{ saveId: fortitude.id, base: 2 }],
        },
        { level: 2, bab: 2, feats: [], saves: [] },
      ]);
    });

    test("an update replaces them, keeps them when it omits them, and clears them", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const [cleave, dodge] = await insertRows(featsInRules, [
        { name: "Cleave", rulesetId: ruleset.id },
        { name: "Dodge", rulesetId: ruleset.id },
      ]);
      const [fortitude, reflex] = [await createSave(ruleset.id, "Fortitude"), await createSave(ruleset.id, "Reflex")];
      const level = await createLevel(session, ruleset.id, klass.id, 1, {
        feats: [{ featId: cleave.id, aptitudeId: aptitude.id }],
        saves: [{ saveId: fortitude.id, base: 2 }],
      });
      const update = (body: Partial<LevelBody>) =>
        ClassLevelsService.updateClassLevel(session, ruleset.id, klass.id, level.id, body);
      const links = async () => ({
        feats: (
          await db.select().from(klassLevelFeatsInRules).where(eq(klassLevelFeatsInRules.klassLevelId, level.id))
        ).map((f) => f.featId),
        saves: (
          await db.select().from(klassLevelSavesInRules).where(eq(klassLevelSavesInRules.klassLevelId, level.id))
        ).map((s) => s.saveId),
      });

      await update({ feats: [{ featId: dodge.id, aptitudeId: aptitude.id }], saves: [{ saveId: reflex.id, base: 2 }] });
      expect(await links()).toEqual({ feats: [dodge.id], saves: [reflex.id] });
      await update({ bab: 2 });
      expect(await links()).toEqual({ feats: [dodge.id], saves: [reflex.id] });
      await update({ feats: [], saves: [] });
      expect(await links()).toEqual({ feats: [], saves: [] });
    });
  });

  test("reads a level with its customizations, and by id alone with its class's name", async () => {
    const { session, ruleset, klass } = await setup();
    await createLevel(session, ruleset.id, klass.id, 1);
    const level = await createLevel(session, ruleset.id, klass.id, 2);
    await Modifiers.create(db, modifier(level.id, "combat.bab", "1"));

    const detail = {
      id: level.id,
      level: 2,
      bab: 2,
      skills: 4,
      modifiers: [{ target: "combat.bab" }],
      requirements: [{ target: "classes.testclass.level", value: "1" }],
    };
    expect(await ClassLevelsService.getClassLevel(ruleset.id, klass.id, level.id)).toMatchObject(detail);
    expect(await ClassLevelsService.getClassLevelById(ruleset.id, level.id)).toMatchObject({
      ...detail,
      name: "Test Class",
    });
  });

  test("keeps the properties a user added when the level's BAB changes", async () => {
    // Regression: saving BAB or skill points once replaced every property of the level.
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);
    await Properties.create(db, {
      entityId: level.id,
      entityType: "klass_levels",
      type: "CLASS_FEATURE",
      value: "Rage",
    });

    expect(
      await ClassLevelsService.updateClassLevel(session, ruleset.id, klass.id, level.id, { bab: 3 }),
    ).toMatchObject({ bab: 3, skills: 4 });
    const properties = await Properties.findMany(db, { entityIds: [level.id], entityType: "klass_levels" });
    expect(properties.map((p) => p.type).sort()).toEqual([
      "CLASS_FEATURE",
      "KLASS_LEVEL_BAB",
      "KLASS_LEVEL_SKILL_POINTS",
    ]);
  });

  describe("feat pools", () => {
    test("add up the picks each level grants, leaving spell slots out", async () => {
      const { session, ruleset, klass, aptitude, poolTarget } = await setup();
      const [first, second] = [
        await createLevel(session, ruleset.id, klass.id, 1),
        await createLevel(session, ruleset.id, klass.id, 2),
      ];
      await createLevel(session, ruleset.id, klass.id, 3);
      await Modifiers.createMany(db, [
        modifier(first.id, poolTarget, "1"),
        modifier(second.id, poolTarget, "1"),
        modifier(first.id, "aptitudes.wizardspells.1.uses", "1"),
      ]);

      expect((await ClassLevelsService.getClassLevelFeatPools(ruleset.id, klass.id)).map((l) => l.featPools)).toEqual([
        { [aptitude.name]: 1 },
        { [aptitude.name]: 2 },
        { [aptitude.name]: 2 },
      ]);
    });

    test("count a stackable feat's picks at every level that grants it", async () => {
      // Regression: only the levels' own modifiers were read, so a pool granted through a feat was missing.
      const { session, ruleset, klass, aptitude, poolTarget } = await setup();
      const [bonusFeat] = await Feats.create(db, { name: "Bonus Feat", rulesetId: ruleset.id, stackable: true });
      await Modifiers.create(db, { ...modifier(bonusFeat.id, poolTarget, "1"), sourceType: "feats" });
      for (const level of [1, 2]) {
        const created = await createLevel(session, ruleset.id, klass.id, level);
        await KlassLevelFeats.create(db, {
          klassLevelId: created.id,
          featId: bonusFeat.id,
          aptitudeId: aptitude.id,
          free: true,
        });
      }

      expect((await ClassLevelsService.getClassLevelFeatPools(ruleset.id, klass.id)).map((l) => l.featPools)).toEqual([
        { [aptitude.name]: 1 },
        { [aptitude.name]: 2 },
      ]);
    });
  });

  test("adds up the spells per day each level grants, leaving feat pools out", async () => {
    const { session, ruleset, klass, poolTarget } = await setup();
    const [first, second] = [
      await createLevel(session, ruleset.id, klass.id, 1),
      await createLevel(session, ruleset.id, klass.id, 2),
    ];
    await Modifiers.createMany(db, [
      modifier(first.id, "aptitudes.wizardspells.0.uses", "3"),
      modifier(first.id, "aptitudes.wizardspells.1.uses", "1"),
      modifier(first.id, poolTarget, "1"),
      modifier(second.id, "aptitudes.wizardspells.0.uses", "1"),
      modifier(second.id, "aptitudes.wizardspells.1.uses", "1"),
    ]);

    expect((await ClassLevelsService.getClassLevelSpells(ruleset.id, klass.id)).map((l) => l.spellsPerDay)).toEqual([
      { 0: 3, 1: 1 },
      { 0: 4, 1: 2 },
    ]);
  });

  test("refuses changes from anyone but the owner", async () => {
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);
    const { session: other } = await createTestUserAndRuleset();
    for (const change of [
      () => createLevel(other, ruleset.id, klass.id, 2),
      () => ClassLevelsService.updateClassLevel(other, ruleset.id, klass.id, level.id, { bab: 3 }),
      () => ClassLevelsService.deleteClassLevel(other, ruleset.id, klass.id, level.id),
    ])
      await expect(change()).rejects.toThrow(ForbiddenError);
  });

  test("doesn't find a missing ruleset, class or level, nor a level through another ruleset", async () => {
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);
    const other = await setup();
    const cases: [string, () => Promise<unknown>][] = [
      ["create in a missing ruleset", () => createLevel(session, NIL_UUID, klass.id, 2)],
      ["create for a missing class", () => createLevel(session, ruleset.id, NIL_UUID, 2)],
      [
        "update in a missing ruleset",
        () => ClassLevelsService.updateClassLevel(session, NIL_UUID, klass.id, level.id, { bab: 2 }),
      ],
      [
        "update for a missing class",
        () => ClassLevelsService.updateClassLevel(session, ruleset.id, NIL_UUID, level.id, { bab: 2 }),
      ],
      ["delete in a missing ruleset", () => ClassLevelsService.deleteClassLevel(session, NIL_UUID, klass.id, level.id)],
      [
        "delete for a missing class",
        () => ClassLevelsService.deleteClassLevel(session, ruleset.id, NIL_UUID, level.id),
      ],
      ["read for a missing class", () => ClassLevelsService.getClassLevel(ruleset.id, NIL_UUID, level.id)],
      ["read a missing level", () => ClassLevelsService.getClassLevel(ruleset.id, klass.id, NIL_UUID)],
      ["read by id through another ruleset", () => ClassLevelsService.getClassLevelById(other.ruleset.id, level.id)],
      ["feat pools of a missing ruleset", () => ClassLevelsService.getClassLevelFeatPools(NIL_UUID, klass.id)],
      ["feat pools of a missing class", () => ClassLevelsService.getClassLevelFeatPools(ruleset.id, NIL_UUID)],
      ["spells of a missing ruleset", () => ClassLevelsService.getClassLevelSpells(NIL_UUID, klass.id)],
    ];
    // One at a time: each write opens a savepoint on the test's single connection.
    for (const [what, call] of cases) {
      expect({
        what,
        error: await call().then(
          () => null,
          (error: Error) => error.constructor,
        ),
      }).toEqual({ what, error: NotFoundError });
    }
  });

  describe("deleting a level", () => {
    test("deletes its feats, powers, saves and customizations", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const [feat] = await Feats.create(db, { name: "Cleave", rulesetId: ruleset.id });
      const [power] = await Powers.create(db, { name: "Rage", rulesetId: ruleset.id });
      const save = await createSave(ruleset.id, "Fortitude");
      await createLevel(session, ruleset.id, klass.id, 1);
      const level = await createLevel(session, ruleset.id, klass.id, 2, {
        feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
        saves: [{ saveId: save.id, base: 2 }],
      });
      await insertRows(klassLevelPowersInRules, [
        { klassLevelId: level.id, powerId: power.id, aptitudeId: aptitude.id },
      ]);
      await Modifiers.create(db, modifier(level.id, "combat.bab", "1"));

      await ClassLevelsService.deleteClassLevel(session, ruleset.id, klass.id, level.id);

      expect(await KlassLevels.findOne(db, { id: level.id })).toBeUndefined();
      for (const table of [klassLevelFeatsInRules, klassLevelPowersInRules, klassLevelSavesInRules]) {
        expect(await db.select().from(table).where(eq(table.klassLevelId, level.id))).toEqual([]);
      }
      expect(await Modifiers.findMany(db, { sourceIds: [level.id], sourceType: "klass_levels" })).toEqual([]);
      expect(await Requirements.findMany(db, { entityIds: [level.id], entityType: "klass_levels" })).toEqual([]);
      expect(await Properties.findMany(db, { entityIds: [level.id], entityType: "klass_levels" })).toEqual([]);
    });

    test("is refused while a character has taken it", async () => {
      const { user, session, ruleset, klass } = await setup();
      const level = await createLevel(session, ruleset.id, klass.id, 1);
      const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
      await addCharacterLevel(character.id, level.id);

      await expect(ClassLevelsService.deleteClassLevel(session, ruleset.id, klass.id, level.id)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("in a fork", () => {
    /** A fork of `setup()`'s ruleset, whose class has a first level. */
    async function setupFork() {
      const context = await setup();
      const inheritedLevel = await createLevel(context.session, context.ruleset.id, context.klass.id, 1);
      const fork = await createTestRuleset(context.user.id, {
        rulesetId: context.ruleset.id,
        ancestorRulesetIds: [context.ruleset.id],
      });
      return { ...context, parent: context.ruleset, fork, inheritedLevel };
    }

    test("reads the inherited class's levels", async () => {
      const { fork, klass, inheritedLevel } = await setupFork();
      expect(await ClassLevelsService.getClassLevels(fork.id, klass.id)).toMatchObject([
        { id: inheritedLevel.id, level: 1, bab: 1 },
      ]);
      expect(await ClassLevelsService.getClassLevel(fork.id, klass.id, inheritedLevel.id)).toMatchObject({
        id: inheritedLevel.id,
      });
      expect(await ClassLevelsService.getClassLevelById(fork.id, inheritedLevel.id)).toMatchObject({
        id: inheritedLevel.id,
        name: klass.name,
      });
    });

    test("adds a level to the fork's copy of the class, not to the parent's", async () => {
      const { session, fork, klass } = await setupFork();
      const created = await createLevel(session, fork.id, klass.id, 2);

      const snapshot = await EntitySnapshots.findOne(db, {
        sourceEntityId: klass.id,
        rulesetId: fork.id,
      });
      expect(created.klassId).toBe(snapshot!.forkedEntityId);
      expect((await KlassLevels.findMany(db, { klassId: klass.id })).map((l) => l.level)).toEqual([1]);
    });

    test("edits and deletes the fork's copy of an inherited level, leaving the parent's", async () => {
      const { session, parent, fork, klass, inheritedLevel } = await setupFork();
      // Regression: the first edit copies the level mid-save, and a stat the edit leaves out was read as 0.
      expect(
        await ClassLevelsService.updateClassLevel(session, fork.id, klass.id, inheritedLevel.id, { bab: 5 }),
      ).toMatchObject({ bab: 5, skills: 4 });

      await ClassLevelsService.deleteClassLevel(session, fork.id, klass.id, inheritedLevel.id);
      expect(await ClassLevelsService.getClassLevels(fork.id, klass.id)).toEqual([]);
      expect(await ClassLevelsService.getClassLevels(parent.id, klass.id)).toMatchObject([
        { id: inheritedLevel.id, bab: 1, skills: 4 },
      ]);
    });

    test("doesn't find a class of an unrelated ruleset", async () => {
      const { session, fork } = await setupFork();
      const other = await setup();
      const otherLevel = await createLevel(other.session, other.ruleset.id, other.klass.id, 1);

      await expect(createLevel(session, fork.id, other.klass.id, 1)).rejects.toThrow(NotFoundError);
      await expect(
        ClassLevelsService.updateClassLevel(session, fork.id, other.klass.id, otherLevel.id, { bab: 2 }),
      ).rejects.toThrow(NotFoundError);
      await expect(ClassLevelsService.getClassLevelSpells(fork.id, other.klass.id)).rejects.toThrow(NotFoundError);
    });
  });
});
