import { describe, expect, test } from "bun:test";

import { withoutPlaces } from "@/client/src/pages/rulesets/components/forms/entityFields.ts";
import {
  emptyOwned,
  omittedPlacesOf,
  type OwnedLists,
  ownedListsOf,
  readOwned,
  toOwnedForm,
  withAllAmounts,
} from "@/client/src/pages/rulesets/components/forms/ownedForm.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { Engine } from "@/engine/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { BONDED_KIND_SLUGS, PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 class level's fields, as its rules describe them. */
const FIELDS = CLASS_LEVEL_FIELDS.describe() as unknown as EntityField[];

/** A save's base bonus, as a level's form holds it and its save sends it: its `baseBonus` link's. */
const FORTITUDE = { toId: "fortitude", amount: 2 };

/** A 3.5 class level's lists of links, as its rules describe them: its saves' bases and its granted feats. */
const LISTS: OwnedLists = ownedListsOf(FIELDS);

/** A class level as its route reads it: its saves' bases and the feats it grants among its links. */
const READ = {
  id: "l1",
  position: 1,
  updatedAt: "",
  links: [
    {
      role: "grants",
      toType: "feats",
      toId: "power",
      toName: "Power Attack",
      toDescription: "A trade",
      viaId: "general",
      viaName: "General",
      free: false,
      stacks: false,
    },
    // A grant that doesn't say whether it stacks stacks, as rules that don't say want
    {
      role: "grants",
      toType: "feats",
      toId: "dodge",
      toName: "Dodge",
      toDescription: null,
      viaId: "fighter",
      viaName: null,
      free: true,
    },
    // A level's grant of another kind than its form's: none of its form's
    { role: "grants", toType: "spells", toId: "light", toName: "Light", viaId: "list", free: true },
    { role: "baseBonus", toType: "saves", toId: "fortitude", toName: "Fortitude", amount: 2 },
  ],
};

describe("a class level's form", () => {
  // A bonded creature's class's level (a familiar's) has no base attack bonus, saves or skill points: its sheet works
  // them out, so its page shows none, and its lists hold no amounts
  test("leaves out the fields its class's kind has none of, by their places, and none while the kind is unknown", () => {
    const { tracks } = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].progression;
    const bonded = [`fields.${CLASS_LEVEL_BAB}`, "links.baseBonus", `fields.${CLASS_LEVEL_SKILL_POINTS}`];
    expect(BONDED_KIND_SLUGS.map((kind) => omittedPlacesOf(FIELDS, tracks, kind))).toEqual(
      BONDED_KIND_SLUGS.map(() => bonded),
    );
    expect([
      omittedPlacesOf(FIELDS, tracks, PLAYER_CHARACTER_KIND),
      omittedPlacesOf(FIELDS, tracks, undefined),
    ]).toEqual([[], []]);
    const familiars = ownedListsOf(withoutPlaces(FIELDS, omittedPlacesOf(FIELDS, tracks, "familiar")));
    expect([familiars.amounts, familiars.grants?.role]).toEqual([undefined, "grants"]);
  });

  test("starts from the first level's empty form", () => {
    expect(emptyOwned(LISTS)).toEqual({ position: 1, links: { baseBonus: [], grants: [] } });
  });

  test("reads a level's grants and amounts among its links, by their lists' roles and kinds, and whether each stacks", () => {
    const read = readOwned(READ, LISTS);
    expect(read.position).toBe(1);
    expect(read.amounts).toEqual([FORTITUDE]);
    expect(read.grants).toEqual([
      {
        toId: "power",
        toName: "Power Attack",
        toDescription: "A trade",
        viaId: "general",
        viaName: "General",
        free: false,
        stacks: false,
      },
      {
        toId: "dodge",
        toName: "Dodge",
        toDescription: null,
        viaId: "fighter",
        viaName: null,
        free: true,
        stacks: true,
      },
    ]);
  });

  test("edits a level's grants and amounts as its links hold them, its grants by their labels", () => {
    expect(toOwnedForm(FIELDS, READ)).toEqual({
      position: 1,
      fields: {},
      links: {
        baseBonus: [FORTITUDE],
        grants: [
          { toId: "dodge", viaId: "fighter" },
          { toId: "power", viaId: "general" },
        ],
      },
    });
  });

  test("sends every ruleset save, 0 when unset, and its own until they load", () => {
    const saves = [FORTITUDE];
    expect(withAllAmounts([{ id: "fortitude" }, { id: "will" }], saves)).toEqual([
      FORTITUDE,
      { toId: "will", amount: 0 },
    ]);
    expect(withAllAmounts(undefined, saves)).toBe(saves);
  });
});
