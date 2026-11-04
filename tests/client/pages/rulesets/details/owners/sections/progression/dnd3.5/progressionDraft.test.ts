import { describe, expect, test } from "bun:test";

import { type OwnedLists, ownedListsOf, readOwned } from "@/client/src/pages/rulesets/components/forms/ownedForm.ts";
import {
  buildProgressionBody,
  describeFeatureRows,
  NO_EDITS,
  readFeatureNotes,
  readFeatureOptions,
  withoutFeature,
  withoutPool,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/progressionDraft.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

const EVASION = { toId: "evasion", viaId: "features", toName: "Evasion" };

/** A 3.5 class level's lists of links, as its rules describe them: its saves' bases and its granted feats. */
const LISTS: OwnedLists = ownedListsOf(CLASS_LEVEL_FIELDS.describe() as unknown as EntityField[]);

/** The fields a 3.5 class's Progression tab sets: its base attack bonus and skill points, each by its stored field. */
const TRACKS = [
  { field: CLASS_LEVEL_BAB, key: "bab" },
  { field: CLASS_LEVEL_SKILL_POINTS, key: "skills" },
];

/**
 * A class level as its query reads it: its base attack bonus and skill points among its fields, and its links: a
 * save's base and its granted feats.
 */
function level(id: string, number: number, grants: { toId: string; toName: string; viaId: string }[] = []) {
  const row = {
    id,
    position: number,
    updatedAt: "",
    fields: { [CLASS_LEVEL_BAB]: number, [CLASS_LEVEL_SKILL_POINTS]: 4 },
    links: [
      ...grants.map((grant) => ({
        ...grant,
        role: "grants",
        toType: "feats",
        toDescription: null,
        viaName: "Class Features",
        free: false,
      })),
      { role: "baseBonus", toType: "saves", toId: "fort", toName: "Fortitude", amount: 2 },
    ],
  };
  return readOwned(row, LISTS, TRACKS);
}

/** A class's first two levels, its second granting Evasion. */
function twoLevels() {
  return [level("l1", 1), level("l2", 2, [EVASION])];
}

describe("A Progression tab's save", () => {
  test("lists a class's features with the levels it grants each at", () => {
    expect(describeFeatureRows(twoLevels())).toEqual([
      {
        key: "evasion-features",
        grantedAt: ["l2"],
        name: "Evasion",
        toId: "evasion",
        viaId: "features",
        viaName: "Class Features",
      },
    ]);
  });

  test("sends nothing for a tab that changed nothing", () => {
    expect(
      buildProgressionBody(twoLevels(), LISTS, TRACKS, ["fort"], describeFeatureRows(twoLevels()), [], NO_EDITS),
    ).toEqual({});
  });

  test("sends a level's own saves as they are while the ruleset's aren't read yet, never none", () => {
    const body = buildProgressionBody(twoLevels(), LISTS, TRACKS, undefined, [], [], {
      ...NO_EDITS,
      tracks: { bab: { l1: 0 } },
    });
    expect(body.owned?.[0].links?.baseBonus).toEqual([{ toId: "fort", amount: 2 }]);
  });

  test("sends no pick at a level the class no longer has", () => {
    const pools = [{ id: "pool", name: "Pool", picks: {} }];
    const body = buildProgressionBody(twoLevels(), LISTS, TRACKS, ["fort"], [], pools, {
      ...NO_EDITS,
      pools: { pool: { gone: 1 } },
    });
    expect(body).toEqual({});
  });

  test("sends each changed level's fields and saves, its feats when they changed, and a pool's changed picks", () => {
    const features = describeFeatureRows(twoLevels());
    const body = buildProgressionBody(
      twoLevels(),
      LISTS,
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
      owned: [
        {
          ownedId: "l1",
          fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 6 },
          links: {
            baseBonus: [{ toId: "fort", amount: 2 }],
            // Granted at a new level, as its first grant is: not free
            grants: [{ toId: "evasion", viaId: "features", free: false }],
          },
        },
      ],
      pools: [{ id: "pool", picks: [{ ownedId: "l2", count: 2 }] }],
    });
  });

  test("takes a removed feature off every level that grants it and a removed pool's picks off its levels", () => {
    const [evasion] = describeFeatureRows(twoLevels());
    const pool = { id: "pool", name: "Pool", picks: { l1: 1 } };
    const edits = withoutPool(withoutFeature(NO_EDITS, evasion), pool);
    expect(buildProgressionBody(twoLevels(), LISTS, TRACKS, ["fort"], [evasion], [pool], edits)).toEqual({
      owned: [
        {
          ownedId: "l2",
          fields: { [CLASS_LEVEL_BAB]: 2, [CLASS_LEVEL_SKILL_POINTS]: 4 },
          links: { baseBonus: [{ toId: "fort", amount: 2 }], grants: [] },
        },
      ],
      pools: [{ id: "pool", picks: [{ ownedId: "l1", count: 0 }] }],
    });
  });

  test("drops a feature or pool the tab added and removed, sending nothing", () => {
    const added = { ...describeFeatureRows(twoLevels())[0], key: "dodge-features", toId: "dodge", grantedAt: [] };
    const pool = { id: "pool", name: "Pool", picks: {} };
    const edits = withoutPool(withoutFeature({ ...NO_EDITS, addedFeatures: [added], addedPools: [pool] }, added), pool);
    expect([edits.addedFeatures, edits.addedPools]).toEqual([[], []]);
    expect(buildProgressionBody(twoLevels(), LISTS, TRACKS, ["fort"], [], [], edits)).toEqual({});
  });
});

describe("A feature's notes", () => {
  test("are read as the rules write them, each a feature's at an owned entity, none else", () => {
    const note = { from: ["l1", "l3"], idle: ["l3"], idleText: "No effect.", moveText: "Moves here.", toId: "flurry" };

    expect(readFeatureNotes([note, { ...note, idleText: 3 }, { toId: "aura" }, "l1"])).toEqual([note]);
    expect(readFeatureNotes(undefined)).toEqual([]);
  });
});

describe("A listed feat's options", () => {
  test("are one per pool its rules say the owner grants it through", () => {
    const listed = {
      id: "aura",
      name: "Aura (Cleric)",
      grantedThrough: [
        { id: "own", name: "Cleric Class Feature" },
        { id: "general", name: "General" },
      ],
    };

    expect(readFeatureOptions(listed).map(({ key, viaName }) => ({ key, viaName }))).toEqual([
      { key: "aura-own", viaName: "Cleric Class Feature" },
      { key: "aura-general", viaName: "General" },
    ]);
    expect(readFeatureOptions({ ...listed, grantedThrough: undefined })).toEqual([]);
    expect(readFeatureOptions("aura")).toEqual([]);
  });
});
