import { describe, expect, test } from "bun:test";

import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";

/** A character as its rows give it: none of them read here. */
const CHARACTER = { record: { privateNotes: null } } as unknown as CharacterInput;

/** A summary that names a character's build: a track it advances on. */
const SUMMARY = {
  separator: " · ",
  tracks: [
    {
      advancements: [{ edit: "Edit Fighter Level 1", id: "level", label: "Level 1" }],
      entityType: "klasses",
      id: "fighter",
      label: "Fighter 1",
      name: "Fighter",
      words: { add: "Add Fighter Level", levels: "Fighter Levels", open: "Fighter 1 Levels" },
    },
  ],
  words: {
    add: "Add",
    removeFailed: "Failed to remove",
    removeLast: "Remove",
    removeLastMessage: "Sure?",
    deleteMessage: "Sure to delete?",
    removed: "Removed",
  },
};

/** A ruleset's view: none of it read here. */
const VIEW = {} as RulesetView;

/**
 * A ruleset that describes too much of a partly seen character: its partial reading's summary with its tracks, its card
 * with a chip that isn't its partial reading's. What the core keeps of them is its own.
 */
class OversharingCharacters extends Dnd35Characters {
  protected override describeFullCard() {
    return {
      chips: [
        { label: "Elf", partial: true, tone: "secondary" as const },
        { label: "Fighter 1", partial: false, tone: "primary" as const },
      ],
      // What the core never shows a partly seen character's reader, whatever its ruleset adds
      levels: [{ klass: "Fighter", level: 1 }],
    };
  }

  protected override describePartial() {
    return { summary: SUMMARY } as unknown as ReturnType<Dnd35Characters["describePartial"]>;
  }
}

describe("The characters part, whatever its ruleset describes", () => {
  test("keeps a partly seen character's card to its partial chips", () => {
    const characters = new OversharingCharacters();
    expect(characters.describeCard(VIEW, { raceId: "elf" }, [], true)).toEqual({
      chips: [{ label: "Elf", partial: true, tone: "secondary" }],
    });
    expect(characters.describeCard(VIEW, { raceId: "elf" }, [], false).chips).toHaveLength(2);
  });

  test("gives a partial reading's summary no tracks", () => {
    const sheet = new OversharingCharacters().describeForMember(VIEW, CHARACTER, [], "partial");
    expect(sheet.summary).toEqual({ ...SUMMARY, tracks: [] });
  });
});
