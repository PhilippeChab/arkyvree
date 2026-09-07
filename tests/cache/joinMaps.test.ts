/**
 * Parity tests: composed cache join maps must return the same rows and shape
 * as the repository queries they replaced. Guards against silent drift if
 * someone adds a filter/column to a repo method and forgets to mirror it in
 * the cache compose step.
 */

import { db } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import {
  KlassLevelFeats,
  KlassLevelPowers,
  KlassSkills,
  PowersAptitudes,
  Rulesets,
} from "@/server/repositories/index.ts";
import {
  getOrBuildCowData,
  getOrFetchRulesetData,
  type CachedRulesetData,
} from "@/server/cache/rulesetCache.ts";
import { beforeAll, describe, expect, test } from "bun:test";

describe("cache join-maps — parity with repository queries", () => {
  let ctx: SeedContext;
  let rulesetData: CachedRulesetData;

  beforeAll(async () => {
    ctx = await getSeedContext(db);
    const ruleset = await Rulesets.findOne(db, { id: ctx.rulesetId });
    if (!ruleset) throw new Error("seed ruleset missing");
    const cowData = await getOrBuildCowData(ruleset);
    rulesetData = await getOrFetchRulesetData(ctx.rulesetId, cowData);
  });

  const sortById = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));

  test("klassLevelFeatsWithFeatsByKlassLevel matches KlassLevelFeats.findManyWithFeats", async () => {
    const fighterId = ctx.klassMap.pc["Fighter"];
    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${fighterId}:1`);
    expect(klassLevel).toBeDefined();

    const fromCache = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel!.id) ?? [];
    const fromDb = await KlassLevelFeats.findManyWithFeats(db, {
      klassLevelId: klassLevel!.id,
    });

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

  test("klassLevelPowersWithPowersByKlassLevel matches KlassLevelPowers.findManyWithPowers", async () => {
    // Pick a class level that's likely to have auto-granted powers — Wizard L1.
    const klassId = ctx.klassMap.pc["Wizard"];
    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:1`);
    if (!klassLevel) return; // seed doesn't have Wizard at this level — skip

    const fromCache = rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];
    const fromDb = await KlassLevelPowers.findManyWithPowers(db, {
      klassLevelId: klassLevel.id,
    });

    expect(fromCache.length).toBe(fromDb.length);
    // klass_level_powers has no `id` column — sort by (powerId, aptitudeId).
    const sortByPowerApt = <T extends { powerId: string; aptitudeId: string }>(xs: T[]) =>
      [...xs].sort((a, b) =>
        a.powerId.localeCompare(b.powerId) || a.aptitudeId.localeCompare(b.aptitudeId),
      );
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

  test("klassSkillsWithSkillsByKlass matches KlassSkills.findManyWithSkills", async () => {
    const fighterId = ctx.klassMap.pc["Fighter"];

    const fromCache = rulesetData.klassSkillsWithSkillsByKlass.get(fighterId) ?? [];
    const fromDb = await KlassSkills.findManyWithSkills(db, { klassId: fighterId });

    expect(fromCache.length).toBe(fromDb.length);
    // klassSkillsInRules has no `id` column — sort by skillId (composite key).
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

  test("aptitudeIdsByHavingPowers matches PowersAptitudes.findDistinctAptitudeIds", async () => {
    // Seed ruleset is a base (no ancestors, no siblings), so every composed
    // aptitude is a DB-visible aptitude — the composed view and the raw DB
    // answer should be identical sets. For forks with extensions, sibling
    // aptitude exclusion would matter; that case is exercised by
    // tests/cache/aptitudeDedup.test.ts.
    const allAptitudeIds = rulesetData.aptitudes.map((a) => a.id);
    const fromDb = new Set(
      await PowersAptitudes.findDistinctAptitudeIds(db, { aptitudeIds: allAptitudeIds }),
    );
    expect(rulesetData.aptitudeIdsByHavingPowers).toEqual(fromDb);
  });

  test("entityIdsByPropertyLookup indexes every (entityType, type, value) triple", () => {
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
      const actual = new Set(rulesetData.entityIdsByPropertyLookup.get(key) ?? []);
      expect(actual).toEqual(expectedIds);
    }

    // And: looking up a known D&D 3.5 triple returns the expected powers.
    const evocation = rulesetData.entityIdsByPropertyLookup.get("powers:SPELL_SCHOOL:Evocation") ?? [];
    expect(evocation.length).toBeGreaterThan(0);
    for (const id of evocation) {
      expect(rulesetData.powersById.has(id)).toBe(true);
    }
  });

  test("propertiesByEntity + propertiesByEntityType cover the same row set", () => {
    // Both indices are built from the same composed rows; total counts must match.
    const totalByEntity = [...rulesetData.propertiesByEntity.values()]
      .reduce((sum, rows) => sum + rows.length, 0);
    const totalByEntityType = [...rulesetData.propertiesByEntityType.values()]
      .reduce((sum, rows) => sum + rows.length, 0);
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
    for (const feat of rulesetData.feats) {
      expect(rulesetData.featsById.get(feat.id)).toBe(feat);
    }
    for (const power of rulesetData.powers) {
      expect(rulesetData.powersById.get(power.id)).toBe(power);
    }
    for (const skill of rulesetData.skills) {
      expect(rulesetData.skillsById.get(skill.id)).toBe(skill);
    }
  });
});
