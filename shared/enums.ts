/**
 * The database's enums, and the value sets a module's fields hold. The enums' values are written out rather than read
 * from the schema, which the client would then load whole; tests/shared/enums.test.ts checks they match it and the
 * migrated database. The value sets are the 3.5 module's, which checks them (an alignment, a gender, a size, an item's
 * location): the database stores them as text.
 */

import type { contributorRole, role, rulesetKind } from "@/drizzle/schema.ts";

export type Alignment = (typeof ALIGNMENT_OPTIONS)[number];
/** A registered module's base rules: `rules.modules` holds them, and `rulesets.base_rules` names one. */
export type BaseRules = (typeof BASE_RULES_OPTIONS)[number];
/** A campaign player's role. */
export type CampaignRole = (typeof role.enumValues)[number];
export type ContributorRole = (typeof contributorRole.enumValues)[number];
export type Gender = (typeof GENDER_OPTIONS)[number];
/** Where an item is worn or held: an inventory entry's location, an item's slot. */
export type ItemLocation = (typeof LOCATION_OPTIONS)[number];
export type RulesetKind = (typeof rulesetKind.enumValues)[number];
export type SizeType = (typeof SIZE_OPTIONS)[number];

export const ALIGNMENT_OPTIONS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
] as const;

export const BASE_RULES_OPTIONS = ["Dungeons & Dragons: 3.5"] as const;

export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;

export const LOCATION_OPTIONS = [
  "Head",
  "Neck",
  "Shoulders",
  "Torso",
  "Wrists",
  "Hands",
  "Waist",
  "Finger",
  "Trinket",
  "Main Hand",
  "Off Hand",
  "Two Handed",
  "Other",
] as const;

export const SIZE_OPTIONS = [
  "Fine",
  "Diminutive",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
] as const;
