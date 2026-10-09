import type { ComponentType } from "react";

import type { BaseRules } from "@/shared/enums.ts";

import {
  AddAbilityStep,
  type AddAbilityStepProps,
  AddClassPlanStep,
  type AddClassPlanStepProps,
  AddReviewStep,
  type AddReviewStepProps,
  EditAbilityStep,
  type EditAbilityStepProps,
  EditReviewStep,
  type EditReviewStepProps,
  FeatsStep,
  type FeatsStepProps,
  HpStep,
  type HpStepProps,
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
  AddAbilityStep: ComponentType<AddAbilityStepProps>;
  AddClassPlanStep: ComponentType<AddClassPlanStepProps>;
  AddReviewStep: ComponentType<AddReviewStepProps>;
  EditAbilityStep: ComponentType<EditAbilityStepProps>;
  EditReviewStep: ComponentType<EditReviewStepProps>;
  FeatsStep: ComponentType<FeatsStepProps>;
  HpStep: ComponentType<HpStepProps>;
  PowersStep: ComponentType<SpellsStepProps>;
  SkillsStep: ComponentType<SkillsStepProps>;
}

const RULESET_SECTIONS: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    AddAbilityStep,
    AddClassPlanStep,
    AddReviewStep,
    EditAbilityStep,
    EditReviewStep,
    FeatsStep,
    HpStep,
    PowersStep: SpellsStep,
    SkillsStep,
  },
};

export function getLevelUpSections(baseRules: BaseRules): SectionMap {
  return RULESET_SECTIONS[baseRules];
}
