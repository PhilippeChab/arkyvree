import { describe, expect, test } from "bun:test";

import {
  type LevelColumns,
  progressionKeysOf,
  readProgressionLevel,
} from "@/client/src/pages/rulesets/details/classes/sections/progression/progressionColumns.ts";
import {
  buildProgressionBody,
  describeFeatureRows,
  NO_EDITS,
} from "@/client/src/pages/rulesets/details/classes/sections/progression/progressionDraft.ts";
import { CLASS_LEVEL_COLUMNS } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";

/** A 3.5 class level's columns the tab reads past its fields: its saves' bases and its granted feats. */
const COLUMNS: LevelColumns = {
  amounts: CLASS_LEVEL_COLUMNS.find((column) => column.input === "amounts"),
  grants: CLASS_LEVEL_COLUMNS.find((column) => column.input === "grants"),
} as LevelColumns;

const EVASION = { id: "evasion", aptitudeId: "features", name: "Evasion" };

/** The fields a 3.5 class's Progression tab sets: its base attack bonus and skill points. */
const FIELDS = ["bab", "skills"];

/** Where the save writes them: a level's `saves` and `feats`, a pool's `aptitudeId`. */
const KEYS = progressionKeysOf(COLUMNS);

/** A class level as its query reads it: its base attack bonus, skill points, a save's base and its granted feats. */
function level(id: string, number: number, feats: { aptitudeId: string; id: string; name: string }[] = []) {
  const row = {
    id,
    level: number,
    updatedAt: "",
    bab: number,
    skills: 4,
    saves: [{ saveId: "fort", base: 2 }],
    feats: feats.map((feat) => ({ ...feat, description: null, aptitudeName: "Class Features", free: false })),
  };
  return readProgressionLevel(row, COLUMNS);
}

/** A class's first two levels, its second granting Evasion. */
function twoLevels() {
  return [level("l1", 1), level("l2", 2, [EVASION])];
}

describe("A Progression tab's save", () => {
  test("lists a class's features with the levels it grants each at", () => {
    expect(describeFeatureRows(twoLevels())).toEqual([
      {
        entityId: "evasion",
        key: "evasion-features",
        levelIds: ["l2"],
        name: "Evasion",
        viaId: "features",
        viaName: "Class Features",
      },
    ]);
  });

  test("sends nothing for a tab that changed nothing", () => {
    expect(
      buildProgressionBody(twoLevels(), KEYS, FIELDS, ["fort"], describeFeatureRows(twoLevels()), [], NO_EDITS),
    ).toEqual({});
  });

  test("sends a level's own saves as they are while the ruleset's aren't read yet, never none", () => {
    const body = buildProgressionBody(twoLevels(), KEYS, FIELDS, undefined, [], [], {
      ...NO_EDITS,
      tracks: { bab: { l1: 0 } },
    });
    expect(body.levels?.[0].saves).toEqual([{ saveId: "fort", base: 2 }]);
  });

  test("sends no pick at a level the class no longer has", () => {
    const pools = [{ id: "pool", name: "Pool", picks: {} }];
    const body = buildProgressionBody(twoLevels(), KEYS, FIELDS, ["fort"], [], pools, {
      ...NO_EDITS,
      pools: { pool: { gone: 1 } },
    });
    expect(body).toEqual({});
  });

  test("sends each changed level's fields and saves, its feats when they changed, and a pool's changed picks", () => {
    const features = describeFeatureRows(twoLevels());
    const body = buildProgressionBody(
      twoLevels(),
      KEYS,
      FIELDS,
      ["fort"],
      features,
      [{ id: "pool", name: "Pool", picks: { l1: 1 } }],
      {
        ...NO_EDITS,
        tracks: { skills: { l1: 6 } },
        features: { "evasion-features": ["l1", "l2"] },
        pools: { pool: { l1: 1, l2: 2 } },
      },
    );
    expect(body).toEqual({
      levels: [
        {
          levelId: "l1",
          fields: { bab: 1, skills: 6 },
          saves: [{ saveId: "fort", base: 2 }],
          // Granted at a new level, as its first grant is: not free
          feats: [{ featId: "evasion", aptitudeId: "features", free: false }],
        },
      ],
      pools: [{ aptitudeId: "pool", picks: [{ levelId: "l2", count: 2 }] }],
    });
  });
});
