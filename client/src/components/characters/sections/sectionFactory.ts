import type { ComponentType } from "react";

import type { BaseRules } from "@/shared/enums.ts";

import type { CharacterData } from "./CharacterIdentitySection.tsx";
import type { EditingLevel } from "./ClassesSection.tsx";
import { SheetSections } from "./dnd3.5/index.ts";

/** What a sheet's base rules give it: its sections under its identity, which they lay out in their order. */
interface RulesetSheet {
  /** The sheet's sections: 3.5's abilities, classes, combat and saves, weapons, skills, feats, spells and equipment */
  SheetSections: ComponentType<SheetSectionsProps>;
}

/** What a sheet passes its base rules' sections: the character, and what its viewer may do there. */
export interface SheetSectionsProps {
  /** The bonded creatures' names link to their sheets: the owner's view. */
  bondedLinkable: boolean;
  character: CharacterData;
  characterId: string;
  /** Who may change the inventory edits it; a read-only sheet lists the character's equipment as it is. */
  equipmentMode: "editable" | "readonly";
  onAddLevel?: () => void;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onRemoveLevel?: () => void;
  readOnly: boolean;
  rulesetId?: string;
}

const RULESET_SHEETS: Record<BaseRules, RulesetSheet> = {
  "Dungeons & Dragons: 3.5": { SheetSections },
};

export function getSections(baseRules: BaseRules): RulesetSheet {
  return RULESET_SHEETS[baseRules];
}
