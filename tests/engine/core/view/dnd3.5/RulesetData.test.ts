import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import type { OwnerFields } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { composeView, type Kind, rawRows } from "@/tests/support/composedViews.ts";
import { findFormValues, writeFieldValues } from "@/tests/support/ownerValues.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  DAMAGE_TYPE,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_TYPE,
  ITEM_WEIGHT,
  WEAPON_BASE_DAMAGE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("An item's fields", () => {
  test("are its template's of each field it reads off it and doesn't hold, then its own: its damage types replace all the template's", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const longsword = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) =>
      Dnd35View.of(rulesetData).items.find((item) => item.fields[ITEM_IS_TEMPLATE] && item.name === "Longsword"),
    );
    const [variant] = await Entities.createMany<Item>(db, "items", [
      {
        name: "Probe Blade",
        rulesetId: ruleset.id,
        fields: {
          [ITEM_TYPE]: "Weapon",
          [DAMAGE_TYPE]: ["Piercing", "Slashing"],
          [WEAPON_BASE_DAMAGE]: "1d10",
        },
        links: { madeFrom: longsword!.id },
      },
    ]);
    // The cache read the ruleset before the variant was made
    RulesetViews.invalidate(ruleset.id);

    const fields = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) => ({
      plain: rulesetData.withInheritedFields("items", longsword!).fields,
      own: rulesetData.find("items", variant.id)!.fields,
      variant: rulesetData.withInheritedFields("items", rulesetData.find("items", variant.id)!).fields,
    }));
    const pairs = (held: OwnerFields) =>
      Object.keys(held).flatMap((field) => OwnerValues.valuesOf(held, field).map((value) => `${field}=${value}`));
    expect(pairs(fields.own).toSorted()).toEqual([
      "DAMAGE_TYPE=Piercing",
      "DAMAGE_TYPE=Slashing",
      "ITEM_IS_TEMPLATE=false",
      "ITEM_SLOT=Other",
      "ITEM_TYPE=Weapon",
      "WEAPON_BASE_DAMAGE=1d10",
    ]);
    // Its weight and cost too, the template's, as it holds none; never its type, slot nor template flag
    const inherited = pairs(fields.plain).filter(
      (pair) => !/^(DAMAGE_TYPE|WEAPON_BASE_DAMAGE|ITEM_TYPE|ITEM_SLOT|ITEM_IS_TEMPLATE)=/.test(pair),
    );
    expect(inherited).toContain(`${ITEM_WEIGHT}=${longsword!.fields[ITEM_WEIGHT]}`);
    expect(inherited).toContain(`${ITEM_COST_GP}=${longsword!.fields[ITEM_COST_GP]}`);
    expect(pairs(fields.variant).toSorted()).toEqual([...inherited, ...pairs(fields.own)].toSorted());
    expect(pairs(fields.plain)).toContain("DAMAGE_TYPE=Slashing");
  });
});

describe("A ruleset's own Settings", () => {
  test("are each field's and link's of the nearest ruleset of its chain that holds it, the fork's whatever its value", async () => {
    // Abilities whose ids sort first and last, before and after the source's: the nearest ruleset's, whatever its value
    const abilityIds = Object.values((await getSeedCtx()).abilityMap).toSorted();
    for (const value of [abilityIds[0], abilityIds.at(-1)!]) {
      const fork = await createSeededTestRuleset(makeSession().userId);
      // A fork holds a copy of its source's as it's made: without it, it reads its chain's
      await writeFieldValues("rulesets", fork.id, [], { skillPointAbility: null });
      RulesetViews.invalidate(fork.id);
      const read = async () => {
        const own = (await findFormValues("rulesets", fork.id)).links;
        return await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
          const { links } = rulesetData.rulesetValuesOf(fork.id);
          return Object.entries(links).map(([role, toId]) => [own[role] === toId ? "fork" : "source", role, toId]);
        });
      };
      expect(await read()).toEqual([["source", "skillPointAbility", expect.any(String)]]);

      await writeFieldValues("rulesets", fork.id, [], { skillPointAbility: value });
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
    const copy = { fields: {}, id: "o1-copy", links: {} };
    expect(view.byId("owners" as Kind).get("o1")).toEqual(copy as never);
    expect(view.storedById("owners" as Kind).get("o1")).toBeUndefined();
    expect(view.storedById("owners" as Kind).get("o1-copy")).toEqual(copy as never);
    expect(view.find("owners" as Kind, "missing")).toBeUndefined();
  });

  test("answer a kind the module declares none of with no rows, and an entity that holds no links with none", () => {
    expect(view.rows("nothing" as Kind)).toEqual([]);
    expect(view.linksOf("o2")).toEqual([]);
    expect(view.linksOf("missing", "any")).toEqual([]);
  });

  test("name a type by its rules' word, in a sentence's case, or by itself for one they have no word for", () => {
    expect(view.labelOf("owners")).toBe("Owner");
    expect(view.labelOf("owned")).toBe("Owned step");
    expect(view.labelOf("nothing")).toBe("nothing");
  });

  test("name an owned entity by its position in its rules' word for it, else in its type's word", () => {
    expect(view.positionNameOf("owned", 2)).toBe("Rung 2");
    expect(view.positionNameOf("owners", 2)).toBe("Owner 2");
    expect(view.positionNameOf("nothing", 2)).toBe("nothing 2");
  });

  test("keep what a module derives of the view, built once", () => {
    class Derived {
      constructor(readonly data: RulesetData) {}
    }
    expect(view.derive(Derived)).toBe(view.derive(Derived));
    expect(view.derive(Derived).data).toBe(view);
  });
});
