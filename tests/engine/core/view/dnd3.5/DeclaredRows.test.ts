/**
 * Two modules declaring a kind of one type, each with rows of its own: 3.5's `feats` and a made-up module's, which it
 * declares into the view's registry beside 3.5's. Each module's code reads its own kinds' rows as it declares them, and
 * the engine's machinery reads them as the view holds any kind's.
 */

import { describe, expect, expectTypeOf, test } from "bun:test";

import { CowData } from "@/engine/core/cow/index.ts";
import type { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { EntityKindsContract } from "@/engine/core/module/index.ts";
import {
  DeclaredRows,
  type KindType,
  type OwnedKind,
  RulesetComposition,
  type StandaloneKind,
  type ViewEntity,
  type ViewSchema,
} from "@/engine/core/view/index.ts";
import type FeatEntity from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";
import type { Dnd35Kinds, Feat } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { NO_FIELDS, rawRows } from "@/tests/support/composedViews.ts";

declare module "@/engine/core/view/rows.ts" {
  /** A made-up module's kinds: its feats, a kind of 3.5's type with rows of its own, and no owned kind. */
  interface ModuleKinds {
    "made-up": { owned: never; rows: MadeUpKinds };
  }
}

/** The made-up module's kinds' entities, by type. */
interface MadeUpKinds {
  feats: MadeUpFeat;
}

/** The made-up module's feat: a field of its own (`COGS`), none of 3.5's. */
type MadeUpFeat = ViewEntity<{ COGS: number }>;

/** The made-up module's kinds, as its storage declares them to the view. */
const SCHEMA: ViewSchema = { kinds: [{ type: "feats", customizable: false, tracked: false }], unionLinks: [] };

/** A ruleset's view of the made-up module: a feat of three cogs. */
function composeFeats() {
  const rows = rawRows({ feats: [{ id: "gear", fields: { COGS: 3 }, links: {}, name: "Gear" }] });
  const cow = new CowData(["base"], new Map(), new Map(), new Map(), new Set());
  return new RulesetComposition([rows], cow, NO_FIELDS, SCHEMA, {}).build();
}

describe("DeclaredRows", () => {
  test("reads a kind's rows as the module that declares them does, whichever other module declares its type", () => {
    const view = composeFeats();
    const madeUp = new DeclaredRows<MadeUpKinds>(view);
    const [gear] = madeUp.rows("feats");

    expectTypeOf(gear).toEqualTypeOf<MadeUpFeat>();
    expect(gear.fields.COGS).toBe(3);
    expect(madeUp.find("feats", "gear")).toBe(gear);
    expect(madeUp.byId("feats").get("gear")).toBe(gear);
    expect(madeUp.storedById("feats").get("gear")).toBe(gear);
    // 3.5's code reads its own feats, and the machinery a view's, any kind's
    expectTypeOf(new DeclaredRows<Dnd35Kinds>(view).find("feats", "gear")).toEqualTypeOf<Feat | undefined>();
    expectTypeOf(view.find("feats", "gear")).toEqualTypeOf<ViewEntity | undefined>();
    expect(view.find("feats", "gear")).toBe(gear);
  });

  test("types each module's entity kinds by its own rows, and names a kind by any module's types", () => {
    expectTypeOf<ReturnType<FeatEntity["find"]>>().toEqualTypeOf<Feat>();
    expectTypeOf<ReturnType<RulesetEntity<MadeUpKinds, "feats">["find"]>>().toEqualTypeOf<MadeUpFeat>();
    // Each module's contract asks for a rules class of each of its own kinds no entity owns, none of the other's
    expectTypeOf<keyof EntityKindsContract<MadeUpKinds>>().toEqualTypeOf<"feats">();
    expectTypeOf<keyof EntityKindsContract<Dnd35Kinds, "class-levels">>().toEqualTypeOf<StandaloneKind>();
    // The made-up module's kind adds no type 3.5's don't have
    expectTypeOf<KindType>().toEqualTypeOf<keyof Dnd35Kinds>();
    expectTypeOf<OwnedKind>().toEqualTypeOf<"class-levels">();
  });
});
