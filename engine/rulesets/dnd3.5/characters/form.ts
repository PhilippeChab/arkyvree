import type { CharacterForm } from "@/engine/core/module/index.ts";

import NewCharacters from "./NewCharacters.ts";

/**
 * A new 3.5 character's form: its name and experience, its ruleset and race, its alignment and gender (which narrow the
 * races it can pick, and are required); its ability scores; its physical details; and its deity, description and notes,
 * all optional. Its fields are the character's own, as they're declared (`NewCharacters.describeField`), each keyed by
 * the stored field its create sends it by (`CHARACTER_XP`), as the identity's edit does; its description is its row's.
 */
export const CHARACTER_FORM: CharacterForm = {
  sections: [
    {
      kind: "fields",
      title: "Basic Information",
      lines: [
        [{ kind: "name", label: "Character Name" }, NewCharacters.describeField("xp")],
        [
          { kind: "ruleset" },
          {
            role: "race",
            kind: "pick",
            label: "Race",
            required: "Race is required",
            ineligible: "Not open to this alignment or gender: pick another",
          },
        ],
        [
          NewCharacters.describeField("alignment", { narrows: true }),
          NewCharacters.describeField("gender", { narrows: true }),
        ],
      ],
    },
    {
      kind: "scores",
      role: "score",
      title: "Ability Scores",
      none: "No abilities in this ruleset",
      pick: "Pick a ruleset to see its abilities",
    },
    {
      kind: "fields",
      title: "Physical Details",
      lines: [
        [
          NewCharacters.describeField("age", { stepped: true }),
          NewCharacters.describeField("height"),
          NewCharacters.describeField("weight"),
        ],
      ],
    },
    {
      kind: "fields",
      title: "Optional Details",
      lines: [
        [NewCharacters.describeField("deity")],
        [
          {
            key: "description",
            kind: "textarea",
            label: "Description",
            placeholder: "Character appearance, personality, or background…",
          },
        ],
        [{ kind: "notes" }],
      ],
    },
  ],
};
