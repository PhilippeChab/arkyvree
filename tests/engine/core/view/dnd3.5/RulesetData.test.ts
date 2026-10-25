import { describe, expect, test } from "bun:test";

import type { StoredValues } from "@/engine/core/fields/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { composeView, type Kind, rawRows } from "@/tests/support/composedViews.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { writeStoredValues } from "@/tests/support/storedValues.ts";
import { makeSession } from "@/tests/support/users.ts";
import { ITEM_IS_TEMPLATE, ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

describe("An item's stored values", () => {
  test("are its template's of each field it doesn't set, then its own: its damage types replace all the template's", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const longsword = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) =>
      Dnd35View.of(rulesetData).items.find((item) => item.fields[ITEM_IS_TEMPLATE] && item.name === "Longsword"),
    );
    const [variant] = await Entities.createMany<Item>(db, "items", [
      {
        name: "Probe Blade",
        rulesetId: ruleset.id,
        fields: { [ITEM_TYPE]: "Weapon" },
        links: { madeFrom: longsword!.id },
      },
    ]);
    await writeStoredValues("items", variant.id, [
      ["DAMAGE_TYPE", "Piercing"],
      ["DAMAGE_TYPE", "Slashing"],
      ["WEAPON_BASE_DAMAGE", "1d10"],
    ]);
    // The cache read the ruleset before the variant was made
    RulesetViews.invalidate(ruleset.id);

    const values = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) => ({
      plain: rulesetData.inheritedValuesOf("items", longsword!),
      own: rulesetData.valuesOf(variant.id),
      variant: rulesetData.inheritedValuesOf("items", variant),
    }));
    const pairs = ({ fields }: StoredValues) =>
      Object.entries(fields).flatMap(([field, values]) => values.map((value) => `${field}=${value}`));
    expect(pairs(values.own).toSorted()).toEqual([
      "DAMAGE_TYPE=Piercing",
      "DAMAGE_TYPE=Slashing",
      "WEAPON_BASE_DAMAGE=1d10",
    ]);
    expect(pairs(values.variant)).toEqual([
      ...pairs(values.plain).filter((pair) => !pair.startsWith("DAMAGE_TYPE=") && !pair.startsWith("WEAPON_BASE_")),
      ...pairs(values.own),
    ]);
    expect(pairs(values.plain)).toContain("DAMAGE_TYPE=Slashing");
  });
});

describe("A ruleset's own stored values", () => {
  test("are each field's and link's of the nearest ruleset of its chain that holds it, the fork's whatever its value", async () => {
    // Abilities whose ids sort first and last, before and after the source's: the nearest ruleset's, whatever its value
    const abilityIds = Object.values((await getSeedCtx()).abilityMap).toSorted();
    for (const value of [abilityIds[0], abilityIds.at(-1)!]) {
      const fork = await createSeededTestRuleset(makeSession().userId);
      // A fork holds a copy of its source's as it's made: without it, it reads its chain's
      await writeStoredValues("rulesets", fork.id, [], { skillPointAbility: null });
      RulesetViews.invalidate(fork.id);
      const read = () =>
        withRulesetScope(db, fork.id, async ({ rulesetData }) => {
          const { links } = rulesetData.rulesetValuesOf(fork.id);
          const own = rulesetData.valuesOf(fork.id).links;
          return Object.entries(links).map(([role, toId]) => [own[role] === toId ? "fork" : "source", role, toId]);
        });
      expect(await read()).toEqual([["source", "skillPointAbility", expect.any(String)]]);

      await writeStoredValues("rulesets", fork.id, [], { skillPointAbility: value });
      RulesetViews.invalidate(fork.id);
      expect(await read()).toEqual([["fork", "skillPointAbility", value]]);
    }
  });
});

describe("A ruleset's view's reads", () => {
  const view = composeView(
    [rawRows({ owners: [{ id: "o1-copy" }] }), rawRows({ owners: [{ id: "o1" }, { id: "o2" }] })],
    {
      overrides: [["o1", "o1-copy"]],
    },
  );

  test("find a kind's entity by a stored id, as resolving by id, and leave it unresolved as stored", () => {
    expect(view.byId("owners" as Kind).get("o1")).toEqual({ id: "o1-copy" } as never);
    expect(view.storedById("owners" as Kind).get("o1")).toBeUndefined();
    expect(view.storedById("owners" as Kind).get("o1-copy")).toEqual({ id: "o1-copy" } as never);
    expect(view.find("owners" as Kind, "missing")).toBeUndefined();
  });

  test("answer a kind the module declares none of with no rows, and an entity that holds no links with none", () => {
    expect(view.rows("nothing" as Kind)).toEqual([]);
    expect(view.linksOf("o2")).toEqual([]);
    expect(view.linksOf("missing", "any")).toEqual([]);
  });

  test("name a type by its module's label, or by itself for one it labels none of", () => {
    expect(view.labelOf("owners")).toBe("Owner");
    expect(view.labelOf("owned")).toBe("owned");
  });

  test("keep what a module derives of the view, built once", () => {
    class Derived {
      constructor(readonly data: RulesetData) {}
    }
    expect(view.derive(Derived)).toBe(view.derive(Derived));
    expect(view.derive(Derived).data).toBe(view);
  });
});
