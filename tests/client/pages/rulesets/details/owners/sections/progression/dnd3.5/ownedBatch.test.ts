import { describe, expect, test } from "bun:test";

import { ownedListsOf, type OwnedRead } from "@/client/src/pages/rulesets/components/forms/ownedForm.ts";
import {
  buildOwnedBatch,
  defaultBatchChoices,
  listBatchCounts,
  listOpenPositions,
  listTrackValues,
  type OwnerTrack,
  type ShownOwned,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/ownedBatch.ts";
import {
  amountTrackKey,
  readTrack,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/progressionDraft.ts";
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

/** A class's levels as its tab shows them, as saved. */
function shownAs(entities: OwnedRead[]): ShownOwned {
  return { entities, read: readTrack };
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

  test("give a new class's levels their tracks' values at their numbers, a save's base bonus among their links", () => {
    const choices = {
      [BAB.key]: "medium",
      [amountTrackKey(FORTITUDE)]: "good",
      [amountTrackKey(REFLEX)]: "poor",
      [SKILLS.key]: 4,
    };
    const levels = buildOwnedBatch([6, 7, 8, 9, 10, 11, 12, 13, 14, 15], TRACKS, choices, LISTS, shownAs([]));
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
    expect(buildOwnedBatch([1, 2], [], {}, LISTS, shownAs([]))).toEqual([
      { position: 1, fields: {} },
      { position: 2, fields: {} },
    ]);
  });

  test("carry on from the class's level below them, never dropping where their progression changes", () => {
    // A class whose fifteen levels follow a good base attack bonus and a good Reflex
    const fifteen = Array.from({ length: 15 }, (_, index) =>
      level(index + 1, index + 1, [Math.floor((index + 1) / 3), 2 + Math.floor((index + 1) / 2)], 2),
    );
    const shown = shownAs(fifteen);
    const next = [16, 17, 18, 19, 20];
    // A poor base attack bonus after +15 adds +1 every other level: +16 at 16, +18 at 20, never +8 as poor's own
    expect(listTrackValues(TRACKS[0], "poor", next, shown)).toEqual([16, 16, 17, 17, 18]);
    // A poor Reflex after +9 adds +1 every third level: +10 at 18
    expect(listTrackValues(TRACKS[2], "poor", next, shown)).toEqual([9, 9, 10, 10, 10]);
    // The same progression carries on as its own table: a good base attack bonus, +16 to +20
    expect(listTrackValues(TRACKS[0], "good", next, shown)).toEqual([16, 17, 18, 19, 20]);
    // Within the track's bounds, and the level made as it says
    const high = shownAs([level(15, 19, [0, 9], 2)]);
    expect(listTrackValues(TRACKS[0], "good", next, high)).toEqual([20, 20, 20, 20, 20]);
    const [sixteenth] = buildOwnedBatch([16], TRACKS, { [BAB.key]: "poor", [SKILLS.key]: 2 }, LISTS, shown);
    expect(sixteenth.fields).toEqual({ [BAB.field ?? ""]: 16, [SKILLS.field ?? ""]: 2 });
    // As the tab shows them: its Progression's edits over what's saved
    const edited: ShownOwned = {
      entities: fifteen,
      read: (owned, key) => (key === BAB.key ? 10 : readTrack(owned, key)),
    };
    expect(listTrackValues(TRACKS[0], "good", [16], edited)).toEqual([11]);
  });

  test("start each track at the preset the class's levels follow, its skill points at its highest level's", () => {
    // A new class starts each track at its first preset, its skill points at their least
    expect(defaultBatchChoices(TRACKS, shownAs([]))).toEqual({
      [BAB.key]: "good",
      [amountTrackKey(FORTITUDE)]: "good",
      [amountTrackKey(REFLEX)]: "good",
      [SKILLS.key]: 0,
    });
    // A rogue's first levels: medium base attack, a poor Fortitude, a good Reflex, 8 skill points
    const rogue = [level(1, 0, [0, 2], 8), level(2, 1, [0, 3], 8), level(3, 2, [1, 3], 8)];
    expect(defaultBatchChoices(TRACKS, shownAs(rogue))).toEqual({
      [BAB.key]: "medium",
      [amountTrackKey(FORTITUDE)]: "poor",
      [amountTrackKey(REFLEX)]: "good",
      [SKILLS.key]: 8,
    });
    // As the tab shows them: a rogue whose Progression was just set to a good base attack bonus and 6 skill points, not
    // saved yet, or saving
    const edited = (owned: OwnedRead, key: string) =>
      key === BAB.key ? owned.position : key === SKILLS.key ? 6 : readTrack(owned, key);
    expect(defaultBatchChoices(TRACKS, { entities: rogue, read: edited })).toMatchObject({
      [BAB.key]: "good",
      [SKILLS.key]: 6,
    });
    // A track that follows no preset at every level starts at the one it follows at the most
    const almostGood = [level(1, 1, [2, 0], 2), level(2, 2, [3, 0], 2), level(3, 2, [3, 1], 2)];
    expect(defaultBatchChoices(TRACKS, shownAs(almostGood))[BAB.key]).toBe("good");
  });
});
