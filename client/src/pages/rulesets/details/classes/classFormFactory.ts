import type { ComponentType } from "react";

import {
  allLevelSaves,
  ClassFormFields,
  type ClassFormFieldsProps,
  ClassLevelFields,
  type ClassLevelFieldsProps,
  EMPTY_CLASS,
  nextClassLevel,
  toClassForm,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type { ClassFormData } from "./classSectionQueries.ts";

/** What a class's page edits by its ruleset's base rules: a class's form and a class level's. */
interface ClassForms {
  /** Every ruleset save with its base at a level, as the level endpoints take them. */
  allLevelSaves: typeof allLevelSaves;
  /** A class's fields: its page's editor's and its create dialog's. */
  ClassFormFields: ComponentType<ClassFormFieldsProps>;
  /** A class level's fields: its create dialog's and its editor's. */
  ClassLevelFields: ComponentType<ClassLevelFieldsProps>;
  /** A class's form before its class loads. */
  emptyClass: ClassFormData;
  /** A class's next level, which its create dialog opens on. */
  nextClassLevel: typeof nextClassLevel;
  /** An existing class's form values. */
  toClassForm: typeof toClassForm;
}

const CLASS_FORMS: Record<BaseRules, ClassForms> = {
  "Dungeons & Dragons: 3.5": {
    allLevelSaves,
    ClassFormFields,
    ClassLevelFields,
    emptyClass: EMPTY_CLASS,
    nextClassLevel,
    toClassForm,
  },
};

/** What a class's page edits by its ruleset's base rules, which the ruleset's forms folder holds. */
export function getClassForms(baseRules: BaseRules): ClassForms {
  return CLASS_FORMS[baseRules];
}
