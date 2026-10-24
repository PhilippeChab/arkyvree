import { describe, expect, test } from "bun:test";

import {
  emptyLevel,
  type LevelColumns,
  levelKeysOf,
  nextLevel,
  readLevel,
  withAllAmounts,
} from "@/client/src/pages/rulesets/components/forms/levelForm.ts";
import { CLASS_LEVEL_COLUMNS } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";

/** A 3.5 class level's columns past its fields: its saves' bases and its granted feats. */
const COLUMNS: LevelColumns = {
  amounts: CLASS_LEVEL_COLUMNS.find((column) => column.input === "amounts"),
  grants: CLASS_LEVEL_COLUMNS.find((column) => column.input === "grants"),
} as LevelColumns;

const FORTITUDE = { saveId: "fortitude", base: 2 };

/** Where a 3.5 class level's form holds them: its `saves` at `saveId` and `base`, its `feats`. */
const KEYS = levelKeysOf(COLUMNS);

/** A class level as its route reads it, its saves' bases among it. */
function level(number: number, saves: { base: number; saveId: string }[]) {
  return readLevel({ id: `l${number}`, level: number, updatedAt: "", bab: number, skills: 4, saves }, COLUMNS);
}

describe("a class level's form", () => {
  // Its create dialog opens on the class's next level
  test("starts one above the class's highest level, from its saves (its fields: `withEntityFields`)", () => {
    const levels = [level(2, [{ ...FORTITUDE, base: 3 }]), level(1, [FORTITUDE])];
    expect(nextLevel(levels, KEYS)).toEqual({ level: 3, saves: [{ ...FORTITUDE, base: 3 }], feats: [] });
  });

  test("starts from the first level's empty form for a class without one, or while its levels load", () => {
    expect([nextLevel([], KEYS), nextLevel(undefined, KEYS)]).toEqual([emptyLevel(KEYS), emptyLevel(KEYS)]);
    expect(emptyLevel(KEYS)).toEqual({ level: 1, saves: [], feats: [] });
  });

  test("sends every ruleset save, 0 when unset, and its own until they load", () => {
    const saves = [FORTITUDE];
    const amounts = KEYS.amounts!;
    expect(withAllAmounts([{ id: "fortitude" }, { id: "will" }], saves, amounts)).toEqual([
      FORTITUDE,
      { saveId: "will", base: 0 },
    ]);
    expect(withAllAmounts(undefined, saves, amounts)).toBe(saves);
  });
});
