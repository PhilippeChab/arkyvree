import { describe, expect, test } from "bun:test";

import { PlansAptitudeSlots } from "@/engine/rulesets/dnd3.5/levelUp/concerns/PlansAptitudeSlots.ts";
import type LevelUpBase from "@/engine/rulesets/dnd3.5/levelUp/LevelUpBase.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/** A planned level's slot deltas, as the planner sums a level's modifiers into them. */
interface Deltas {
  allKnown: Set<string>;
  feats: Record<string, number>;
  spells: Record<string, Record<string, number>>;
}

/** The planner's step that sums a level's modifiers, over a spell pool (`wiz`, its aptitude `A`) alone. */
interface Summing {
  addModifierDeltas(deltas: Deltas, modifiers: Modifier[], featSlots: object, spellSlots: object): void;
}

/** What a planned level's modifiers on the pool's 1st-level spells (`[operator, value]`, in order) sum to. */
function deltasOf(modifiers: [string, string][]) {
  const Planner = PlansAptitudeSlots(class {} as unknown as Constructor<LevelUpBase<DetailedCharacter>>);
  const planner = Object.create(Planner.prototype, {
    dnd35: { value: { aptitudeIdBySlug: new Map([["wiz", "A"]]) } },
  }) as Summing;
  const deltas: Deltas = { allKnown: new Set(), feats: {}, spells: {} };
  const rows = modifiers.map(([operator, value]) => ({ operator, value, target: "aptitudes.wiz.1.allowed" }));
  planner.addModifierDeltas(deltas, rows as Modifier[], {}, { A: [] });
  return { allKnown: deltas.allKnown.has("A:1"), sum: deltas.spells.A["1"] };
}

describe("A planned level's spell slots", () => {
  test("make a spell level all known by its set alone, whatever its adds sum to, before it or after", () => {
    expect(deltasOf([["set", "-1"]])).toEqual({ allKnown: true, sum: 0 });
    expect(
      deltasOf([
        ["add", "3"],
        ["set", "-1"],
      ]),
    ).toEqual({ allKnown: true, sum: 3 });
    expect(
      deltasOf([
        ["set", "-1"],
        ["add", "-5"],
      ]),
    ).toEqual({ allKnown: true, sum: -5 });
    // An add that takes a level's count down (a progression's column dropping by one) is a count, never all known
    expect(deltasOf([["add", "-1"]])).toEqual({ allKnown: false, sum: -1 });
    expect(
      deltasOf([
        ["add", "1"],
        ["add", "-2"],
      ]),
    ).toEqual({ allKnown: false, sum: -1 });
    expect(deltasOf([["add", "999"]])).toEqual({ allKnown: false, sum: 999 });
  });
});
