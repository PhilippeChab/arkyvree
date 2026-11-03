import { describe, expect, test } from "bun:test";

import { ownedListsOf, type OwnedRead } from "@/client/src/pages/rulesets/components/forms/ownedForm.ts";
import {
  buildOwnedBatch,
  defaultBatchChoices,
  listBatchCounts,
  listOpenPositions,
  type OwnerTrack,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/ownedBatch.ts";
import { amountTrackKey } from "@/client/src/pages/rulesets/details/owners/sections/progression/progressionDraft.ts";
import { Engine } from "@/engine/index.ts";

/** 3.5's rules, as the client reads them. */
const RULES = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"];

/** 3.5's tracks: its base attack bonus, its saves and its skill points. */
const [BAB, SAVES, SKILLS] = RULES.progression.tracks;

/** Two saves of a ruleset, by made-up ids. */
const [FORTITUDE, REFLEX] = ["fortitude-id", "reflex-id"];

/** A class level's lists of links: its saves' base bonuses among them. */
const LISTS = ownedListsOf(RULES.fields["class-levels"]);

/** A class's tracks, as its Progression tab lists them: its base attack bonus, a track a save, its skill points. */
const TRACKS: OwnerTrack[] = [
  { key: BAB.key, label: BAB.label, rules: BAB },
  { key: amountTrackKey(FORTITUDE), label: "Fortitude", rules: SAVES, toId: FORTITUDE },
  { key: amountTrackKey(REFLEX), label: "Reflex", rules: SAVES, toId: REFLEX },
  { key: SKILLS.key, label: SKILLS.label, rules: SKILLS },
];

/** A class level as its route reads it, at a position: its base attack bonus, its saves' bases and its skill points. */
function level(position: number, bab: number, saves: [number, number], skills: number): OwnedRead {
  return {
    amounts: [
      { toId: FORTITUDE, amount: saves[0] },
      { toId: REFLEX, amount: saves[1] },
    ],
    grants: [],
    id: `level-${position}`,
    position,
    row: {},
    updatedAt: "",
    values: { [BAB.key]: bab, [SKILLS.key]: skills },
  };
}

describe("Several class levels made at once", () => {
  test("are always the class's next levels, a gap's first, up to level 20", () => {
    expect(listOpenPositions([], 20)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(listOpenPositions([1, 2, 3, 4, 5], 20).slice(0, 3)).toEqual([6, 7, 8]);
    // A gap comes first
    expect(listOpenPositions([1, 2, 5], 20).slice(0, 4)).toEqual([3, 4, 6, 7]);
    expect(listOpenPositions([...Array.from({ length: 19 }, (_, index) => index + 1)], 20)).toEqual([20]);
    expect(
      listOpenPositions(
        Array.from({ length: 20 }, (_, index) => index + 1),
        20,
      ),
    ).toEqual([]);
    // While the rules load: the next alone
    expect(listOpenPositions([1, 2], undefined)).toEqual([3]);
  });

  test("offer one, five, ten or twenty levels, cut to how many the class lacks", () => {
    expect(listBatchCounts(20)).toEqual([1, 5, 10, 20]);
    expect(listBatchCounts(15)).toEqual([1, 5, 10, 15]);
    expect(listBatchCounts(3)).toEqual([1, 3]);
    expect(listBatchCounts(1)).toEqual([1]);
    expect(listBatchCounts(0)).toEqual([]);
  });

  test("give each level its tracks' values at its number, a save's base bonus among its links", () => {
    const choices = {
      [BAB.key]: "medium",
      [amountTrackKey(FORTITUDE)]: "good",
      [amountTrackKey(REFLEX)]: "poor",
      [SKILLS.key]: 4,
    };
    const levels = buildOwnedBatch([6, 7, 8, 9, 10, 11, 12, 13, 14, 15], TRACKS, choices, LISTS);
    expect(levels.map(({ position }) => position)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const role = LISTS.amounts?.role ?? "";
    expect([levels[0], levels[9]]).toEqual([
      {
        position: 6,
        fields: { [BAB.field ?? ""]: 4, [SKILLS.field ?? ""]: 4 },
        links: {
          [role]: [
            { toId: FORTITUDE, amount: 5 },
            { toId: REFLEX, amount: 2 },
          ],
        },
      },
      {
        position: 15,
        fields: { [BAB.field ?? ""]: 11, [SKILLS.field ?? ""]: 4 },
        links: {
          [role]: [
            { toId: FORTITUDE, amount: 9 },
            { toId: REFLEX, amount: 5 },
          ],
        },
      },
    ]);
    // A class whose kind sets no track (a bonded creature's) makes levels of their numbers alone
    expect(buildOwnedBatch([1, 2], [], {}, LISTS)).toEqual([
      { position: 1, fields: {} },
      { position: 2, fields: {} },
    ]);
  });

  test("start each track at the preset the class's levels follow, its skill points at its highest level's", () => {
    // A new class starts each track at its first preset, its skill points at their least
    expect(defaultBatchChoices(TRACKS, [])).toEqual({
      [BAB.key]: "good",
      [amountTrackKey(FORTITUDE)]: "good",
      [amountTrackKey(REFLEX)]: "good",
      [SKILLS.key]: 0,
    });
    // A rogue's first levels: medium base attack, a poor Fortitude, a good Reflex, 8 skill points
    const rogue = [level(1, 0, [0, 2], 8), level(2, 1, [0, 3], 8), level(3, 2, [1, 3], 8)];
    expect(defaultBatchChoices(TRACKS, rogue)).toEqual({
      [BAB.key]: "medium",
      [amountTrackKey(FORTITUDE)]: "poor",
      [amountTrackKey(REFLEX)]: "good",
      [SKILLS.key]: 8,
    });
    // A track that follows no preset at every level starts at the one it follows at the most
    const almostGood = [level(1, 1, [2, 0], 2), level(2, 2, [3, 0], 2), level(3, 2, [3, 1], 2)];
    expect(defaultBatchChoices(TRACKS, almostGood)[BAB.key]).toBe("good");
  });
});
