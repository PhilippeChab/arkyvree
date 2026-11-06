/**
 * The value sets of a Pathfinder character's identity: its alignment, as the Core Rulebook names them (its "Neutral",
 * 3.5's "True Neutral"), and its gender, which a new character's form offers.
 */

export type Alignment = (typeof ALIGNMENT_OPTIONS)[number];
export type Gender = (typeof GENDER_OPTIONS)[number];

export const ALIGNMENT_OPTIONS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
] as const;

export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
