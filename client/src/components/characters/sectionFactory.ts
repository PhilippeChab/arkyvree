import type { ComponentType } from "react";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import {
  AbilityScoresSection,
  BondedSection,
  CombatAndSavesSection,
  type Dnd35AbilityScoresSectionProps,
  type Dnd35BondedSectionProps,
  type Dnd35CombatAndSavesSectionProps,
  type Dnd35PowersSectionProps,
  type Dnd35SkillsSectionProps,
  SkillsSection,
  SpellsSection,
} from "./sections/dnd3.5/index.ts";

type BaseRules = NonNullable<CharacterDetail["baseRules"]>;

/**
 * The 3.5 prop shapes under the generic names the SectionMap uses. When a second ruleset ships, this file will grow
 * per-ruleset prop types and the SectionMap will become a discriminated union rather than a single shape.
 */
type CombatAndSavesSectionProps = Dnd35CombatAndSavesSectionProps;
type PowersSectionProps = Dnd35PowersSectionProps;
type AbilityScoresSectionProps = Dnd35AbilityScoresSectionProps;
type SkillsSectionProps = Dnd35SkillsSectionProps;

interface SectionMap {
  AbilityScoresSection: ComponentType<AbilityScoresSectionProps>;
  CombatAndSavesSection: ComponentType<CombatAndSavesSectionProps>;
  BondedSection: ComponentType<Dnd35BondedSectionProps>;
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
