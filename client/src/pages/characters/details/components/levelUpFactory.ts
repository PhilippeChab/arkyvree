import type { ComponentType } from "react";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AddLevelDialog, EditLevelDialog } from "./dnd3.5/index.ts";
import type { HpLevel, SpentSkill } from "./levelUp/index.ts";

/**
 * A base rules' level wizards: the Add Level and Edit Level dialogs, each its hook on the generic ones (`levelUp/`:
 * Add Level's plan, `useAddLevelPlan`, or Edit Level's level, `useEditedLevel`; then what its ruleset answers of it,
 * `PreviewAnswers` or `EditAnswers`, to `useAddLevelWizardBase` or `useEditLevelWizardBase`), and its steps' components
 * by the name it lists each by (those the ruleset lists for a level, `GET level-steps`, among the wizard's own), which
 * `LevelWizardDialog` shows.
 */
interface LevelWizards {
  AddLevelDialog: ComponentType<AddLevelDialogProps>;
  EditLevelDialog: ComponentType<EditLevelDialogProps>;
}

/** What a character's sheet passes its Add Level dialog: the character it levels, and the dialog's own state. */
export interface AddLevelDialogProps {
  /** The character's, which its steps read (the order of its abilities) */
  baseRules: BaseRules;
  characterId: string;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

/**
 * What a ruleset's steps answer of the level Edit Level edits (`useEditedLevel`'s), which it keeps its picks by and
 * waits for.
 */
export interface EditAnswers extends PickAnswers {
  /** The answers its save takes are in: the picks are saved as they fit */
  complete: boolean;
  /** Next waits: an answer it waits for loads, or the step shown has none */
  waiting: boolean;
}

/** What a character's sheet passes its Edit Level dialog: Add Level's, and the level it edits. */
export interface EditLevelDialogProps extends AddLevelDialogProps {
  editingLevel: EditingLevel;
}

/** What a level wizard's step takes: the wizard's state, and the character it levels, of its base rules. */
export interface LevelStepProps<W> {
  baseRules: BaseRules;
  characterId: string;
  wizard: W;
}

/**
 * What a ruleset answers of the picks so far, which a level wizard keeps them by (`fitPicks.ts`): the feat pools' room,
 * what of the feats and powers picked fits, and what the skill points come to.
 */
export interface PickAnswers {
  /** Each feat pool's room for the feats picked: one with none left closes its picker */
  featPools: Record<string, { available: number }>;
  /** What of the feats picked fits their pools, each pool's ids: none while the answer is for earlier picks */
  fittedFeats: Record<string, string[]> | undefined;
  /** What of the powers picked fits their pools, each pool's ids: none while the answer is for earlier picks */
  fittedPowers: Record<string, string[]> | undefined;
  /** The skills the points are spent on, each with its ranks by points: none until they load */
  skills: SpentSkill[] | undefined;
}

/** A planned level, as a ruleset's preview lists it: its class's level, and the hit points it may gain. */
export interface PlannedLevelDetail extends Pick<HpLevel, "hd" | "hitPoints"> {
  klassId: string;
  klassLevelId: string;
  klassName: string;
  level: number;
}

/**
 * What a ruleset's preview answers of Add Level's plan (`useAddLevelPlan`'s), which it keeps its levels and its picks
 * by.
 */
export interface PreviewAnswers extends PickAnswers {
  /** The planned levels that take an ability increase, by their place in the plan */
  abilityIncreaseLevels: number[];
  /** The planned levels, in plan order: none until the preview loads */
  levelDetails: PlannedLevelDetail[] | undefined;
  /**
   * The planned level each pool's next pick lands on, by its place: a feat pool's, and a power pool's at each spell
   * level and at any (`""`). None until the preview loads.
   */
  nextPickLevels: { feats: Record<string, number>; powers: Record<string, Record<string, number>> } | undefined;
}

const RULESET_WIZARDS: Record<BaseRules, LevelWizards> = {
  "Dungeons & Dragons: 3.5": { AddLevelDialog, EditLevelDialog },
};

export function getLevelWizards(baseRules: BaseRules): LevelWizards {
  return RULESET_WIZARDS[baseRules];
}
