import type { ComponentType } from "react";

import type { BaseRules } from "@/shared/enums.ts";

import {
  AbilityScoresSection,
  type AbilityScoresSectionProps,
  BondedCreature,
  type BondedCreatureProps,
  bondedFeats,
  CombatAndSavesSection,
  type CombatAndSavesSectionProps,
  SkillsSection,
  type SkillsSectionProps,
  SpellsSection,
  type SpellsSectionProps,
  WeaponsSection,
  type WeaponsSectionProps,
} from "./sections/dnd3.5/index.ts";

/**
 * What a sheet shows by its base rules: its sections, which a power is to the schema and a spell to 3.5
 * (`PowersSection: SpellsSection`), and its bonded creatures by the feat that bonds each. A second base rules makes
 * this a union of each one's map.
 */
interface SectionMap {
  AbilityScoresSection: ComponentType<AbilityScoresSectionProps>;
  BondedCreature: ComponentType<BondedCreatureProps>;
  bondedFeats: typeof bondedFeats;
  CombatAndSavesSection: ComponentType<CombatAndSavesSectionProps>;
  PowersSection: ComponentType<SpellsSectionProps>;
  SkillsSection: ComponentType<SkillsSectionProps>;
  WeaponsSection: ComponentType<WeaponsSectionProps>;
}

const RULESET_SECTIONS: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    AbilityScoresSection,
    bondedFeats,
    BondedCreature,
    CombatAndSavesSection,
    PowersSection: SpellsSection,
    SkillsSection,
    WeaponsSection,
  },
};

export function getSections(baseRules: BaseRules): SectionMap {
  return RULESET_SECTIONS[baseRules];
}
