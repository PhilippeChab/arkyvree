import { describe, expect, test } from "bun:test";

import { getOrBuildCowData, getOrFetchRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { Modifiers, Rulesets } from "@/server/repositories/index.ts";
import { computePerLevelAptitudeSlots } from "@/server/services/characters/levels/dnd3.5/distribution.ts";
import { findKlassLevel, getSeedCtx, invalidateSeededRuleset } from "@/tests/helpers.ts";

/** The seeded cleric's first two levels, the second adding a 1st-level spell her first made all known. */
async function clericWithLaterAdd() {
  const ctx = await getSeedCtx();
  const cleric = ctx.klassMap.pc["Cleric"];
  const levels = [(await findKlassLevel(cleric, 1))!.id, (await findKlassLevel(cleric, 2))!.id];
  await Modifiers.create(db, {
    sourceId: levels[1],
    sourceType: "klass_levels",
    target: "aptitudes.clericspells.1.allowed",
    operator: "add",
    value: "1",
    valueType: "number",
  });
  invalidateSeededRuleset(ctx.rulesetId);
  const ruleset = (await Rulesets.findOne(db, { id: ctx.rulesetId }))!;
  const rulesetData = await getOrFetchRulesetData(ruleset.id, await getOrBuildCowData(ruleset));
  return { rulesetData, levels, clericSpells: rulesetData.aptitudeIdBySlug.get("clericspells")! };
}

describe("computePerLevelAptitudeSlots", () => {
  test("gives an all-known spell level no slot from a later add, planned or already known", async () => {
    const { rulesetData, levels, clericSpells } = await clericWithLaterAdd();
    // Both levels planned: the first makes the 1st-level spells all known, the second's add gives none
    const planned = computePerLevelAptitudeSlots(rulesetData, levels, [[], []], [], [clericSpells], 0, {});
    const [first, second] = planned.perLevelPowerSlots[clericSpells];
    expect([first["1"], "1" in second]).toEqual([999, false]);
    // The first level the character's already: its 1st-level spells all known, the second planned
    const baseline: Record<string, { id: string; allowed: number; spent: number }> = {
      clericspells: { id: clericSpells, allowed: 0, spent: 0, ...{ "1": { allowed: -1, spent: 0 } } },
    };
    const next = computePerLevelAptitudeSlots(rulesetData, [levels[1]], [[]], [], [clericSpells], 1, baseline);
    expect("1" in next.perLevelPowerSlots[clericSpells][0]).toBe(false);
  });
});
