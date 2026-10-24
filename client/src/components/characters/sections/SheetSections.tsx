import type { InferResponseType } from "hono/client";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { openingBlock } from "./sheetBlocks.ts";
import { SheetBlockView } from "./SheetBlockView.tsx";

/** What a sheet passes its sections: the character, and what its viewer may do there. */
interface SheetSectionsProps {
  character: CharacterData;
  characterId: string;
  /** Who may change the inventory edits it; a read-only sheet lists the character's equipment as it is. */
  equipmentMode: "editable" | "readonly";
  readOnly: boolean;
  rulesetId?: string;
  /** The names of the characters under it (its subsheets) link to their sheets: the owner's view. */
  subsheetsLinkable: boolean;
}

type CampaignCharacterData = InferResponseType<
  (typeof rpc.api.campaigns)[":id"]["characters"][":characterId"]["$get"],
  200
>;

type SharedCharacterData = InferResponseType<(typeof rpc.api.shared.characters)[":shareToken"]["$get"], 200>;

/**
 * A character sheet's data, which its identity and its sections show: the owner's view, a campaign member's, or a share
 * link's.
 */
export type CharacterData = CharacterDetail | CampaignCharacterData | SharedCharacterData;

/**
 * A sheet's sections, under its identity: the blocks its ruleset describes, in its order (3.5's abilities, saving
 * throws, combat with its weapon sets, skills, feats with the creatures they bond, spells, and equipment with the load
 * it carries), each rendered by its kind.
 */
export function SheetSections({
  character,
  characterId,
  readOnly,
  subsheetsLinkable,
  equipmentMode,
  rulesetId,
}: SheetSectionsProps) {
  // The block the sheet opens with is over them
  const opening = openingBlock(character.blocks);
  return character.blocks
    .filter((block) => block !== opening)
    .map((block) => (
      <SheetBlockView
        key={block.key}
        block={block}
        characterId={characterId}
        updatedAt={character.updatedAt}
        inventoryMode={equipmentMode}
        readOnly={readOnly}
        rulesetId={rulesetId}
        subsheetsLinkable={subsheetsLinkable}
      />
    ));
}
