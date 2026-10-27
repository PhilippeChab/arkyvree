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
 * A 3.5 character's fields, by name, in the order its sheet shows them: its alignment, its experience and its deity,
 * then its age, gender, height and weight. Its alignment and gender, among their options (`required`), and its
 * experience, with a default, its forms never leave at none, as an entity's (`Field.isRequired`): they mark them
 * required, and a new character gives them (`FieldInputs`). An edit that sends its alignment or its gender unset
 * leaves it as it is; its experience sent unset, it refuses. The three are always written (`write: "always"`): a
 * character holds them, and an import takes their defaults (True Neutral, Other, 0) when its file has none. Its
 * experience is a whole number from 0; its age a whole number from 1, or none; its deity, height and weight texts, or
 * none.
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
