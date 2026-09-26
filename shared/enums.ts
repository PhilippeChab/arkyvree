import type {
  baseRules,
  location,
  role,
  rulesetStatus,
} from "@/drizzle/schema.ts";
import { alignment, gender, sizeType } from "@/drizzle/schema.ts";

export type Alignment = (typeof alignment.enumValues)[number];
export type Gender = (typeof gender.enumValues)[number];
export type Location = (typeof location.enumValues)[number];
export type Role = (typeof role.enumValues)[number];
export type RulesetStatus = (typeof rulesetStatus.enumValues)[number];
export type SizeType = (typeof sizeType.enumValues)[number];
export type BaseRules = (typeof baseRules.enumValues)[number];

export const SIZE_OPTIONS = sizeType.enumValues;
export const ALIGNMENT_OPTIONS = alignment.enumValues;
export const GENDER_OPTIONS = gender.enumValues;
