import { describe, expect, test } from "bun:test";

import PicksPlacement from "@/engine/rulesets/dnd3.5/imports/PicksPlacement.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** A level's gains of 4 points, at which `skillId` is a class skill of the character's and of the level's class or not. */
function gainsOf(skillId: string, classSkill: boolean) {
  return {
    classSkillIds: new Set(classSkill ? [skillId] : []),
    featRoom: new Map<string, number>(),
    spellRoom: new Map<string, Map<number, number>>(),
    skillPoints: 4,
    skills: new Map([[skillId, { currentRank: 0, isClassSkill: classSkill }]]),
  };
}

/** The seeded ruleset's view. */
async function getSeededData() {
  const { rulesetId } = await getSeedCtx();
  return await RulesetViews.getData((await Rulesets.findOne(db, { id: rulesetId }))!);
}

/** A placement of a skill's ranks bought as a fighter, in the seeded ruleset's view. */
async function placementOf(ranks: number) {
  const data = await getSeededData();
  const skill = Dnd35View.of(data).skills.find(({ name }) => name === "Climb")!;
  const line = { number: 1, text: "SKILL:Climb" };
  const matched = { className: "Fighter", line, name: skill.name, ranks, skillId: skill.id };
  return { placement: new PicksPlacement(data, [], [matched], []), skillId: skill.id };
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

  test("gives two of the file's lines naming one skill (two crafts of one Craft) its room at a level once", async () => {
    const { skillId } = await placementOf(0);
    const line = (number: number) => ({ className: "Fighter", line: { number, text: "SKILL:Climb" }, name: "Climb" });
    const twins = new PicksPlacement(
      await getSeededData(),
      [],
      [
        { ...line(1), ranks: 3, skillId },
        { ...line(2), ranks: 3, skillId },
      ],
      [],
    );
    const spent = twins.placeSkills({
      characterLevel: 1,
      className: "Fighter",
      gains: { ...gainsOf(skillId, true), skillPoints: 8 },
      lastClassLevel: 1,
    });
    expect(spent).toEqual({ [skillId]: 4 });
    expect(twins.leftSkills().reduce((total, { ranks }) => total + ranks, 0)).toBe(2);
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

  test("places a spell its class's list has room for at its spell level, never one known already there", async () => {
    const data = await getSeededData();
    const dataView = Dnd35View.of(data);
    const sorcerer = dataView.aptitudes.find(({ name }) => name === "Sorcerer Spells")!;
    const spell = (name: string, level: number, number: number) => ({
      aptitudeId: sorcerer.id,
      level,
      line: { number, text: `SPELLNAME:${name}` },
      name,
      spellId: dataView.spells.find((spell) => spell.name === name)!.id,
    });
    const placement = new PicksPlacement(
      data,
      [],
      [],
      [spell("Light", 0, 1), spell("Magic Missile", 1, 2), spell("Scorching Ray", 2, 3), spell("Shield", 1, 4)],
    );
    const shield = dataView.spells.find((spell) => spell.name === "Shield")!.id;
    const placed = placement.placeSpells({
      held: [{ aptitudeId: sorcerer.id, id: shield }],
      room: new Map([
        [
          sorcerer.id,
          new Map([
            [0, 4],
            [1, 2],
          ]),
        ],
      ]),
    });
    expect(placed.map(({ spellId }) => dataView.spellsById.get(spellId)?.name)).toEqual(["Light", "Magic Missile"]);
    // No room at the 2nd level yet, and Shield known already: both left for a later level, or the report
    expect(placement.leftSpells().map(({ name }) => name)).toEqual(["Scorching Ray", "Shield"]);
  });
});
