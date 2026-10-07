import type { ComponentType } from "react";

import type { BaseRules } from "@/shared/enums.ts";

import {
  AddAttributeStep,
  type AddAttributeStepProps,
  AddClassPlanStep,
  type AddClassPlanStepProps,
  AddHpStep,
  type AddHpStepProps,
  AddReviewStep,
  type AddReviewStepProps,
  EditAttributeStep,
  type EditAttributeStepProps,
  EditHpStep,
  type EditHpStepProps,
  EditReviewStep,
  type EditReviewStepProps,
  FeatsStep,
  type FeatsStepProps,
  SkillsStep,
  type SkillsStepProps,
  SpellsStep,
  type SpellsStepProps,
} from "./dnd3.5/index.ts";

/**
 * The steps of a base rules' level wizards: Add Level's own (`Add…`), Edit Level's (`Edit…`), and those both show. A
 * key names its slot as the schema does, a power, and its base rules' step names it its way (3.5's `SpellsStep`), as the
 * sheet's `PowersSection` does. Each step takes the wizard state it reads as `wizard`, which both wizards hand over.
 */
interface SectionMap {
  AddAttributeStep: ComponentType<AddAttributeStepProps>;
  AddClassPlanStep: ComponentType<AddClassPlanStepProps>;
  AddHpStep: ComponentType<AddHpStepProps>;
  AddReviewStep: ComponentType<AddReviewStepProps>;
  EditAttributeStep: ComponentType<EditAttributeStepProps>;
  EditHpStep: ComponentType<EditHpStepProps>;
  EditReviewStep: ComponentType<EditReviewStepProps>;
  FeatsStep: ComponentType<FeatsStepProps>;
  PowersStep: ComponentType<SpellsStepProps>;
  SkillsStep: ComponentType<SkillsStepProps>;
}

const RULESET_SECTIONS: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    AddAttributeStep,
    AddClassPlanStep,
    AddHpStep,
    AddReviewStep,
    EditAttributeStep,
    EditHpStep,
    EditReviewStep,
    FeatsStep,
    PowersStep: SpellsStep,
    SkillsStep,
  },
};

export function getLevelUpSections(baseRules: BaseRules): SectionMap {
  return RULESET_SECTIONS[baseRules];
}
