import type { ReactNode } from "react";

import { type RulesetDetail } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { ClassesSection, ItemsSection, SkillsSection, SpellsSection } from "./sections/dnd3.5/index.ts";

/** What the ruleset page renders by its base rules: the tabs whose entities are theirs. */
interface SectionMap {
  ClassesSection: SectionComponent;
  ItemsSection: SectionComponent;
  PowersSection: SectionComponent;
  SkillsSection: SectionComponent;
}

type SectionComponent = (props: RulesetSectionProps) => ReactNode;

/** What the ruleset page passes every section tab. */
export interface RulesetSectionProps {
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
  ruleset: RulesetDetail;
}

const RULESET_SECTIONS: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    ClassesSection,
    ItemsSection,
    PowersSection: SpellsSection,
    SkillsSection,
  },
};

export function getSections(baseRules: BaseRules): SectionMap {
  return RULESET_SECTIONS[baseRules];
}
