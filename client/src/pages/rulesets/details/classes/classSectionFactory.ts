import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType, FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { SectionTab } from "@/client/src/components/common/index.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type { ClassFormData } from "./classSectionQueries.ts";
import { ClassDetails } from "./components/dnd3.5/index.ts";
import { DND35_CLASS_TAB_ALIASES, DND35_CLASS_TABS } from "./sections/dnd3.5/index.ts";

/** A class's inline form: what the details card's fields bind, and its save. */
interface ClassEditor {
  canSave: boolean;
  form: UseFormReturn<ClassFormData>;
  isSaving: boolean;
  onSubmit: FormEventHandler;
}

/**
 * What a class's page shows by its ruleset's base rules: the class's details and their editor, its own tabs, and the
 * tabs its addresses named before, by the tab each opens now.
 */
interface ClassSections {
  /** The class's details card: its form's fields (3.5's hit die, bonus spell ability, caster type) */
  ClassDetails: ComponentType<ClassDetailsProps>;
  /** Old tab keys, by the key of the tab each opens now (3.5's Levels, by its Progression) */
  tabAliases: Record<string, string>;
  /** Its own tabs (3.5's progression, spells, spell list), its page's first, before its skills and its customization */
  tabs: ClassTab[];
}

/**
 * What the class page passes its details card: the class's form and its save, which a viewer who can't edit the class
 * reads (under `ReadOnlyFields`), and its ruleset.
 */
export interface ClassDetailsProps {
  /** The class's form, which the card's fields bind, and its save */
  edit: ClassEditor;
  rulesetId: string;
}

/** What the class page passes each of its tabs. */
export interface ClassSectionProps {
  classId: string;
  className: string;
  /** A delete on its tab can be undone from Local Changes: the class is inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
}

/** A class page's tab: its key (the URL's `:section`), its label and icon, the section it shows, and what it warms. */
export interface ClassTab extends SectionTab<string> {
  /** Warms its rows as it's pointed at; a tab whose section reads its own rows warms none */
  prefetch?: (queryClient: QueryClient, rulesetId: string, classId: string) => Promise<void>;
  Section: ComponentType<ClassSectionProps>;
}

const CLASS_SECTIONS: Record<BaseRules, ClassSections> = {
  "Dungeons & Dragons: 3.5": {
    ClassDetails,
    tabAliases: DND35_CLASS_TAB_ALIASES,
    tabs: DND35_CLASS_TABS,
  },
};

/** What a class's page shows by its ruleset's base rules, which the ruleset's own folders hold. */
export function getClassSections(baseRules: BaseRules): ClassSections {
  return CLASS_SECTIONS[baseRules];
}
