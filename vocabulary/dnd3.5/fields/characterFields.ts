/**
 * A D&D 3.5 character's own fields, its identity and its experience, declared as an entity's are (`FieldSpec`): data
 * the engine stores, reads and takes from its sheet's edit by (its characters' codec, `FieldCodec`), and its storage's
 * registry rows. A character is one row, with no sibling copies: each field is its own value (`winner`).
 */

import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/vocabulary/dnd3.5/identity.ts";

import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "./character.ts";

/**
 * A 3.5 character's fields, by name, in the order its sheet shows them: its alignment, its experience and its deity, then
 * its age, gender, height and weight. Its alignment, gender and experience it always holds (always written: an edit
 * never clears them), each with the default a new one takes without it (an import's: True Neutral, Other, 0), its
 * alignment and gender among their options, its experience a whole number from 0; its age a whole number from 1, or
 * none; its deity, height and weight texts, or none. What a new character's form must give are those it always holds
 * (`write: "always"`), which an import defaults.
 */
export const CHARACTER_FIELDS = {
  alignment: {
    default: "True Neutral",
    description: "The character's moral and ethical outlook",
    kind: "text",
    label: "Alignment",
    required: true,
    field: CHARACTER_ALIGNMENT,
    merge: "winner",
    values: ALIGNMENT_OPTIONS,
    write: "always",
  },
  xp: {
    default: 0,
    description: "The experience points the character has earned",
    kind: "number",
    label: "Experience Points",
    min: 0,
    field: CHARACTER_XP,
    merge: "winner",
    write: "always",
  },
  deity: {
    description: "The deity the character worships",
    kind: "text",
    label: "Deity",
    field: CHARACTER_DEITY,
    merge: "winner",
  },
  age: {
    description: "The character's age, in years",
    kind: "number",
    label: "Age",
    min: 1,
    field: CHARACTER_AGE,
    merge: "winner",
  },
  gender: {
    default: "Other",
    description: "The character's gender",
    kind: "text",
    label: "Gender",
    required: true,
    field: CHARACTER_GENDER,
    merge: "winner",
    values: GENDER_OPTIONS,
    write: "always",
  },
  height: {
    description: "The character's height, as its player writes it",
    kind: "text",
    label: "Height",
    placeholder: "e.g., 5 feet 8 inches",
    field: CHARACTER_HEIGHT,
    merge: "winner",
  },
  weight: {
    description: "The character's weight, as its player writes it",
    kind: "text",
    label: "Weight",
    placeholder: "e.g., 150 lbs, 68kg",
    field: CHARACTER_WEIGHT,
    merge: "winner",
  },
} as const;
