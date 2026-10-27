import { describe, expect, test } from "bun:test";

import type { Aptitude, Klass, RulesetSave } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { readClassTable } from "@/tests/support/dnd3.5/classTables.ts";
import { createTestClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { linksOf } from "@/tests/support/entityLinks.ts";
import { createSeededTestRuleset, invalidateSeededRuleset, ownerSessionOf } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

type Body = Parameters<typeof EntitiesService.updateProgression>[4];

/** A save moving a class's Wizard Specialization pick (`poolId`) from a level (`from`) to another (`to`). */
function movePick(poolId: string, from: string, to: string): Body {
  return {
    pools: [
      {
        id: poolId,
        picks: [
          { levelId: from, count: 0 },
          { levelId: to, count: 1 },
        ],
      },
    ],
  };
}

/** The modifier a class's level (`levelId`) gives its Wizard Specialization pick by, as stored. */
async function findSpecializationPick(levelId: string) {
  const modifiers = await Modifiers.findMany(db, { sourceIds: [levelId], sourceType: "class-levels" });
  return modifiers.find((modifier) => modifier.target.startsWith("aptitudes.wizardspecialization."));
}

/** The seed user's fork of the seeded ruleset, and its inherited class of this name, with its levels by number. */
async function forkWithClass(name: string) {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const klass = (await Entities.findOne<Klass>(db, {
    entityType: "classes",
    name,
    rulesetId: fork.ancestorRulesetIds[0],
  }))!;
  const levels = await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", klass.id);
  return { session, fork, klass, levelId: (level: number) => levels.find((l) => l.position === level)!.id };
}

/** A save of `classId`'s progression in the fork, and the class's levels, spells and pools once written. */
async function save(session: ReturnType<typeof makeSession>, rulesetId: string, classId: string, body: Body) {
  const saved = await EntitiesService.updateProgression(session, rulesetId, "classes", classId, body);
  const byLevel = <T extends { position: number }>(rows: T[]) => new Map(rows.map((row) => [row.position, row]));
  return {
    saved,
    levels: byLevel(
      await EntitiesService.getOwnedEntities(await ownerSessionOf(rulesetId), rulesetId, "classes", saved.entityId),
    ),
    perDay: byLevel(await readClassTable(rulesetId, saved.entityId, "spells")),
    known: byLevel(await readClassTable(rulesetId, saved.entityId, "spells-known")),
    progression: await EntitiesService.getProgression(
      await ownerSessionOf(rulesetId),
      rulesetId,
      "classes",
      saved.entityId,
    ),
  };
}

describe("EntitiesService: a class's progression", () => {
  test("gives an inherited monk a good base attack bonus and 6 skill points, on its fork's copy alone", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Monk");
    const body = {
      levels: [1, 2, 20].map((level) => ({
        levelId: levelId(level),
        fields: { [CLASS_LEVEL_BAB]: level, [CLASS_LEVEL_SKILL_POINTS]: 6 },
      })),
    };

    const { saved, levels } = await save(session, fork.id, klass.id, body);

    expect(saved.entityId).not.toBe(klass.id);
    // The copy's levels it wrote
    expect(saved.ownedIds.toSorted()).toEqual([1, 2, 20].map((level) => levels.get(level)!.id).toSorted());
    const babAndSkills = (level: { fields: Readonly<Record<string, unknown>> }) => [
      level.fields[CLASS_LEVEL_BAB],
      level.fields[CLASS_LEVEL_SKILL_POINTS],
    ];
    expect([1, 2, 20].map((level) => babAndSkills(levels.get(level)!))).toEqual([
      [1, 6],
      [2, 6],
      [20, 6],
    ]);
    // Another level, and the ancestor's class, stay as they were
    expect(babAndSkills(levels.get(3)!)).toEqual([2, 4]);
    const ancestor = await EntitiesService.getOwnedEntities(
      await ownerSessionOf(fork.ancestorRulesetIds[0]),
      fork.ancestorRulesetIds[0],
      "classes",
      klass.id,
    );
    expect(babAndSkills(ancestor.find((level) => level.position === 1)!)).toEqual([0, 4]);
  });

  test("writes a level's saves and granted feats as its own form does", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Monk");
    const fortitude = (await Entities.findOne<RulesetSave>(db, {
      entityType: "saves",
      name: "Fortitude",
      rulesetId: fork.ancestorRulesetIds[0],
    }))!;
    const before = await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", klass.id);
    const first = before.find((level) => level.position === 1)!;
    const baseBonus = linksOf(first, "baseBonus").map(({ amount, toId }) => ({
      toId,
      amount: toId === fortitude.id ? 0 : (amount ?? 0),
    }));
    const kept = linksOf(first, "grants").slice(1);
    const grants = kept.map(({ toId, viaId }) => ({ toId, viaId: viaId! }));

    const { levels } = await save(session, fork.id, klass.id, {
      levels: [{ levelId: levelId(1), links: { baseBonus, grants } }],
    });

    const level = levels.get(1)!;
    expect(linksOf(level, "baseBonus").find((s) => s.toId === fortitude.id)?.amount).toBe(0);
    expect(
      linksOf(level, "grants")
        .map((feat) => feat.toName)
        .toSorted(),
    ).toEqual(kept.map((feat) => feat.toName).toSorted());
  });

  test("gives a wizard one more 3rd-level spell a day at 9th, every other level keeping its totals", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");

    const { perDay } = await save(session, fork.id, klass.id, {
      spells: { perDay: [{ levelId: levelId(9), counts: [4, 4, 4, 4, 2, 1] }] },
    });

    expect(perDay.get(8)!.spellsPerDay).toEqual({ 0: 4, 1: 4, 2: 3, 3: 3, 4: 2 });
    expect(perDay.get(9)!.spellsPerDay).toEqual({ 0: 4, 1: 4, 2: 4, 3: 4, 4: 2, 5: 1 });
    expect(perDay.get(10)!.spellsPerDay).toEqual({ 0: 4, 1: 4, 2: 4, 3: 3, 4: 3, 5: 2 });
  });

  test("keeps a paladin's 0 spells a day where its spell level opens, and opens one with 0 where asked", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Paladin");

    const { perDay } = await save(session, fork.id, klass.id, {
      spells: {
        perDay: [
          { levelId: levelId(6), counts: [null, 2] },
          { levelId: levelId(7), counts: [null, 2] },
          { levelId: levelId(3), counts: [null, 0] },
        ],
      },
    });

    expect(perDay.get(2)!.spellsPerDay).toEqual({});
    expect(perDay.get(3)!.spellsPerDay).toEqual({ 1: 0 });
    expect(perDay.get(4)!.spellsPerDay).toEqual({ 1: 0 });
    expect(perDay.get(6)!.spellsPerDay).toEqual({ 1: 2 });
    expect(perDay.get(8)!.spellsPerDay).toEqual({ 1: 1, 2: 0 });
  });

  test("sets a sorcerer's spells known, every one of a spell level's from a level on", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Sorcerer");

    const { known } = await save(session, fork.id, klass.id, {
      spells: { known: [{ levelId: levelId(2), counts: [6, "all"] }] },
    });

    expect(known.get(1)!.spellsKnown).toEqual({ 0: 4, 1: 2 });
    expect(known.get(2)!.spellsKnown).toEqual({ 0: 6, 1: "All" });
    // A later level keeps its own total
    expect(known.get(3)!.spellsKnown).toMatchObject({ 0: 5, 1: "All" });
  });

  test("keeps a paladin's spells per day as they were when its spells known move", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Paladin");

    const { perDay, known } = await save(session, fork.id, klass.id, {
      spells: {
        known: [
          { levelId: levelId(4), counts: [null, null] },
          { levelId: levelId(5), counts: [null, null] },
          { levelId: levelId(6), counts: [null, "all"] },
        ],
      },
    });

    expect([4, 5, 6].map((level) => String(known.get(level)!.spellsKnown[1]))).toEqual([
      "undefined",
      "undefined",
      "All",
    ]);
    // Its 0 a day at 4th and 5th came of its spells known opening there: they stay
    expect([4, 5, 6].map((level) => perDay.get(level)!.spellsPerDay[1])).toEqual([0, 0, 1]);
  });

  test("refuses a change to a spell column a requirement gates a modifier of, and takes one to another", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    // The fork's own wizard, its first level given a 1st-level spell a day more past 5th character level
    const { saved } = await save(session, fork.id, klass.id, {
      levels: [{ levelId: levelId(1), fields: { [CLASS_LEVEL_BAB]: 0, [CLASS_LEVEL_SKILL_POINTS]: 4 } }],
    });
    const first = (
      await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", saved.entityId)
    ).find((level) => level.position === 1)!;
    const [gated] = await Modifiers.create(db, {
      sourceId: first.id,
      sourceType: "class-levels",
      target: "aptitudes.wizardspells.1.uses",
      operator: "add",
      value: "1",
      valueType: "number",
    });
    await Requirements.create(db, {
      entityId: gated.id,
      entityType: "modifiers",
      level: "1",
      target: "identity.meta.level",
      operator: "greater_than_or_equal",
      value: "5",
      valueType: "number",
    });
    RulesetViews.invalidate(fork.id);

    await expectRefusedWith(
      EntitiesService.updateProgression(session, fork.id, "classes", saved.entityId, {
        spells: { perDay: [{ levelId: first.id, counts: [3, 1] }] },
      }),
      400,
    );
    // Its cantrips: their column has no such modifier, and the 1st-level one keeps its total
    const before = await readClassTable(fork.id, saved.entityId, "spells");
    const firstBefore = before.find((level) => level.position === 1)!.spellsPerDay;
    const { perDay } = await save(session, fork.id, saved.entityId, {
      spells: { perDay: [{ levelId: first.id, counts: [4, firstBefore[1] ?? null] }] },
    });
    expect(perDay.get(1)!.spellsPerDay).toMatchObject({ 0: 4, 1: firstBefore[1] });
  });

  test("refuses a spell list's picks as a pool's", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Sorcerer");
    const list = (await EntitiesService.getProgression(await ownerSessionOf(fork.id), fork.id, "classes", klass.id))
      .spellList!;

    await expectRefusedWith(
      EntitiesService.updateProgression(session, fork.id, "classes", klass.id, {
        pools: [{ id: list.id, picks: [{ levelId: levelId(1), count: 1 }] }],
      }),
      400,
    );
  });

  test("reads the picks a feature gives in its pool where it's granted", async () => {
    const { fork, klass } = await forkWithClass("Fighter");
    const levels = await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", klass.id);
    const bonusFeat = linksOf(levels[0], "grants").find((feat) => feat.toName === "Bonus Feat (Fighter)")!;

    const { featPicks } = await EntitiesService.getProgression(
      await ownerSessionOf(fork.id),
      fork.id,
      "classes",
      klass.id,
    );

    expect(featPicks[bonusFeat.toId]).toEqual({ "Fighter Bonus Feat": 1 });
  });

  test("moves a pool's picks between levels, and reads them back", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    const before = await EntitiesService.getProgression(await ownerSessionOf(fork.id), fork.id, "classes", klass.id);
    const pool = before.pools.find((p) => p.name === "Wizard Specialization")!;
    expect(pool.picks).toEqual({ [levelId(1)]: 1 });

    const { progression, saved } = await save(session, fork.id, klass.id, {
      pools: [
        {
          id: pool.id,
          picks: [
            { levelId: levelId(1), count: 0 },
            { levelId: levelId(3), count: 2 },
          ],
        },
      ],
    });

    const copied = await EntitiesService.getOwnedEntities(
      await ownerSessionOf(fork.id),
      fork.id,
      "classes",
      saved.entityId,
    );
    const third = copied.find((level) => level.position === 3)!.id;
    const picks = progression.pools.find((p) => p.name === "Wizard Specialization")!.picks;
    expect(Object.entries(picks).filter(([, count]) => count > 0)).toEqual([[third, 2]]);
    expect(progression.spellList?.name).toBe("Wizard Spells");
  });

  test("refuses a stale save of its own class's level, a count past the rules' bounds, and spells for a class without a list", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Fighter");
    const { saved } = await save(session, fork.id, klass.id, {
      levels: [{ levelId: levelId(1), fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 } }],
    });
    const own = (await Entities.findOne<Klass>(db, { entityType: "classes", id: saved.entityId }))!;
    const ownLevels = await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", own.id);
    const first = ownLevels.find((level) => level.position === 1)!.id;

    const change = { levels: [{ levelId: first, fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 6 } }] };
    const stale = "2000-01-01T00:00:00Z";
    expect(
      EntitiesService.updateProgression(session, fork.id, "classes", own.id, {
        ...change,
        ownedTokens: [{ id: first, updatedAt: stale }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
      name: "Fighter Bonus Feat Two",
      rulesetId: fork.id,
    });
    await expectRefusedWith(
      EntitiesService.updateProgression(session, fork.id, "classes", own.id, {
        pools: [{ id: aptitude.id, picks: [{ levelId: first, count: 100 }] }],
      }),
      400,
    );
    await expectRefusedWith(
      EntitiesService.updateProgression(session, fork.id, "classes", own.id, {
        spells: { perDay: [{ levelId: first, counts: [1] }] },
      }),
      400,
    );
    expect((await EntitiesService.getEntity(await ownerSessionOf(fork.id), fork.id, "classes", own.id)).updatedAt).toBe(
      saved.updatedAt,
    );
  });

  test("refuses a save dropping a modifier deleted since the view was read as not found, on its own class", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    const { saved } = await save(session, fork.id, klass.id, {
      levels: [{ levelId: levelId(1), fields: { [CLASS_LEVEL_BAB]: 0, [CLASS_LEVEL_SKILL_POINTS]: 4 } }],
    });
    const own = await EntitiesService.getOwnedEntities(
      await ownerSessionOf(fork.id),
      fork.id,
      "classes",
      saved.entityId,
    );
    const [first, third] = [1, 3].map((level) => own.find((l) => l.position === level)!.id);
    // The view read, then the pick its save moves deleted
    const { pools } = await EntitiesService.getProgression(
      await ownerSessionOf(fork.id),
      fork.id,
      "classes",
      saved.entityId,
    );
    const pool = pools.find((p) => p.name === "Wizard Specialization")!;
    await Modifiers.delete(db, { id: (await findSpecializationPick(first))!.id });

    await expectRefusedWith(
      EntitiesService.updateProgression(session, fork.id, "classes", saved.entityId, movePick(pool.id, first, third)),
      404,
    );
    expect(await findSpecializationPick(third)).toBeUndefined();
  });

  test("refuses a save dropping a modifier deleted since the view was read as not found, on an inherited class's copy", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    const { pools } = await EntitiesService.getProgression(await ownerSessionOf(fork.id), fork.id, "classes", klass.id);
    const pool = pools.find((p) => p.name === "Wizard Specialization")!;
    // Its source's pick deleted since the view was read: the copy the save makes holds none of it
    await Modifiers.delete(db, { id: (await findSpecializationPick(levelId(1)))!.id });

    await expectRefusedWith(
      EntitiesService.updateProgression(
        session,
        fork.id,
        "classes",
        klass.id,
        movePick(pool.id, levelId(1), levelId(3)),
      ),
      404,
    );
    invalidateSeededRuleset(fork.ancestorRulesetIds[0]);
    expect(
      await Entities.findOne<Klass>(db, { entityType: "classes", name: "Wizard", rulesetId: fork.id }),
    ).toBeUndefined();
  });

  test("refuses a save whose class or level is gone since the view was read, each named in the rules' word", async () => {
    const session = makeSession();
    const fork = await createSeededTestRuleset(session.userId);
    const level = await createTestClassLevel(fork.id);
    const other = await createTestClassLevel(fork.id);
    const change = (levelId: string) => ({ levels: [{ levelId, fields: { [CLASS_LEVEL_SKILL_POINTS]: 6 } }] });
    // The view is read; then another write deletes the level, and the other class
    await withRulesetScope(db, fork.id, async () => undefined);
    await Entities.delete(db, { entityType: "class-levels", id: level.classLevel.id });
    await Entities.delete(db, { entityType: "classes", id: other.klass.id });

    expect(
      EntitiesService.updateProgression(session, fork.id, "classes", level.klass.id, change(level.classLevel.id)),
    ).rejects.toMatchObject({ message: "Class level no longer exists; refresh the class", name: "NotFoundError" });
    expect(
      EntitiesService.updateProgression(session, fork.id, "classes", other.klass.id, change(other.classLevel.id)),
    ).rejects.toMatchObject({ message: "Class no longer exists; refresh the class", name: "NotFoundError" });
  });

  test("refuses a body that isn't a save, as its rules read it, writing nothing", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Fighter");
    for (const body of [
      { levels: "all" },
      { levels: [{ levelId: "not-an-id" }] },
      { levels: [{ levelId: levelId(1), fields: 1 }] },
      { pools: [{ aptitudeId: levelId(1), picks: "all" }] },
      { spells: { perDay: [{ levelId: levelId(1), counts: "all" }] } },
    ]) {
      const refused = EntitiesService.updateProgression(session, fork.id, "classes", klass.id, body as never);
      await expectRefusedWith(refused, 400);
    }
    expect(
      (await EntitiesService.getEntity(await ownerSessionOf(fork.id), fork.id, "classes", klass.id)).updatedAt,
    ).toBe(klass.updatedAt);
  });

  test("writes nothing for a save that changes nothing, not even a copy of an inherited class", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    const levels = await readClassTable(fork.id, klass.id, "spells");
    const first = levels.find((level) => level.position === 1)!;
    const counts = [0, 1, 2].map((spellLevel) => first.spellsPerDay[spellLevel] ?? null);

    const saved = await EntitiesService.updateProgression(session, fork.id, "classes", klass.id, {
      spells: { perDay: [{ levelId: levelId(1), counts }] },
    });

    expect(saved.entityId).toBe(klass.id);
    expect(
      await Entities.findOne<Klass>(db, { entityType: "classes", name: "Wizard", rulesetId: fork.id }),
    ).toBeUndefined();
  });
});
