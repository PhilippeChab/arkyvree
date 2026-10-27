import { describe, expect, test } from "bun:test";

import type { FieldsRequest } from "@/engine/core/module/index.ts";
import NewCharacters from "@/engine/rulesets/dnd3.5/characters/NewCharacters.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A ruleset's view as a new character's form reads it: its abilities, as their rows came in. */
const DATA = {
  abilities: ["Sanity", "Wisdom", "Force Points", "Strength"].map((name) => ({ id: `${name} id`, name })),
};

/** What a new character's fields (`fields`, as its form sends them) write, in the seeded ruleset's view. */
async function planOf(fields: FieldsRequest) {
  const { rulesetId } = await getSeedCtx();
  return await withRulesetScope(db, rulesetId, async (scope) => NewCharacters.planFields(scope, fields));
}

describe("A new 3.5 character's creation", () => {
  test("lists the ruleset's abilities in the order a sheet lists them: the books' first, then the others by name", () => {
    const { entities } = NewCharacters.describeCreation(DATA);
    expect(entities).toEqual(
      ["Strength", "Wisdom", "Force Points", "Sanity"].map((name) => ({ id: `${name} id`, name })),
    );
  });

  test("offers the SRD's methods, each run by its kind", () => {
    const { methods } = NewCharacters.describeCreation(DATA);
    expect(methods.map(({ id, kind }) => [id, kind])).toEqual([
      ["4d6-drop-lowest", "roll"],
      ["3d6-straight", "roll"],
      ["standard-array", "array"],
      ["point-buy", "pointBuy"],
    ]);
    expect(methods[0]).toMatchObject({ dice: { count: 4, keep: 3, sides: 6 } });
    expect(methods[2]).toMatchObject({ scores: [15, 14, 13, 12, 10, 8] });
  });

  test("buys a point buy's scores from 8 to 18 out of 25 points, each higher one costing more", () => {
    const pointBuy = NewCharacters.describeCreation(DATA).methods.find((method) => method.kind === "pointBuy");
    expect(pointBuy).toMatchObject({ budget: 25, max: 18, min: 8 });
    if (pointBuy?.kind !== "pointBuy") throw new Error("No point buy");
    const costs = Array.from({ length: 11 }, (_, index) => pointBuy.costs[8 + index]);
    expect(costs).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 10, 13, 16]);
  });

  test("bounds its scores, starts an unset one at 10, and gives each score the abilities' modifier", () => {
    const { modifiers, scores } = NewCharacters.describeCreation(DATA);
    expect(scores).toEqual({ max: 100, min: 1, start: 10 });
    expect(Object.keys(modifiers)).toHaveLength(100);
    expect([1, 8, 9, 10, 11, 12, 18, 19, 100].map((score) => modifiers[score])).toEqual([
      -5, -1, -1, 0, 0, 1, 4, 4, 45,
    ]);
    for (let score = scores.min; score <= scores.max; score++)
      expect(modifiers[score]).toBe(AbilityRules.computeModifier(score));
  });

  test("writes a new character's fields as their values, by their stored fields, an empty or a missing optional one left out", async () => {
    expect(
      await planOf({
        [CHARACTER_XP]: 0,
        [CHARACTER_ALIGNMENT]: "Lawful Good",
        [CHARACTER_GENDER]: "Female",
        [CHARACTER_AGE]: null,
        [CHARACTER_HEIGHT]: "",
        [CHARACTER_WEIGHT]: "60",
        [CHARACTER_DEITY]: null,
        description: "Tall",
      }),
    ).toEqual({
      fields: {
        [CHARACTER_ALIGNMENT]: "Lawful Good",
        [CHARACTER_GENDER]: "Female",
        [CHARACTER_XP]: 0,
        [CHARACTER_WEIGHT]: "60",
      },
      own: { description: "Tall" },
    });
    const fields = {
      [CHARACTER_XP]: 300,
      [CHARACTER_ALIGNMENT]: "True Neutral",
      [CHARACTER_GENDER]: "Male",
      [CHARACTER_AGE]: 30,
    };
    expect(await planOf(fields)).toEqual({ fields, own: {} });
  });

  test("refuses a field it always holds missing or unset, a value its field doesn't take, or a field it hasn't, under its key", async () => {
    const fields = { [CHARACTER_XP]: 0, [CHARACTER_ALIGNMENT]: "Lawful Good", [CHARACTER_GENDER]: "Female" };
    const { [CHARACTER_XP]: _xp, ...withoutXp } = fields;
    const refused: [string, FieldsRequest][] = [
      [CHARACTER_XP, withoutXp],
      [CHARACTER_ALIGNMENT, { ...fields, [CHARACTER_ALIGNMENT]: "" }],
      [CHARACTER_GENDER, { ...fields, [CHARACTER_GENDER]: null }],
      [CHARACTER_XP, { ...fields, [CHARACTER_XP]: -1 }],
      [CHARACTER_AGE, { ...fields, [CHARACTER_AGE]: 0 }],
      [CHARACTER_ALIGNMENT, { ...fields, [CHARACTER_ALIGNMENT]: "Lawful Awesome" }],
      ["strength", { ...fields, strength: 18 }],
      ["xp", { ...fields, xp: 0 }],
    ];
    for (const [field, sent] of refused)
      expect(planOf(sent)).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${field}` }] });
    expect(planOf({})).rejects.toMatchObject({
      issues: [
        { category: `fields.${CHARACTER_ALIGNMENT}`, message: "Alignment is required" },
        { category: `fields.${CHARACTER_XP}`, message: "Experience Points is required" },
        { category: `fields.${CHARACTER_GENDER}`, message: "Gender is required" },
      ],
    });
  });

  test("lays out its form's fields as they're declared, by their stored fields", () => {
    expect(NewCharacters.describeField("xp")).toEqual({
      key: CHARACTER_XP,
      kind: "number",
      label: "Experience Points",
      min: 0,
      required: "Experience Points is required",
      start: 0,
    });
    expect(NewCharacters.describeField("alignment", { narrows: true })).toMatchObject({
      key: CHARACTER_ALIGNMENT,
      kind: "select",
      label: "Alignment",
      narrows: true,
      required: "Alignment is required",
    });
    expect(NewCharacters.describeField("age", { stepped: true })).toEqual({
      key: CHARACTER_AGE,
      kind: "number",
      label: "Age",
      min: 1,
      stepped: true,
    });
    expect(NewCharacters.describeField("height")).toEqual({
      key: CHARACTER_HEIGHT,
      kind: "text",
      label: "Height",
      placeholder: "e.g., 5 feet 8 inches",
    });
    expect(NewCharacters.describeField("deity")).toEqual({ key: CHARACTER_DEITY, kind: "text", label: "Deity" });
  });
});
