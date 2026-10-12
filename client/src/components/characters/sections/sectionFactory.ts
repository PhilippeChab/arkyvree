import type { InferResponseType } from "hono/client";
import type { ComponentType } from "react";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { SheetSections } from "./dnd3.5/index.ts";

/** What a sheet's base rules give it: its sections under its identity, which they lay out in their order. */
interface RulesetSheet {
  /** The sheet's sections: 3.5's abilities, saving throws, combat, skills, feats, spells and equipment */
  SheetSections: ComponentType<SheetSectionsProps>;
}

type CampaignCharacterData = InferResponseType<
  (typeof rpc.api.campaigns)[":id"]["characters"][":characterId"]["$get"],
  200
>;

type SharedCharacterData = InferResponseType<(typeof rpc.api.shared.characters)[":shareToken"]["$get"], 200>;

/** What a sheet passes its base rules' sections: the character, and what its viewer may do there. */
export interface SheetSectionsProps {
  /** The bonded creatures' names link to their sheets: the owner's view. */
  bondedLinkable: boolean;
  character: CharacterData;
  characterId: string;
  /** Who may change the inventory edits it; a read-only sheet lists the character's equipment as it is. */
  equipmentMode: "editable" | "readonly";
  readOnly: boolean;
  rulesetId?: string;
}

/**
 * A character sheet's data, which its identity and its sections show: the owner's view, a campaign member's, or a share
 * link's.
 */
export type CharacterData = CharacterDetail | CampaignCharacterData | SharedCharacterData;

const RULESET_SHEETS: Record<BaseRules, RulesetSheet> = {
  "Dungeons & Dragons: 3.5": { SheetSections },
};

export function getSections(baseRules: BaseRules): RulesetSheet {
  return RULESET_SHEETS[baseRules];
}
