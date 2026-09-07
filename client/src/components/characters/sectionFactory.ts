import type { RPC } from "@/client/src/services/rpc.ts";
import type { ComponentType } from "react";
import type { InferResponseType } from "hono/client";
import {
  AbilityScoresSection,
  CombatAndSavesSection,
  BondedSection,
  SkillsSection,
  SpellsSection,
} from "./sections/dnd3.5/index.ts";
import type {
  Dnd35AbilityScoresSectionProps,
  Dnd35CombatAndSavesSectionProps,
  Dnd35PowersSectionProps,
  Dnd35SkillsSectionProps,
} from "./sections/dnd3.5/types.ts";

type CharacterResponse = InferResponseType<RPC["api"]["characters"][":id"]["$get"], 200>;
type BaseRules = NonNullable<CharacterResponse["baseRules"]>;

type BondedFromResponse = NonNullable<NonNullable<CharacterResponse["bonded"]>[string]>;
export interface BondedSectionProps {
  bonded: BondedFromResponse;
  /** When true, the bonded name renders as a router link to `/characters/<bondedId>`. */
  linkable?: boolean;
}

// Re-export the 3.5 prop shapes under the generic-sounding names the app
// consumes today. When a second ruleset ships, this file will grow
// per-ruleset prop types and the SectionMap will become a discriminated
// union rather than a single shape.
export type CombatAndSavesSectionProps = Dnd35CombatAndSavesSectionProps;
export type PowersSectionProps = Dnd35PowersSectionProps;
export type AbilityScoresSectionProps = Dnd35AbilityScoresSectionProps;
export type SkillsSectionProps = Dnd35SkillsSectionProps;

interface SectionMap {
  AbilityScoresSection: ComponentType<AbilityScoresSectionProps>;
  CombatAndSavesSection: ComponentType<CombatAndSavesSectionProps>;
  BondedSection: ComponentType<BondedSectionProps>;
  PowersSection: ComponentType<PowersSectionProps>;
  SkillsSection: ComponentType<SkillsSectionProps>;
}

const rulesetSections: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    AbilityScoresSection,
    CombatAndSavesSection,
    BondedSection,
    PowersSection: SpellsSection,
    SkillsSection,
  },
};

export function getSections(baseRules: BaseRules): SectionMap {
  return rulesetSections[baseRules];
}
