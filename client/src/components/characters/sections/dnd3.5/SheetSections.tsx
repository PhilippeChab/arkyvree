import type { SheetSectionsProps } from "@/client/src/components/characters/sections/sectionFactory.ts";
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
  return character.blocks.map((block) => (
    <SheetBlockView
      key={block.key}
      block={block}
      characterId={characterId}
      inventoryMode={equipmentMode}
      readOnly={readOnly}
      rulesetId={rulesetId}
      subsheetsLinkable={bondedLinkable}
    />
  ));
}
