import { describe, expect, test } from "bun:test";

import type { ClassLevelRow } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import {
  buildProgressionBody,
  describeFeatureRows,
  NO_EDITS,
} from "@/client/src/pages/rulesets/details/classes/sections/dnd3.5/progressionDraft.ts";

const EVASION = { id: "evasion", aptitudeId: "features", name: "Evasion" };

/** A class level as its query reads it: its base attack bonus, skill points, a save's base and its granted feats. */
function level(id: string, number: number, feats: { aptitudeId: string; id: string; name: string }[] = []) {
  return {
    id,
    level: number,
    bab: number,
    skills: 4,
    saves: [{ saveId: "fort", base: 2 }],
    feats: feats.map((feat) => ({ ...feat, aptitudeName: "Class Features", free: false })),
  } as unknown as ClassLevelRow;
}

/** A class's first two levels, its second granting Evasion. */
function twoLevels() {
  return [level("l1", 1), level("l2", 2, [EVASION])];
}

describe("A Progression tab's save", () => {
  test("lists a class's features with the levels it grants each at", () => {
    expect(describeFeatureRows(twoLevels())).toEqual([
      {
        aptitudeId: "features",
        aptitudeName: "Class Features",
        featId: "evasion",
        key: "evasion-features",
        levelIds: ["l2"],
        name: "Evasion",
      },
    ]);
  });

  test("sends nothing for a tab that changed nothing", () => {
    expect(buildProgressionBody(twoLevels(), ["fort"], describeFeatureRows(twoLevels()), [], NO_EDITS)).toEqual({});
  });

  test("sends a level's own saves as they are while the ruleset's aren't read yet, never none", () => {
    const body = buildProgressionBody(twoLevels(), [], [], [], { ...NO_EDITS, tracks: { bab: { l1: 0 } } });
    expect(body.levels?.[0].saves).toEqual([{ saveId: "fort", base: 2 }]);
  });

  test("sends each changed level's fields and saves, its feats when they changed, and a pool's changed picks", () => {
    const features = describeFeatureRows(twoLevels());
    const body = buildProgressionBody(
      twoLevels(),
      ["fort"],
      features,
      [{ aptitudeId: "pool", name: "Pool", picks: { l1: 1 } }],
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
