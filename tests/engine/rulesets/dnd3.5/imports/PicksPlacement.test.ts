import { describe, expect, test } from "bun:test";

import PicksPlacement from "@/engine/rulesets/dnd3.5/imports/PicksPlacement.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** A level's gains of 4 points, at which `skillId` is a class skill of the character's and of the level's class or not. */
function gainsOf(skillId: string, classSkill: boolean) {
  return {
    classSkillIds: new Set(classSkill ? [skillId] : []),
    featRoom: new Map<string, number>(),
    skillPoints: 4,
    skills: new Map([[skillId, { currentRank: 0, isClassSkill: classSkill }]]),
  };
}

/** A placement of a skill's ranks bought as a fighter, in the seeded ruleset's view. */
async function placementOf(ranks: number) {
  const { rulesetId } = await getSeedCtx();
  const data = await RulesetViews.getData((await Rulesets.findOne(db, { id: rulesetId }))!);
  const skill = data.skills.find(({ name }) => name === "Climb")!;
  const line = { number: 1, text: "SKILL:Climb" };
  const matched = { className: "Fighter", line, name: skill.name, ranks, skillId: skill.id };
  return { placement: new PicksPlacement(data, [], [matched]), skillId: skill.id };
}

describe("PicksPlacement", () => {
  test("spends whole points: a class skill's half rank waits, and is left for the report", async () => {
    const { placement, skillId } = await placementOf(1.5);
    const spent = placement.placeSkills({
      characterLevel: 1,
      className: "Fighter",
      gains: gainsOf(skillId, true),
      lastClassLevel: 1,
    });
    expect(spent).toEqual({ [skillId]: 1 });
    expect(placement.leftSkills().map(({ ranks }) => ranks)).toEqual([0.5]);
  });

  test("buys a cross-class half rank with a point", async () => {
    const { placement, skillId } = await placementOf(1.5);
    const spent = placement.placeSkills({
      characterLevel: 1,
      className: "Fighter",
      gains: gainsOf(skillId, false),
      lastClassLevel: 1,
    });
    expect(spent).toEqual({ [skillId]: 3 });
    expect(placement.leftSkills()).toEqual([]);
  });

  test("leaves the ranks of another class's levels for them", async () => {
    const { placement, skillId } = await placementOf(2);
    expect(
      placement.placeSkills({
        characterLevel: 1,
        className: "Rogue",
        gains: gainsOf(skillId, true),
        lastClassLevel: 1,
      }),
    ).toEqual({});
  });
});
