import { describe, expect, test } from "bun:test";

import type { RulesIssue } from "@/engine/core/RulesError.ts";
import Dnd35LevelUp from "@/engine/rulesets/dnd3.5/levelUp/Dnd35LevelUp.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

/** A pool's unspent slots, as the 3.5 rules flag them. */
function unspent(name: string): RulesIssue {
  return { amount: 1, category: "aptitudes", message: `${name}: 1 unspent slot(s) (0/1)`, subject: `${name}: unspent` };
}

/**
 * A character as the attribution reads it: each pool's slots by its name, a spell list's by spell level (its own count
 * none), as its tables give them.
 */
function withPools(pools: Record<string, number | Record<number, number>>) {
  const aptitudes = Object.fromEntries(
    Object.entries(pools).map(([name, slots]) => [
      name,
      typeof slots === "number"
        ? { allowed: slots, name }
        : {
            allowed: 0,
            name,
            ...Object.fromEntries(Object.entries(slots).map(([level, n]) => [level, { allowed: n }])),
          },
    ]),
  );
  const isLeveledAptitude = (key: string) => typeof pools[key] !== "number";
  return {
    components: { aptitudes: { getAptitudes: () => aptitudes, isLeveledAptitude } },
  } as unknown as DetailedCharacter;
}

describe("An edited level's issues", () => {
  test("are those of the pools it adds slots to, a spell list's at each level, not a pool its name begins", () => {
    const before = withPools({ "Bonus Feats": 0, "Bonus Feats (Wizard)": 1, "Wizard Spells": { 0: 3, 1: 0 } });
    const withLevel = withPools({ "Bonus Feats": 1, "Bonus Feats (Wizard)": 1, "Wizard Spells": { 0: 3, 1: 2 } });
    const issues = [
      unspent("Bonus Feats"),
      unspent("Bonus Feats (Wizard)"),
      unspent("Wizard Spells (level 0)"),
      unspent("Wizard Spells (level 1)"),
    ];
    expect(new Dnd35LevelUp().findEditedLevelIssues(issues, before, withLevel)).toEqual([
      unspent("Bonus Feats"),
      unspent("Wizard Spells (level 1)"),
    ]);
  });
});
