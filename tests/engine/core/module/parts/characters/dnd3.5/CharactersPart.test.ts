import { describe, expect, test } from "bun:test";

import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import type { Character } from "@/shared/relations.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** A character's row's columns, which every sheet opens with. */
const COLUMNS = {
  id: "character",
  userId: "owner",
  kind: "pc",
  parentCharacterId: null,
  name: "Aria",
  rulesetId: "ruleset",
  deletedAt: null,
  updatedAt: "2026-01-01T00:00:00Z",
};

/** What a character's rows hold that some of its readers mustn't read: its notes, private notes and share token. */
const SECRETS = { notes: "Owes the guild a favor", privateNotes: "Plans to betray the party", shareToken: "row-token" };

/** A character as its rows give it: its row, with its secrets, and none of its other rows read here. */
const CHARACTER = { record: { ...COLUMNS, ...SECRETS } } as unknown as CharacterInput;

/** What an oversharing ruleset writes of a character's build, or of a share token, where no reader should find it. */
const LEAKS = { build: "Fighter 9", language: "Draconic", token: "leaked-token" };

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

/** A summary that adds a key of its own, which names the build and a share token. */
const OVERSHARED_SUMMARY = { ...SUMMARY, classes: LEAKS.build, shareToken: LEAKS.token };

/** A character's row: none of it read here. */
const RECORD = {} as Character;

/** A ruleset's view: its ruleset, and none of the rest read here. */
const VIEW = { ruleset: { baseRules: DND35_BASE_RULES, name: "Rules", rulesetId: null } } as unknown as RulesetView;

/**
 * An identity block that shows too much, from the rows it's given (`record`): its race with a key of its own, a field
 * echoing the rows' share token and private notes, its picked links, its notes and a key of its own.
 */
function identityOf(record: Character) {
  return {
    kind: "fields",
    key: "identity",
    title: "Personal Details",
    empty: "",
    saved: "Saved",
    failed: "Failed",
    lines: [
      [{ key: "race", kind: "text", label: "Race", value: "Elf", fixed: true, build: LEAKS.build }],
      [{ key: "echo", kind: "text", label: "Echo", value: `${record.shareToken}|${record.privateNotes}` }],
    ],
    fields: [],
    links: [{ label: "Languages", none: "", picked: [{ id: "draconic", name: LEAKS.language }], role: "speaks" }],
    notes: { notes: record.notes ?? "", privateNotes: record.privateNotes ?? "" },
    build: { bab: 9 },
  };
}

/**
 * A ruleset that describes too much of a character: a sheet that answers a share token, another owner, notes and a
 * block of its build; a partial reading with its build in its summary, its identity's links and notes, and keys of its
 * own; a card with a chip that isn't its partial reading's; a printed sheet of the rows it's given. What the core keeps
 * of them is its own.
 */
class OversharingCharacters extends Dnd35Characters {
  protected override describeDocument(_view: RulesetView, character: CharacterInput) {
    return { record: character.record } as unknown as ReturnType<Dnd35Characters["describeDocument"]>;
  }

  protected override describeFull(_view: RulesetView, character: CharacterInput) {
    return {
      shareToken: LEAKS.token,
      userId: "someone-else",
      notes: SECRETS.notes,
      requirements: {},
      modifiers: {},
      validation: { valid: true, issues: [] },
      summary: OVERSHARED_SUMMARY,
      blocks: [identityOf(character.record), { key: "build", kind: "stats", title: LEAKS.build }],
    } as unknown as ReturnType<Dnd35Characters["describeFull"]>;
  }

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

  protected override describePartial(_view: RulesetView, character: CharacterInput) {
    return {
      identity: identityOf(character.record),
      summary: OVERSHARED_SUMMARY,
      blocks: [{ key: "build", kind: "scores" }],
      modifiers: { build: LEAKS.build },
      shareToken: LEAKS.token,
      notes: SECRETS.notes,
    } as unknown as ReturnType<Dnd35Characters["describePartial"]>;
  }
}

describe("The characters part, whatever its ruleset describes", () => {
  const characters = new OversharingCharacters(DND35_STORAGE);

  test("keeps a partly seen character's card to its partial chips", () => {
    expect(characters.describeCard(VIEW, RECORD, [], true)).toEqual({
      chips: [{ label: "Elf", partial: true, tone: "secondary" }],
    });
    expect(characters.describeCard(VIEW, RECORD, [], false).chips).toHaveLength(2);
  });

  test("answers a sheet's row's columns and its declared keys alone, no share token, its private notes as read", () => {
    const shown = characters.describe(VIEW, CHARACTER, [], "show");
    const hidden = characters.describe(VIEW, CHARACTER, [], "hide");
    for (const sheet of [shown, hidden]) {
      expect(Object.keys(sheet)).toEqual([
        ...["id", "userId", "kind", "parentCharacterId", "name", "rulesetId", "rulesetName", "baseRules"],
        ...["isCustomRuleset", "deletedAt", "updatedAt", "shareToken"],
        ...["requirements", "modifiers", "validation", "summary", "blocks"],
      ]);
      expect(sheet).toMatchObject({ id: "character", userId: "owner", shareToken: null });
      // The ruleset describes rows with no share token: its blocks can't show it
      expect(JSON.stringify(sheet)).not.toContain(SECRETS.shareToken);
    }
    // Its ruleset's blocks and summary are its full readers', but the private notes of who doesn't read them
    expect(shown.blocks).toHaveLength(2);
    expect(JSON.stringify(hidden.blocks)).toContain("null|null");
    expect(JSON.stringify(shown)).toContain(SECRETS.privateNotes);
    expect(JSON.stringify(hidden)).not.toContain(SECRETS.privateNotes);
  });

  test("writes a partial reading as its allowlist: its row's columns, its summary no tracks, its identity's head and fields", () => {
    const sheet = characters.describeForMember(VIEW, CHARACTER, [], "partial");
    expect(sheet).toEqual({
      ...COLUMNS,
      rulesetName: "Rules",
      baseRules: DND35_BASE_RULES,
      isCustomRuleset: false,
      shareToken: null,
      requirements: {},
      modifiers: {},
      validation: { valid: true, issues: [] },
      summary: { separator: SUMMARY.separator, words: SUMMARY.words, tracks: [] },
      blocks: [
        {
          kind: "fields",
          key: "identity",
          title: "Personal Details",
          empty: "",
          saved: "Saved",
          failed: "Failed",
          lines: [
            [{ key: "race", kind: "text", label: "Race", value: "Elf", fixed: true }],
            [{ key: "echo", kind: "text", label: "Echo", value: "null|null" }],
          ],
          fields: [],
        },
      ],
    });
    for (const secret of [...Object.values(SECRETS), ...Object.values(LEAKS)])
      expect(JSON.stringify(sheet)).not.toContain(secret);
  });

  test("prints a sheet from rows with no share token, its private notes only for a reader who reads them", () => {
    const printed = (notes: "hide" | "show") =>
      (characters.describeSheet(VIEW, CHARACTER, { diagnostics: false }, notes) as unknown as { record: Character })
        .record;
    expect(printed("show")).toMatchObject({ privateNotes: SECRETS.privateNotes, shareToken: null });
    expect(printed("hide")).toMatchObject({ notes: SECRETS.notes, privateNotes: null, shareToken: null });
  });
});
