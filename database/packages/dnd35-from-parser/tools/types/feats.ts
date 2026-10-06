import type { Overrides, ScrapedMeta } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import type {
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";

/** A feat's fields a mapping derives and an override sets. */
type FeatFields = {
  description?: string;
  aptitudes?: string[];
  requirements?: RequirementEntry[];
  modifiers?: ModifierSeed[];
  properties?: Property[];
  stackable?: boolean;
  selectable?: boolean;
  featNameMap?: Record<string, string>;
  skip?: boolean;
};

/** Template expansion config for family feats (Weapon Focus, Skill Focus, etc.) */
type FeatTemplate = { type: "weapon" | "skill" | "school" | "crossbow"; familyName: string };

export type FeatReference = {
  _meta: ScrapedMeta<"feat">;

  /** All feats scraped from the page */
  raw: {
    name: string;
    featType: string;
    prerequisiteText: string;
    benefit: string;
    normal?: string;
    special?: string;
  }[];

  /** Auto-detected requirements for each feat */
  detected: {
    [featName: string]: {
      aptitudes: string[];
      requirements: RequirementEntry[];
      featNameMap: Record<string, string>;
      stackable?: boolean;
      modifiers?: ModifierSeed[];
      properties?: Property[];
      /** Invalid paths that failed validation — bugs to fix */
      errors?: string[];
      /** Modifier text we couldn't auto-parse — needs human review */
      unresolvedModifiers?: string[];
      /** Prerequisite text we recognized but couldn't map to a requirement */
      unresolvedPrereqs?: string[];
      template?: FeatTemplate;
    };
  };

  overrides?: Overrides<FeatFields>;

  /** Merged data per feat: derived from detected and the overrides when the reference is loaded */
  mapping: Record<
    string,
    FeatFields & {
      /** Template expansion config — purely auto-detected, not overridable */
      template?: FeatTemplate;
    }
  >;
};
