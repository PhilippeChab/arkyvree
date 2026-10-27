import { describe, expect, test } from "bun:test";

import type { CharacterInput, FieldsBlock } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import type { Character } from "@/shared/relations.ts";

/** A character as its rows give it: its row, shared, and none of its other rows read here. */
const CHARACTER = {
  record: { id: "character", name: "Aria", privateNotes: null, shareToken: "token" },
} as unknown as CharacterInput;

/** A partly seen character's identity's block, as its ruleset describes it: none of it read here. */
const IDENTITY = { key: "identity", kind: "fields" } as FieldsBlock;

/** A character's row: none of it read here. */
const RECORD = {} as Character;

/** A summary that names a character's build: a track it advances on. */
const SUMMARY = {
  separator: " · ",
  tracks: [
    {
      advancements: [{ edit: "Edit Fighter Level 1", id: "level", label: "Level 1" }],
      entityType: "classes",
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

/** A ruleset's view: its ruleset, and none of the rest read here. */
const VIEW = { ruleset: { baseRules: "rules", name: "Rules", rulesetId: null } } as unknown as RulesetView;

/**
 * A ruleset that describes too much of a partly seen character: its partial reading's summary with its tracks and its
 * requirements, its card with a chip that isn't its partial reading's. What the core keeps of them is its own.
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
    return { identity: IDENTITY, requirements: { unmet: ["Fighter 1"] }, summary: SUMMARY } as unknown as ReturnType<
      Dnd35Characters["describePartial"]
    >;
  }
}

describe("The characters part, whatever its ruleset describes", () => {
  test("keeps a partly seen character's card to its partial chips", () => {
    const characters = new OversharingCharacters(DND35_STORAGE);
    expect(characters.describeCard(VIEW, RECORD, [], true)).toEqual({
      chips: [{ label: "Elf", partial: true, tone: "secondary" }],
    });
    expect(characters.describeCard(VIEW, RECORD, [], false).chips).toHaveLength(2);
  });

  test("writes a partial reading as its allowlist: its row's columns, no share token, its summary no tracks", () => {
    const sheet = new OversharingCharacters(DND35_STORAGE).describeForMember(VIEW, CHARACTER, [], "partial");
    expect(sheet).toMatchObject({ id: "character", name: "Aria", rulesetName: "Rules", isCustomRuleset: false });
    expect(sheet.shareToken).toBeNull();
    expect({ ...sheet.requirements, ...sheet.modifiers }).toEqual({});
    expect(sheet.validation).toEqual({ valid: true, issues: [] });
    expect(sheet.summary).toEqual({ ...SUMMARY, tracks: [] });
    expect(sheet.blocks).toEqual([IDENTITY]);
  });
});
