import { describe, expect, test } from "bun:test";

import BondedRaceData, { STAT_BLOCK_FEAT_SKILL_BONUSES } from "@/engine/rulesets/dnd3.5/bonded/BondedRaceData.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/skills/SkillsPaths.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { BONDED_KIND_SLUGS } from "@/shared/dnd3.5/bondedKinds.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("A stat block's feats", () => {
  test("add to its skills what the seeded SRD feats do, which is what its totals are set without", async () => {
    const ctx = await getSeedCtx();
    const races = BONDED_KIND_SLUGS.flatMap((kind) => Object.keys(ctx.raceMap[kind] ?? {}));
    expect(races.filter((race) => !BondedRaceData.getStats(race))).toEqual([]);
    const featNames = new Set(
      races.flatMap((race) => {
        const stats = BondedRaceData.getStats(race);
        return [...(stats?.bonusFeats ?? []), ...(stats?.baseFeats ?? [])];
      }),
    );
    const bonuses = await withRulesetScope(db, ctx.rulesetId, async ({ rulesetData }) => {
      const skillByMisc = new Map(rulesetData.skills.map((skill) => [SkillsPaths.misc(skill.name), skill.name]));
      const byFeat: Record<string, Record<string, number>> = {};
      for (const featName of featNames) {
        const feat = rulesetData.feats.find((f) => f.name === featName);
        for (const modifier of (feat && rulesetData.modifiersBySource.get(feat.id)) ?? []) {
          const skillName = skillByMisc.get(modifier.target);
          if (skillName && modifier.operator === "add") (byFeat[featName] ??= {})[skillName] = Number(modifier.value);
        }
      }
      return byFeat;
    });
    expect(bonuses).toEqual(STAT_BLOCK_FEAT_SKILL_BONUSES);
  });
});
