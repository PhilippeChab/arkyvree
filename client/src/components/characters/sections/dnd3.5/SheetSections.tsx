import type { SheetSectionsProps } from "@/client/src/components/characters/sections/sectionFactory.ts";
import { openingBlock } from "@/client/src/components/characters/sections/sheetBlocks.ts";
import { SheetBlockView } from "@/client/src/components/characters/sections/SheetBlockView.tsx";

/**
 * A 3.5 sheet's sections, under its identity: the blocks it describes, in its order (its abilities, its saving throws,
 * its combat with its weapon sets, its skills, its feats with the creatures they bond, its spells, and its equipment with
 * the load it carries).
 */
export function SheetSections({
  character,
  characterId,
  readOnly,
  bondedLinkable,
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
        subsheetsLinkable={bondedLinkable}
      />
    ));
}
