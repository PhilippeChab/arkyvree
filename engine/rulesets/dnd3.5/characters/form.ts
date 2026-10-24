import type { CharacterForm } from "@/engine/core/module/index.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/vocabulary/dnd3.5/identity.ts";

/**
 * A new 3.5 character's form: its name and experience, its ruleset and race, its alignment and gender (which narrow the
 * races it can pick, and are required); its ability scores; its physical details; and its deity, description and notes,
 * all optional. Its fields are the identity's columns, each keyed as its create sends it (`NewCharacters.planFields`):
 * its experience by its column's name, `xp`, which the identity's edit keys `experience`.
 */
export const CHARACTER_FORM: CharacterForm = {
  sections: [
    {
      kind: "fields",
      title: "Basic Information",
      lines: [
        [
          { kind: "name", label: "Character Name" },
          {
            key: "xp",
            kind: "number",
            label: "Experience Points",
            min: 0,
            required: "Experience points are required",
            start: 0,
          },
        ],
        [
          { kind: "ruleset" },
          {
            column: "raceId",
            kind: "pick",
            label: "Race",
            required: "Race is required",
            ineligible: "Not open to this alignment or gender: pick another",
          },
        ],
        [
          {
            key: "alignment",
            kind: "select",
            label: "Alignment",
            narrows: true,
            options: [...ALIGNMENT_OPTIONS],
            required: "Alignment is required",
          },
          {
            key: "gender",
            kind: "select",
            label: "Gender",
            narrows: true,
            options: [...GENDER_OPTIONS],
            required: "Gender is required",
          },
        ],
      ],
    },
    {
      kind: "scores",
      link: "abilities",
      title: "Ability Scores",
      none: "No abilities in this ruleset",
      pick: "Pick a ruleset to see its abilities",
    },
    {
      kind: "fields",
      title: "Physical Details",
      lines: [
        [
          { key: "age", kind: "number", label: "Age", min: 1, stepped: true },
          { key: "height", kind: "text", label: "Height", placeholder: "e.g., 5 feet 8 inches" },
          { key: "weight", kind: "text", label: "Weight", placeholder: "e.g., 150 lbs, 68kg" },
        ],
      ],
    },
    {
      kind: "fields",
      title: "Optional Details",
      lines: [
        [{ key: "deity", kind: "text", label: "Deity" }],
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
