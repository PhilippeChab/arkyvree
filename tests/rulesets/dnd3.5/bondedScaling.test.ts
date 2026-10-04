import { describe, expect, test } from "bun:test";

import { getBondedRaceStats } from "@/server/rulesets/dnd3.5/bondedRaceData.ts";
import { scaleSkillRanks } from "@/server/rulesets/dnd3.5/bondedScaling.ts";

const BONDED_RACES = [
  ...["Bat", "Cat", "Hawk", "Lizard", "Owl", "Rat", "Raven", "Toad", "Viper", "Weasel"],
  ...["Badger", "Camel", "Dire Rat", "Dog", "Riding Dog", "Eagle", "Horse, Light", "Horse, Heavy", "Pony"],
  ...["Snake, Small Viper", "Snake, Medium Viper", "Wolf", "Heavy Warhorse", "Warpony"],
];

describe("scaleSkillRanks", () => {
  test("gives none at the stat block's hit dice", () => {
    const owl = getBondedRaceStats("Owl")!;
    expect(scaleSkillRanks(owl, owl.baseHD)).toEqual({});
  });

  test("gives a rank per added hit die, to each priority skill in turn", () => {
    // The owl's priority: Move Silently, Listen, Spot
    expect(scaleSkillRanks(getBondedRaceStats("Owl")!, 1 + 4)).toEqual({ "Move Silently": 2, Listen: 1, Spot: 1 });
  });

  // A stat block has at most its hit dice + 3 ranks in a skill: a rank per added hit die keeps it under the maximum
  test.each(BONDED_RACES)("never gives the %s more ranks in a skill than it has added hit dice", (race) => {
    const stats = getBondedRaceStats(race)!;
    for (let totalHD = stats.baseHD; totalHD <= 20; totalHD++) {
      const ranks = Object.values(scaleSkillRanks(stats, totalHD));
      expect(ranks.reduce((sum, rank) => sum + rank, 0)).toBe(totalHD - stats.baseHD);
      expect(ranks.every((rank) => rank <= totalHD - stats.baseHD)).toBe(true);
    }
  });
});
