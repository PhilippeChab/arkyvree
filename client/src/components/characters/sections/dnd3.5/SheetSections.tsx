import { Encumbrance } from "@/client/src/components/characters/sections/Encumbrance.tsx";
import { EquipmentSection } from "@/client/src/components/characters/sections/EquipmentSection.tsx";
import { ReadOnlyEquipmentSection } from "@/client/src/components/characters/sections/ReadOnlyEquipmentSection.tsx";
import type { SheetSectionsProps } from "@/client/src/components/characters/sections/sectionFactory.ts";
import { SheetBlockView } from "@/client/src/components/characters/sections/SheetBlockView.tsx";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

/**
 * A 3.5 sheet's sections, under its identity: the blocks it describes, in its order (its abilities, its saving throws,
 * its combat with its weapon sets, its skills, its feats with the creatures they bond, its spells), then its equipment
 * with the load it carries.
 */
export function SheetSections({
  character,
  characterId,
  readOnly,
  bondedLinkable,
  equipmentMode,
  rulesetId,
}: SheetSectionsProps) {
  // A partial sheet carries no combat
  const combat: Partial<CharacterDetail["combat"]> = character.combat;
  const load = combat.load && <Encumbrance load={combat.load} />;

  return (
    <>
      {character.blocks.map((block) => (
        <SheetBlockView
          key={block.key}
          block={block}
          characterId={characterId}
          readOnly={readOnly}
          rulesetId={rulesetId}
          subsheetsLinkable={bondedLinkable}
        />
      ))}

      {equipmentMode === "editable" && rulesetId ? (
        <EquipmentSection characterId={characterId} rulesetId={rulesetId} readOnly={readOnly} load={load} />
      ) : (
        <ReadOnlyEquipmentSection equipment={character.equipment} load={load} rulesetId={rulesetId} />
      )}
    </>
  );
}
