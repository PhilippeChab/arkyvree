import type { ComponentType } from "react";
import type { UseFormReturn } from "react-hook-form";

import {
  allLevelSaves,
  EMPTY_CLASS,
  NewClassLevelFields,
  nextClassLevel,
  toClassForm,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { Save } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type { ClassDetail, ClassFormData, ClassLevelFormData, ClassLevelRow } from "./classSectionQueries.ts";

/** What a class's page edits by its ruleset's base rules: a class's form and a class level's. */
interface ClassForms {
  /** Every ruleset save with its base at a level, as the level endpoints take them. */
  allLevelSaves: (rulesetSaves: Pick<Save, "id">[] | undefined, saves: LevelSave[]) => LevelSave[];
  /** A class's form before its class loads. */
  emptyClass: ClassFormData;
  /** A new class level's fields, under its number: its create dialog's. */
  NewClassLevelFields: ComponentType<NewClassLevelFieldsProps>;
  /** A class's next level, which its create dialog opens on. */
  nextClassLevel: (levels: readonly ClassLevelRow[] | undefined) => ClassLevelFormData;
  /** An existing class's form values. */
  toClassForm: (klass: Pick<ClassDetail, "description" | "hd" | "name">) => ClassFormData;
}

/** A class level's save, as its form holds it and the level endpoints take it: the save, and its base at the level. */
type LevelSave = NonNullable<ClassLevelFormData["saves"]>[number];

/** What a new class level's fields take: its form, and the ruleset's saves, each a base field its owner sends. */
export interface NewClassLevelFieldsProps {
  form: UseFormReturn<ClassLevelFormData>;
  rulesetId: string;
  rulesetSaves: Save[] | undefined;
  /** Why they didn't load. */
  savesError: unknown;
}

const CLASS_FORMS: Record<BaseRules, ClassForms> = {
  "Dungeons & Dragons: 3.5": {
    allLevelSaves,
    emptyClass: EMPTY_CLASS,
    NewClassLevelFields,
    nextClassLevel,
    toClassForm,
  },
};

/** What a class's page edits by its ruleset's base rules, which the ruleset's own folders hold. */
export function getClassForms(baseRules: BaseRules): ClassForms {
  return CLASS_FORMS[baseRules];
}
