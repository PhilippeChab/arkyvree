import { describe, expect, test } from "bun:test";

import {
  emptyLevel,
  type LevelLists,
  levelListsOf,
  nextLevel,
  readLevel,
  toLevelForm,
  withAllAmounts,
} from "@/client/src/pages/rulesets/components/forms/levelForm.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";

/** A 3.5 class level's fields, as its rules describe them. */
const FIELDS = CLASS_LEVEL_FIELDS.describe() as unknown as EntityField[];

/** A save's base bonus, as a level's form holds it and its save sends it: its `baseBonus` link's. */
const FORTITUDE = { toId: "fortitude", amount: 2 };

/** A 3.5 class level's lists of links, as its rules describe them: its saves' bases and its granted feats. */
const LISTS: LevelLists = levelListsOf(FIELDS);

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
    },
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

/** A class level as its route reads it, its saves' bases among its links. */
function level(number: number, baseBonus: { amount: number; toId: string }[]) {
  const links = baseBonus.map((link) => ({ ...link, role: "baseBonus", toType: "saves", toName: link.toId }));
  return readLevel({ id: `l${number}`, position: number, updatedAt: "", links }, LISTS);
}

describe("a class level's form", () => {
  // Its create dialog opens on the class's next level
  test("starts one above the class's highest level, from its saves (its fields: `withEntityFields`)", () => {
    const levels = [level(2, [{ ...FORTITUDE, amount: 3 }]), level(1, [FORTITUDE])];
    expect(nextLevel(levels, LISTS)).toEqual({
      position: 3,
      links: { baseBonus: [{ ...FORTITUDE, amount: 3 }], grants: [] },
    });
  });

  test("starts from the first level's empty form for a class without one, or while its levels load", () => {
    expect([nextLevel([], LISTS), nextLevel(undefined, LISTS)]).toEqual([emptyLevel(LISTS), emptyLevel(LISTS)]);
    expect(emptyLevel(LISTS)).toEqual({ position: 1, links: { baseBonus: [], grants: [] } });
  });

  test("reads a level's grants and amounts among its links, by their lists' roles and kinds", () => {
    const read = readLevel(READ, LISTS);
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
      },
      { toId: "dodge", toName: "Dodge", toDescription: null, viaId: "fighter", viaName: null, free: true },
    ]);
  });

  test("edits a level's grants and amounts as its links hold them, its grants by their labels", () => {
    expect(toLevelForm(FIELDS, READ)).toEqual({
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
