import type { ReactNode } from "react";

import type { RulesetDetail } from "@/client/src/lib/queries.ts";

import { ClassesSection, ItemsSection, SkillsSection, SpellsSection } from "./sections/dnd3.5/index.ts";

type BaseRules = RulesetDetail["baseRules"];

/** What the ruleset page passes every section tab. */
export interface RulesetSectionProps {
  ruleset: RulesetDetail;
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

type SectionComponent = (props: RulesetSectionProps) => ReactNode;

interface SectionMap {
  ClassesSection: SectionComponent;
  ItemsSection: SectionComponent;
  PowersSection: SectionComponent;
  SkillsSection: SectionComponent;
}

const rulesetSections: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    ClassesSection,
    ItemsSection,
    PowersSection: SpellsSection,
    SkillsSection,
  },
};

export function getSections(baseRules: BaseRules): SectionMap {
  return rulesetSections[baseRules];
}
