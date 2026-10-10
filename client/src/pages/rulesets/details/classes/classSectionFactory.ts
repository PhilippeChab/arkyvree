import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType, FormEventHandler, ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { SectionTab } from "@/client/src/components/common/index.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type { ClassDetail, ClassFormData, ClassLevelRow } from "./classSectionQueries.ts";
import { ClassDetails } from "./components/dnd3.5/index.ts";
import { DND35_CLASS_TABS, DND35_LEVEL_COLUMNS } from "./sections/dnd3.5/index.ts";

/** A class's inline editor: its form, which the details card's fields bind, and its save. */
interface ClassEditor {
  canSave: boolean;
  form: UseFormReturn<ClassFormData>;
  isSaving: boolean;
  onSubmit: FormEventHandler;
}

/**
 * What a class's page shows by its ruleset's base rules: the class's details and their editor, the columns its Levels
 * tab shows of a level's own fields, and its own tabs.
 */
interface ClassSections {
  /** The class's details card: its facts (3.5's hit die, bonus spell ability, caster type), or its editor's fields */
  ClassDetails: ComponentType<ClassDetailsProps>;
  /** The Levels tab's columns of a level's own fields (3.5's base attack bonus, its skill points), around its saves' */
  levelColumns: ClassLevelColumns;
  /** Its own tabs (3.5's feat pools, spells, spell list), after its levels and its skills, before its customization */
  tabs: ClassTab[];
}

/**
 * What the class page passes its details card: the class, its editor's form and save for who may edit it, and where a
 * copy of it goes.
 */
export interface ClassDetailsProps {
  /** The class from the URL, which a save names */
  classId: string;
  /** The editor, for who may edit the class: its form, which the card's fields bind, and its save */
  edit?: ClassEditor;
  /** The page's `followCopy`: a save of an inherited class copies it, the page moving to the copy */
  followCopy: (copyId: string, sourceId: string) => void;
  /** The class is refetching: what the card saves in place waits for it */
  isFetching: boolean;
  klass: ClassDetail;
  rulesetId: string;
}

/** A column a class's Levels tab shows of its levels' own fields. */
export interface ClassLevelColumn {
  key: string;
  label: string;
  /** Its share of the table's width, in percent: the saves share what the level's, the feats' and these leave */
  share: number;
  /** What its cell says of a level */
  valueOf: (level: ClassLevelRow) => ReactNode;
}

/** The columns a class's Levels tab shows of its levels' own fields: those before its saves', and those after. */
export interface ClassLevelColumns {
  afterSaves: ClassLevelColumn[];
  beforeSaves: ClassLevelColumn[];
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
    levelColumns: DND35_LEVEL_COLUMNS,
    tabs: DND35_CLASS_TABS,
  },
};

/** What a class's page shows by its ruleset's base rules, which the ruleset's own folders hold. */
export function getClassSections(baseRules: BaseRules): ClassSections {
  return CLASS_SECTIONS[baseRules];
}
