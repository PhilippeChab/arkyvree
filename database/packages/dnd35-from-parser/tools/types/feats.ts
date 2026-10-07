import type {
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";

import type { Overrides, ScrapedMeta } from "./reference.ts";

/** A feat's fields a mapping derives and an override sets. */
type FeatFields = {
  aptitudes?: string[];
  description?: string;
  featNameMap?: Record<string, string>;
  modifiers?: ModifierSeed[];
  properties?: Property[];
  requirements?: RequirementEntry[];
  selectable?: boolean;
  skip?: boolean;
  stackable?: boolean;
};

/** Template expansion config for family feats (Weapon Focus, Skill Focus, etc.) */
type FeatTemplate = { familyName: string; type: "weapon" | "skill" | "school" | "crossbow" };

export type FeatReference = {
  _meta: ScrapedMeta<"feat">;

  /** Auto-detected requirements for each feat */
  detected: {
    [featName: string]: {
      aptitudes: string[];
      /** Invalid paths that failed validation — bugs to fix */
      errors?: string[];
      featNameMap: Record<string, string>;
      modifiers?: ModifierSeed[];
      properties?: Property[];
      requirements: RequirementEntry[];
      stackable?: boolean;
      template?: FeatTemplate;
      /** Modifier text we couldn't auto-parse — needs human review */
      unresolvedModifiers?: string[];
      /** Prerequisite text we recognized but couldn't map to a requirement */
      unresolvedPrereqs?: string[];
    };
  };

  /** Merged data per feat: derived from detected and the overrides when the reference is loaded */
  mapping: Record<
    string,
    FeatFields & {
      /** Template expansion config — purely auto-detected, not overridable */
      template?: FeatTemplate;
    }
  >;

  overrides?: Overrides<FeatFields>;

  /** All feats scraped from the page */
  raw: {
    benefit: string;
    featType: string;
    name: string;
    normal?: string;
    prerequisiteText: string;
    special?: string;
  }[];
};
