/**
 * The value sets of a character's identity: its alignment, as the SRD 5.2.1 names the nine, and its gender, which a new
 * character's form offers.
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
