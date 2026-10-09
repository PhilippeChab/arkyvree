import type { ComponentType } from "react";

import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import type { ClassSection } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import {
  ClassModifiersSection,
  ClassPropertiesSection,
  ClassRequirementsSection,
} from "./ClassCustomizationSections.tsx";
import { ClassFeatPoolsSection } from "./ClassFeatPoolsSection.tsx";
import { ClassLevelsSection } from "./ClassLevelsSection.tsx";
import { ClassSkillsSection } from "./ClassSkillsSection.tsx";
import { ClassSpellListSection } from "./ClassSpellListSection.tsx";
import { ClassSpellsKnownSection } from "./ClassSpellsKnownSection.tsx";
import { ClassSpellsPerDaySection } from "./ClassSpellsPerDaySection.tsx";

/** What the class page passes each of its tabs. */
export interface ClassSectionProps {
  classId: string;
  className: string;
  /** A delete on its tab can be undone from Local Changes: the class is inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
}

/** The class page's tabs, by their key: the URL's `:section`. */
export const CLASS_SECTIONS: Record<ClassSection, ComponentType<ClassSectionProps>> = {
  levels: ClassLevelsSection,
  skills: ClassSkillsSection,
  "feat-pools": ClassFeatPoolsSection,
  "spells-known": ClassSpellsKnownSection,
  "spells-per-day": ClassSpellsPerDaySection,
  "spell-list": ClassSpellListSection,
  properties: ClassPropertiesSection,
  modifiers: ClassModifiersSection,
  requirements: ClassRequirementsSection,
};
