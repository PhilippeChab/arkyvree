import { describe, expect, test } from "bun:test";

import BondedRaceData from "@/engine/rulesets/dnd3.5/model/bonded/BondedRaceData.ts";
import BondedScaling from "@/engine/rulesets/dnd3.5/model/bonded/BondedScaling.ts";

const BONDED_RACES = [
  ...["Bat", "Cat", "Hawk", "Lizard", "Owl", "Rat", "Raven", "Toad", "Viper", "Weasel"],
  ...["Badger", "Camel", "Dire Rat", "Dog", "Riding Dog", "Eagle", "Horse, Light", "Horse, Heavy", "Pony"],
  ...["Snake, Small Viper", "Snake, Medium Viper", "Wolf", "Heavy Warhorse", "Warpony"],
];

describe("scaleFeats", () => {
  test("counts the feats a creature's hit dice give it, not its bonus ones", () => {
    // A badger's Agile, beside its bonus Track and Weapon Finesse: at 4 hit dice, a second feat
    const badger = BondedRaceData.getStats("Badger")!;
    expect(badger.bonusFeats).toEqual(["Track", "Weapon Finesse"]);
    expect(BondedScaling.scaleFeats(badger, 1)).toEqual(["Agile"]);
    expect(BondedScaling.scaleFeats(badger, 4)).toEqual(["Agile", "Alertness"]);
  });

  test("gives a feat at the first hit die and one more every third", () => {
    // A wolf's Weapon Focus (bite), then its priority's Alertness, Improved Initiative, Combat Reflexes
    const wolf = BondedRaceData.getStats("Wolf")!;
    expect([2, 3, 6, 9].map((totalHD) => BondedScaling.scaleFeats(wolf, totalHD).length)).toEqual([1, 2, 3, 4]);
  });

  // The rule a stat block's own feats follow too: as many as its hit dice give, no more and none from its priority
  test.each(BONDED_RACES)("gives the %s its stat block's feats at its own hit dice", (race) => {
    const stats = BondedRaceData.getStats(race)!;
    expect(BondedScaling.scaleFeats(stats, stats.baseHD)).toEqual(stats.baseFeats ?? []);
  });
});

describe("scaleSkillRanks", () => {
  test("gives none at the stat block's hit dice", () => {
    const owl = BondedRaceData.getStats("Owl")!;
    expect(BondedScaling.scaleSkillRanks(owl, owl.baseHD)).toEqual({});
  });

  test("gives a rank per added hit die, to each priority skill in turn", () => {
    // The owl's priority: Move Silently, Listen, Spot
    expect(BondedScaling.scaleSkillRanks(BondedRaceData.getStats("Owl")!, 1 + 4)).toEqual({
      "Move Silently": 2,
      Listen: 1,
      Spot: 1,
    });
  });

  // A stat block has at most its hit dice + 3 ranks in a skill: a rank per added hit die keeps it under the maximum
  test.each(BONDED_RACES)("never gives the %s more ranks in a skill than it has added hit dice", (race) => {
    const stats = BondedRaceData.getStats(race)!;
    for (let totalHD = stats.baseHD; totalHD <= 20; totalHD++) {
      const ranks = Object.values(BondedScaling.scaleSkillRanks(stats, totalHD));
      expect(ranks.reduce((sum, rank) => sum + rank, 0)).toBe(totalHD - stats.baseHD);
      expect(ranks.every((rank) => rank <= totalHD - stats.baseHD)).toBe(true);
    }
  });
});
