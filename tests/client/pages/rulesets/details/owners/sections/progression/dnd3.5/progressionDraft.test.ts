import { describe, expect, test } from "bun:test";

import { type LevelColumns, readLevel } from "@/client/src/pages/rulesets/components/forms/levelForm.ts";
import {
  buildProgressionBody,
  describeFeatureRows,
  NO_EDITS,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/progressionDraft.ts";
import { CLASS_LEVEL_COLUMNS } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 class level's columns the tab reads past its fields: its saves' bases and its granted feats. */
const COLUMNS: LevelColumns = {
  amounts: CLASS_LEVEL_COLUMNS.find((column) => column.input === "amounts"),
  grants: CLASS_LEVEL_COLUMNS.find((column) => column.input === "grants"),
} as LevelColumns;

const EVASION = { id: "evasion", viaId: "features", name: "Evasion" };

/** The fields a 3.5 class's Progression tab sets: its base attack bonus and skill points, each by its stored field. */
const TRACKS = [
  { field: CLASS_LEVEL_BAB, key: "bab" },
  { field: CLASS_LEVEL_SKILL_POINTS, key: "skills" },
];

/**
 * A class level as its query reads it: its base attack bonus and skill points among its fields, a save's base and its
 * granted feats.
 */
function level(id: string, number: number, grants: { id: string; name: string; viaId: string }[] = []) {
  const row = {
    id,
    position: number,
    updatedAt: "",
    fields: { [CLASS_LEVEL_BAB]: number, [CLASS_LEVEL_SKILL_POINTS]: 4 },
    baseBonus: [{ toId: "fort", amount: 2 }],
    grants: grants.map((grant) => ({ ...grant, description: null, viaName: "Class Features", free: false })),
  };
  return readLevel(row, COLUMNS, TRACKS);
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
      buildProgressionBody(twoLevels(), COLUMNS, TRACKS, ["fort"], describeFeatureRows(twoLevels()), [], NO_EDITS),
    ).toEqual({});
  });

  test("sends a level's own saves as they are while the ruleset's aren't read yet, never none", () => {
    const body = buildProgressionBody(twoLevels(), COLUMNS, TRACKS, undefined, [], [], {
      ...NO_EDITS,
      tracks: { bab: { l1: 0 } },
    });
    expect(body.levels?.[0].links?.baseBonus).toEqual([{ toId: "fort", amount: 2 }]);
  });

  test("sends no pick at a level the class no longer has", () => {
    const pools = [{ id: "pool", name: "Pool", picks: {} }];
    const body = buildProgressionBody(twoLevels(), COLUMNS, TRACKS, ["fort"], [], pools, {
      ...NO_EDITS,
      pools: { pool: { gone: 1 } },
    });
    expect(body).toEqual({});
  });

  test("sends each changed level's fields and saves, its feats when they changed, and a pool's changed picks", () => {
    const features = describeFeatureRows(twoLevels());
    const body = buildProgressionBody(
      twoLevels(),
      COLUMNS,
      TRACKS,
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
          fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 6 },
          links: {
            baseBonus: [{ toId: "fort", amount: 2 }],
            // Granted at a new level, as its first grant is: not free
            grants: [{ toId: "evasion", viaId: "features", free: false }],
          },
        },
      ],
      pools: [{ id: "pool", picks: [{ levelId: "l2", count: 2 }] }],
    });
  });
});
