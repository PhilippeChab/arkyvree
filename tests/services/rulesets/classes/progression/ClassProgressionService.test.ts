import { describe, expect, test } from "bun:test";

import type { Aptitude, Klass, RulesetSave } from "@/engine/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { ClassProgressionService } from "@/server/services/rulesets/classes/progression/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

type Body = Parameters<typeof ClassProgressionService.updateProgression>[3];

/** The seed user's fork of the seeded ruleset, and its inherited class of this name, with its levels by number. */
async function forkWithClass(name: string) {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const klass = (await Entities.findOne<Klass>(db, {
    entityType: "klasses",
    name,
    rulesetId: fork.ancestorRulesetIds[0],
  }))!;
  const levels = await ClassLevelsService.getClassLevels(fork.id, klass.id);
  return { session, fork, klass, levelId: (level: number) => levels.find((l) => l.level === level)!.id };
}

/** A save of `klassId`'s progression in the fork, and the class's levels, spells and pools once written. */
async function save(session: ReturnType<typeof makeSession>, rulesetId: string, klassId: string, body: Body) {
  const saved = await ClassProgressionService.updateProgression(session, rulesetId, klassId, body);
  const byLevel = <T extends { level: number }>(rows: T[]) => new Map(rows.map((row) => [row.level, row]));
  return {
    saved,
    levels: byLevel(await ClassLevelsService.getClassLevels(rulesetId, saved.klassId)),
    perDay: byLevel(await ClassLevelsService.getClassLevelSpells(rulesetId, saved.klassId)),
    known: byLevel(await ClassLevelsService.getClassLevelSpellsKnown(rulesetId, saved.klassId)),
    progression: await ClassProgressionService.getProgression(rulesetId, saved.klassId),
  };
}

describe("ClassProgressionService", () => {
  test("gives an inherited monk a good base attack bonus and 6 skill points, on its fork's copy alone", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Monk");
    const body = {
      levels: [1, 2, 20].map((level) => ({ levelId: levelId(level), fields: { bab: level, skills: 6 } })),
    };

    const { saved, levels } = await save(session, fork.id, klass.id, body);

    expect(saved.klassId).not.toBe(klass.id);
    // The copy's levels it wrote
    expect(saved.levelIds.toSorted()).toEqual([1, 2, 20].map((level) => levels.get(level)!.id).toSorted());
    expect([1, 2, 20].map((level) => [levels.get(level)!.bab, levels.get(level)!.skills])).toEqual([
      [1, 6],
      [2, 6],
      [20, 6],
    ]);
    // Another level, and the ancestor's class, stay as they were
    expect(levels.get(3)!).toMatchObject({ bab: 2, skills: 4 });
    const ancestor = await ClassLevelsService.getClassLevels(fork.ancestorRulesetIds[0], klass.id);
    expect(ancestor.find((level) => level.level === 1)).toMatchObject({ bab: 0, skills: 4 });
  });

  test("writes a level's saves and granted feats as its own form does", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Monk");
    const fortitude = (await Entities.findOne<RulesetSave>(db, {
      entityType: "saves",
      name: "Fortitude",
      rulesetId: fork.ancestorRulesetIds[0],
    }))!;
    const before = await ClassLevelsService.getClassLevels(fork.id, klass.id);
    const first = before.find((level) => level.level === 1)!;
    const saves = first.saves.map((s) => (s.saveId === fortitude.id ? { ...s, base: 0 } : s));
    const feats = first.feats.slice(1).map(({ id, aptitudeId }) => ({ featId: id, aptitudeId }));

    const { levels } = await save(session, fork.id, klass.id, { levels: [{ levelId: levelId(1), saves, feats }] });

    const level = levels.get(1)!;
    expect(level.saves.find((s) => s.saveId === fortitude.id)?.base).toBe(0);
    expect(level.feats.map((feat) => feat.name).toSorted()).toEqual(
      first.feats
        .slice(1)
        .map((f) => f.name)
        .toSorted(),
    );
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
      levels: [{ levelId: levelId(1), fields: { bab: 0, skills: 4 } }],
    });
    const first = (await ClassLevelsService.getClassLevels(fork.id, saved.klassId)).find((level) => level.level === 1)!;
    const [gated] = await Modifiers.create(db, {
      sourceId: first.id,
      sourceType: "klass_levels",
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
      ClassProgressionService.updateProgression(session, fork.id, saved.klassId, {
        spells: { perDay: [{ levelId: first.id, counts: [3, 1] }] },
      }),
      400,
    );
    // Its cantrips: their column has no such modifier, and the 1st-level one keeps its total
    const before = await ClassLevelsService.getClassLevelSpells(fork.id, saved.klassId);
    const firstBefore = before.find((level) => level.level === 1)!.spellsPerDay;
    const { perDay } = await save(session, fork.id, saved.klassId, {
      spells: { perDay: [{ levelId: first.id, counts: [4, firstBefore[1] ?? null] }] },
    });
    expect(perDay.get(1)!.spellsPerDay).toMatchObject({ 0: 4, 1: firstBefore[1] });
  });

  test("refuses a spell list's picks as a pool's", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Sorcerer");
    const list = (await ClassProgressionService.getProgression(fork.id, klass.id)).spellList!;

    await expectRefusedWith(
      ClassProgressionService.updateProgression(session, fork.id, klass.id, {
        pools: [{ aptitudeId: list.id, picks: [{ levelId: levelId(1), count: 1 }] }],
      }),
      400,
    );
  });

  test("reads the picks a feature gives in its pool where it's granted", async () => {
    const { fork, klass } = await forkWithClass("Fighter");
    const levels = await ClassLevelsService.getClassLevels(fork.id, klass.id);
    const bonusFeat = levels[0].feats.find((feat) => feat.name === "Bonus Feat (Fighter)")!;

    const { featPicks } = await ClassProgressionService.getProgression(fork.id, klass.id);

    expect(featPicks[bonusFeat.id]).toEqual({ "Fighter Bonus Feat": 1 });
  });

  test("moves a pool's picks between levels, and reads them back", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    const before = await ClassProgressionService.getProgression(fork.id, klass.id);
    const pool = before.pools.find((p) => p.name === "Wizard Specialization")!;
    expect(pool.picks).toEqual({ [levelId(1)]: 1 });

    const { progression, saved } = await save(session, fork.id, klass.id, {
      pools: [
        {
          aptitudeId: pool.aptitudeId,
          picks: [
            { levelId: levelId(1), count: 0 },
            { levelId: levelId(3), count: 2 },
          ],
        },
      ],
    });

    const copied = await ClassLevelsService.getClassLevels(fork.id, saved.klassId);
    const third = copied.find((level) => level.level === 3)!.id;
    const picks = progression.pools.find((p) => p.name === "Wizard Specialization")!.picks;
    expect(Object.entries(picks).filter(([, count]) => count > 0)).toEqual([[third, 2]]);
    expect(progression.spellList?.name).toBe("Wizard Spells");
  });

  test("refuses a stale save of its own class's level, a count past the rules' bounds, and spells for a class without a list", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Fighter");
    const { saved } = await save(session, fork.id, klass.id, {
      levels: [{ levelId: levelId(1), fields: { bab: 1, skills: 4 } }],
    });
    const own = (await Entities.findOne<Klass>(db, { entityType: "klasses", id: saved.klassId }))!;
    const ownLevels = await ClassLevelsService.getClassLevels(fork.id, own.id);
    const first = ownLevels.find((level) => level.level === 1)!.id;

    const change = { levels: [{ levelId: first, fields: { bab: 1, skills: 6 } }] };
    const stale = "2000-01-01T00:00:00Z";
    expect(
      ClassProgressionService.updateProgression(session, fork.id, own.id, {
        ...change,
        levelTokens: [{ levelId: first, updatedAt: stale }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
      name: "Fighter Bonus Feat Two",
      rulesetId: fork.id,
    });
    await expectRefusedWith(
      ClassProgressionService.updateProgression(session, fork.id, own.id, {
        pools: [{ aptitudeId: aptitude.id, picks: [{ levelId: first, count: 100 }] }],
      }),
      400,
    );
    await expectRefusedWith(
      ClassProgressionService.updateProgression(session, fork.id, own.id, {
        spells: { perDay: [{ levelId: first, counts: [1] }] },
      }),
      400,
    );
    expect((await EntitiesService.getEntity(fork.id, "klasses", own.id)).updatedAt).toBe(saved.updatedAt);
  });

  test("writes nothing for a save that changes nothing, not even a copy of an inherited class", async () => {
    const { session, fork, klass, levelId } = await forkWithClass("Wizard");
    const levels = await ClassLevelsService.getClassLevelSpells(fork.id, klass.id);
    const first = levels.find((level) => level.level === 1)!;
    const counts = [0, 1, 2].map((spellLevel) => first.spellsPerDay[spellLevel] ?? null);

    const saved = await ClassProgressionService.updateProgression(session, fork.id, klass.id, {
      spells: { perDay: [{ levelId: levelId(1), counts }] },
    });

    expect(saved.klassId).toBe(klass.id);
    expect(
      await Entities.findOne<Klass>(db, { entityType: "klasses", name: "Wizard", rulesetId: fork.id }),
    ).toBeUndefined();
  });
});
