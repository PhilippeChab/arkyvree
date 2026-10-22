import { describe, expect, test } from "bun:test";

import type { RulesIssue } from "@/engine/core/RulesError.ts";
import Dnd35LevelUp from "@/engine/rulesets/dnd3.5/levelUp/Dnd35LevelUp.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

/** A pool's unspent slots, as the 3.5 rules flag them. */
function unspent(name: string): RulesIssue {
  return { amount: 1, category: "aptitudes", message: `${name}: 1 unspent slot(s) (0/1)`, subject: `${name}: unspent` };
}

/** A character as the attribution reads it: each pool's slots, by its name. */
function withPools(allowed: Record<string, number>) {
  const aptitudes = Object.fromEntries(
    Object.entries(allowed).map(([name, slots]) => [name, { allowed: slots, name }]),
  );
  return { components: { aptitudes: { getAptitudes: () => aptitudes } } } as unknown as DetailedCharacter;
}

describe("An edited level's issues", () => {
  test("are those of the pools it adds slots to, a leveled pool's levels too, not a pool its name begins", () => {
    const before = withPools({ "Bonus Feats": 0, "Bonus Feats (Wizard)": 1, Wizard: 0 });
    const withLevel = withPools({ "Bonus Feats": 1, "Bonus Feats (Wizard)": 1, Wizard: 1 });
    const issues = [unspent("Bonus Feats"), unspent("Bonus Feats (Wizard)"), unspent("Wizard (level 1)")];
    expect(new Dnd35LevelUp().findEditedLevelIssues(issues, before, withLevel)).toEqual([
      unspent("Bonus Feats"),
      unspent("Wizard (level 1)"),
    ]);
  });
});
