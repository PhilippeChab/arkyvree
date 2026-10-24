import { describe, expect, test } from "bun:test";

import {
  fitPlan,
  fitPoints,
  keepFitted,
  withoutPick,
  withPick,
} from "@/client/src/pages/characters/details/components/levelUp/fitPicks.ts";

/** A perk or a charm picked. */
function pick(id: string) {
  return { id, name: id };
}

describe("keeping the picks a step says fit", () => {
  test("keeps the form's own picks the step keeps, in their order, and drops the others", () => {
    const perks = { general: [pick("Dodge"), pick("Mobility")], fighter: [pick("Cleave")] };
    expect(keepFitted(perks, { general: ["Dodge"] })).toEqual({ general: [pick("Dodge")], fighter: [] });
  });

  test("keeps a pick given twice as often as the step keeps it: once, or twice for a stackable perk", () => {
    const twice = { general: [pick("Toughness"), pick("Toughness")] };
    expect(keepFitted({ general: [pick("Dodge"), pick("Dodge")] }, { general: ["Dodge"] })).toEqual({
      general: [pick("Dodge")],
    });
    expect(keepFitted(twice, { general: ["Toughness", "Toughness"] })).toBe(twice);
  });

  test("keeps picks that fit as the same object, and every pick until the step answers for them", () => {
    const perks = { general: [pick("Dodge")] };
    expect(keepFitted(perks, { general: ["Dodge"] })).toBe(perks);
    expect(keepFitted(perks, undefined)).toBe(perks);
  });

  test("adds a pick last in its pool, and removes one", () => {
    expect(withPick({ bard: [pick("a")] }, "bard", pick("b"))).toEqual({ bard: [pick("a"), pick("b")] });
    expect(withPick({}, "bard", pick("a"))).toEqual({ bard: [pick("a")] });
    expect(withoutPick({ bard: [pick("a"), pick("b")] }, "bard", "a")).toEqual({ bard: [pick("b")] });
  });

  test("removes one pick of a stackable perk picked twice, keeping the other", () => {
    const general = [pick("Toughness"), pick("Dodge"), pick("Toughness")];
    expect(withoutPick({ general }, "general", "Toughness")).toEqual({ general: [pick("Toughness"), pick("Dodge")] });
    expect(withoutPick({ general }, "general", "Cleave")).toEqual({ general });
  });
});

describe("fitting a spend step's points", () => {
  // As the step answers them: Climb keeps up to 4 points, Swim 2 with Climb's spent
  const talents = [
    { id: "climb", valuesByPoints: [0, 1, 2, 3, 4] },
    { id: "swim", valuesByPoints: [0, 1, 2] },
  ];

  test("caps a row at the most points its step answer keeps, in the order given", () => {
    expect(fitPoints({ climb: 5, swim: 3 }, talents)).toEqual({ climb: 4, swim: 2 });
  });

  test("drops a row the step doesn't list, and points that buy nothing", () => {
    expect(fitPoints({ climb: 2, gone: 3, swim: 0 }, talents)).toEqual({ climb: 2 });
  });

  test("keeps points that fit, and every point while the step loads", () => {
    const allocations = { climb: 2 };
    expect(fitPoints(allocations, talents)).toBe(allocations);
    expect(fitPoints(allocations, undefined)).toBe(allocations);
  });
});

describe("fitting a plan's form", () => {
  // A pick step and a spend step, as a ruleset lists them, and the plan's answer for them
  const steps = [
    { name: "perks", label: "Perks", mechanic: "pick", words: { grantNote: "", optional: "optional" } },
    {
      name: "talents",
      label: "Talents",
      mechanic: "spend",
      words: {
        budget: "Points",
        currency: { many: "points", one: "point" },
        favored: "Favored",
        favoredShort: "Fav",
        review: "Spent",
        unit: { many: "Ranks", one: "Rank" },
      },
    },
  ] as Parameters<typeof fitPlan>[0];
  const answer = {
    advancements: [],
    steps: {
      perks: { mechanic: "pick", fitted: { general: ["Dodge"] } },
      talents: { mechanic: "spend", rows: [{ id: "climb", valuesByPoints: [0, 1, 2] }] },
    },
  } as unknown as Parameters<typeof fitPlan>[2];

  test("fits each step's picks and points by its mechanic, keyed by its name", () => {
    const form = {
      choices: {},
      picks: { perks: { general: [pick("Dodge"), pick("Mobility")] } },
      points: { talents: { climb: 5 } },
      values: {},
    };
    expect(fitPlan(steps, form, answer)).toEqual({
      ...form,
      picks: { perks: { general: [pick("Dodge")] } },
      points: { talents: { climb: 2 } },
    });
  });

  test("keeps the same form when everything fits, and until the plan answers", () => {
    const form = { choices: {}, picks: { perks: { general: [pick("Dodge")] } }, points: {}, values: {} };
    expect(fitPlan(steps, form, answer)).toBe(form);
    expect(fitPlan(steps, { ...form, points: { talents: { climb: 9 } } }, undefined).points.talents.climb).toBe(9);
  });
});
