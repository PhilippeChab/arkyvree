/**
 * Parity tests: composed cache join maps must return the same rows and shape
 * as the queries they replaced, kept here as the reference. Guards against
 * silent drift if someone adds a filter/column to the tables and forgets to
 * mirror it in the cache compose step.
 */

import { beforeAll, describe, expect, test } from "bun:test";

import { type RulesetData } from "@/engine/core/view/index.ts";
import type { Feat, KlassLevelFeat, KlassLevelPower, KlassSkill, Power, Skill } from "@/engine/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { type SeedContext } from "@/scripts/db/seeds/seedContext.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Joins, Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

function sortById<T extends { id: string }>(xs: T[]) {
  return [...xs].sort((a, b) => a.id.localeCompare(b.id));
}

/** Each row with what its `key` names, of the rows `find` reads by id, under `as`. */
async function withRows<T, K extends keyof T & string, A extends string, E extends { id: string }>(
  rows: T[],
  key: K,
  as: A,
  find: (ids: string[]) => Promise<E[]>,
) {
  const found = new Map((await find(rows.map((row) => String(row[key])))).map((entity) => [entity.id, entity]));
  return rows.map((row) => ({ ...row, [as]: found.get(String(row[key]))! }) as T & Record<A, E>);
}

describe("cache join-maps — parity with repository queries", () => {
  let ctx: SeedContext;
  let rulesetData: RulesetData;

  beforeAll(async () => {
    ctx = await getSeedCtx();
    const ruleset = await Rulesets.findOne(db, { id: ctx.rulesetId });
    if (!ruleset) throw new Error("seed ruleset missing");
    rulesetData = await RulesetViews.getData(ruleset);
  });

  test("klassLevelFeatsWithFeatsByKlassLevel matches the class level's feats with their feat", async () => {
    const fighterId = ctx.klassMap.pc["Fighter"];
    const klassLevel = Dnd35View.of(rulesetData).klassLevelByKlassAndLevel.get(`${fighterId}:1`);
    expect(klassLevel).toBeDefined();

    const fromCache = Dnd35View.of(rulesetData).klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel!.id) ?? [];
    const fromDb = await withRows(
      await Joins.findMany<KlassLevelFeat>(db, { join: "klass_level_feats", fromIds: [klassLevel!.id] }),
      "featId",
      "featsInRule",
      async (ids) => await Entities.findMany<Feat>(db, { entityType: "feats", ids }),
    );

    expect(fromCache.length).toBe(fromDb.length);
    const mapRow = (r: (typeof fromDb)[number]) => ({
      id: r.id,
      klassLevelId: r.klassLevelId,
      featId: r.featId,
      free: r.free,
      featsInRuleId: r.featsInRule.id,
      featsInRuleName: r.featsInRule.name,
    });
    expect(sortById(fromCache).map(mapRow)).toEqual(sortById(fromDb).map(mapRow));
  });

  test("klassLevelPowersWithPowersByKlassLevel matches the class level's powers with their power", async () => {
    // Pick a class level that's likely to have auto-granted powers — Wizard L1.
    const klassId = ctx.klassMap.pc["Wizard"];
    const klassLevel = Dnd35View.of(rulesetData).klassLevelByKlassAndLevel.get(`${klassId}:1`);
    if (!klassLevel) return; // seed doesn't have Wizard at this level — skip

    const fromCache = Dnd35View.of(rulesetData).klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];
    const fromDb = await withRows(
      await Joins.findMany<KlassLevelPower>(db, { join: "klass_level_powers", fromIds: [klassLevel.id] }),
      "powerId",
      "powersInRule",
      async (ids) => await Entities.findMany<Power>(db, { entityType: "powers", ids }),
    );

    expect(fromCache.length).toBe(fromDb.length);
    // klass_level_powers has no `id` column — sort by (powerId, aptitudeId).
    const sortByPowerApt = <T extends { aptitudeId: string; powerId: string }>(xs: T[]) =>
      [...xs].sort((a, b) => a.powerId.localeCompare(b.powerId) || a.aptitudeId.localeCompare(b.aptitudeId));
    const mapRow = (r: (typeof fromDb)[number]) => ({
      klassLevelId: r.klassLevelId,
      powerId: r.powerId,
      aptitudeId: r.aptitudeId,
      free: r.free,
      powersInRuleId: r.powersInRule.id,
      powersInRuleName: r.powersInRule.name,
    });
    expect(sortByPowerApt(fromCache).map(mapRow)).toEqual(sortByPowerApt(fromDb).map(mapRow));
  });

  test("klassSkillsWithSkillsByKlass matches the class's skills with their skill", async () => {
    const fighterId = ctx.klassMap.pc["Fighter"];

    const fromCache = Dnd35View.of(rulesetData).klassSkillsWithSkillsByKlass.get(fighterId) ?? [];
    const fromDb = await withRows(
      await Joins.findMany<KlassSkill>(db, { join: "klass_skills", fromIds: [fighterId] }),
      "skillId",
      "skillsInRule",
      async (ids) => await Entities.findMany<Skill>(db, { entityType: "skills", ids }),
    );

    expect(fromCache.length).toBe(fromDb.length);
    // A class's skill has no `id` column — sort by skillId (composite key).
    const sortBySkillId = <T extends { skillId: string }>(xs: T[]) =>
      [...xs].sort((a, b) => a.skillId.localeCompare(b.skillId));
    const mapRow = (r: (typeof fromDb)[number]) => ({
      klassId: r.klassId,
      skillId: r.skillId,
      skillsInRuleId: r.skillsInRule.id,
      skillsInRuleName: r.skillsInRule.name,
    });
    expect(sortBySkillId(fromCache).map(mapRow)).toEqual(sortBySkillId(fromDb).map(mapRow));
  });

  test("entityIdsByProperty indexes every (entityType, type, value) triple", () => {
    // The reverse index must contain every composed property row — verify by
    // reconstructing the expected mapping from the per-entity index and
    // comparing to the pre-built reverse Map.
    const expected = new Map<string, Set<string>>();
    for (const props of rulesetData.propertiesByEntity.values()) {
      for (const p of props) {
        const key = `${p.entityType}:${p.type}:${p.value}`;
        const set = expected.get(key) ?? new Set<string>();
        set.add(p.entityId);
        expected.set(key, set);
      }
    }

    for (const [key, expectedIds] of expected.entries()) {
      const actual = new Set(rulesetData.entityIdsByProperty.get(key) ?? []);
      expect(actual).toEqual(expectedIds);
    }

    // And: looking up a known D&D 3.5 triple returns the expected powers.
    const evocation = rulesetData.entityIdsByProperty.get(`powers:${SPELL_SCHOOL}:Evocation`) ?? [];
    expect(evocation.length).toBeGreaterThan(0);
    for (const id of evocation) expect(Dnd35View.of(rulesetData).powersById.has(id)).toBe(true);
  });

  test("propertiesByEntity + propertiesByEntityType cover the same row set", () => {
    // Both indices are built from the same composed rows; total counts must match.
    const totalByEntity = [...rulesetData.propertiesByEntity.values()].reduce((sum, rows) => sum + rows.length, 0);
    const totalByEntityType = [...rulesetData.propertiesByEntityType.values()].reduce(
      (sum, rows) => sum + rows.length,
      0,
    );
    expect(totalByEntity).toBe(totalByEntityType);

    // Every row reachable via entityType is also reachable via entityId.
    for (const rows of rulesetData.propertiesByEntityType.values()) {
      for (const p of rows) {
        const bucket = rulesetData.propertiesByEntity.get(p.entityId);
        expect(bucket).toBeDefined();
        expect(bucket!.some((row) => row.id === p.id)).toBe(true);
      }
    }
  });

  test("featsById / powersById / skillsById resolve every composed row", () => {
    for (const feat of Dnd35View.of(rulesetData).feats)
      expect(Dnd35View.of(rulesetData).featsById.get(feat.id)).toBe(feat);

    for (const power of Dnd35View.of(rulesetData).powers)
      expect(Dnd35View.of(rulesetData).powersById.get(power.id)).toBe(power);

    for (const skill of Dnd35View.of(rulesetData).skills)
      expect(Dnd35View.of(rulesetData).skillsById.get(skill.id)).toBe(skill);
  });
});
