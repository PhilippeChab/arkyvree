import type { ComponentType } from "react";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AddLevelDialog, EditLevelDialog } from "./dnd3.5/index.ts";

/**
 * A base rules' level wizards: the Add Level and Edit Level dialogs, each driving its steps (those the ruleset lists for
 * a level, `GET level-steps`, among the wizard's own) by its own hook, in `LevelWizardDialog`.
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

/** What a character's sheet passes its Edit Level dialog: Add Level's, and the level it edits. */
export interface EditLevelDialogProps extends AddLevelDialogProps {
  editingLevel: EditingLevel;
}

const RULESET_WIZARDS: Record<BaseRules, LevelWizards> = {
  "Dungeons & Dragons: 3.5": { AddLevelDialog, EditLevelDialog },
};

export function getLevelWizards(baseRules: BaseRules): LevelWizards {
  return RULESET_WIZARDS[baseRules];
}
