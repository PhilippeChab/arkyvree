/**
 * The database's enums. Their values are written out rather than read from the schema, which the client would then load
 * whole; tests/shared/enums.test.ts checks they match it and the migrated database.
 */

import type {
  alignment,
  baseRules,
  contributorRole,
  gender,
  location,
  role,
  rulesetKind,
  sizeType,
} from "@/drizzle/schema.ts";

export type Alignment = (typeof alignment.enumValues)[number];
export type BaseRules = (typeof baseRules.enumValues)[number];
/** A campaign player's role. */
export type CampaignRole = (typeof role.enumValues)[number];
export type ContributorRole = (typeof contributorRole.enumValues)[number];
export type Gender = (typeof gender.enumValues)[number];
/** Where an item is worn or held: an inventory entry's location, an item's slot. */
export type ItemLocation = (typeof location.enumValues)[number];
export type RulesetKind = (typeof rulesetKind.enumValues)[number];
export type SizeType = (typeof sizeType.enumValues)[number];

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
] as const satisfies readonly Alignment[];

export const BASE_RULES_OPTIONS = ["Dungeons & Dragons: 3.5"] as const satisfies readonly BaseRules[];

/** The ruleset family a record without one belongs to. */
export const DEFAULT_BASE_RULES: BaseRules = "Dungeons & Dragons: 3.5";

export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const satisfies readonly Gender[];

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
] as const satisfies readonly ItemLocation[];

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
] as const satisfies readonly SizeType[];
