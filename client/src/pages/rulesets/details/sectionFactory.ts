import type { ComponentType, ReactNode } from "react";

import { type RulesetDetail } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { RulesetLicenseNotice } from "./components/dnd3.5/index.ts";
import { ClassesSection, ItemsSection, SkillsSection, SpellsSection } from "./sections/dnd3.5/index.ts";

type SectionComponent = (props: RulesetSectionProps) => ReactNode;

/** What the ruleset page renders by its base rules: the tabs whose entities are theirs, and its system's license. */
interface SectionMap {
  ClassesSection: SectionComponent;
  ItemsSection: SectionComponent;
  /** What a system ruleset's content is licensed under, under its header: none where nothing needs saying */
  LicenseNotice?: ComponentType<LicenseNoticeProps>;
  PowersSection: SectionComponent;
  SkillsSection: SectionComponent;
}

/** What the ruleset page passes its license notice: the system ruleset's name. */
export interface LicenseNoticeProps {
  name: string;
}

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
    LicenseNotice: RulesetLicenseNotice,
    PowersSection: SpellsSection,
    SkillsSection,
  },
};

export function getSections(baseRules: BaseRules): SectionMap {
  return RULESET_SECTIONS[baseRules];
}
