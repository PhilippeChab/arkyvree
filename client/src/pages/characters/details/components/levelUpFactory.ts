import type { ComponentType } from "react";

import type { BaseRules } from "@/shared/enums.ts";

import {
  AddAbilityStep,
  AddClassPlanStep,
  AddReviewStep,
  EditAbilityStep,
  EditReviewStep,
  FeatsStep,
  HpStep,
  SkillsStep,
  SpellsStep,
} from "./dnd3.5/index.ts";
import {
  type AddLevelWizard,
  type EditLevelWizard,
  useAddLevelWizard,
  useEditLevelWizard,
} from "./dnd3.5/levelUp/index.ts";

/** What a level wizard's step takes: the wizard's state, and the character it levels, of its base rules. */
interface LevelStepProps<W> {
  baseRules: BaseRules;
  characterId: string;
  wizard: W;
}

/**
 * A base rules' level wizards: the hooks that drive Add Level and Edit Level, and each one's steps by the name its hook
 * lists them by (those the ruleset lists for a level, `GET level-steps`, and the wizard's own around them), which the
 * dialogs render one at a time. A second base rules makes this a union of each one's.
 */
interface LevelWizards {
  addSteps: Record<AddLevelWizard["steps"][number]["name"], ComponentType<LevelStepProps<AddLevelWizard>>>;
  editSteps: Record<EditLevelWizard["steps"][number]["name"], ComponentType<LevelStepProps<EditLevelWizard>>>;
  useAddLevelWizard: typeof useAddLevelWizard;
  useEditLevelWizard: typeof useEditLevelWizard;
}

const RULESET_WIZARDS: Record<BaseRules, LevelWizards> = {
  "Dungeons & Dragons: 3.5": {
    addSteps: {
      "class-plan": AddClassPlanStep,
      hp: HpStep,
      abilities: AddAbilityStep,
      skills: SkillsStep,
      feats: FeatsStep,
      powers: SpellsStep,
      review: AddReviewStep,
    },
    editSteps: {
      hp: HpStep,
      abilities: EditAbilityStep,
      skills: SkillsStep,
      feats: FeatsStep,
      powers: SpellsStep,
      review: EditReviewStep,
    },
    useAddLevelWizard,
    useEditLevelWizard,
  },
};

export function getLevelWizards(baseRules: BaseRules): LevelWizards {
  return RULESET_WIZARDS[baseRules];
}
