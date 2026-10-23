import { BondedCreature } from "@/client/src/components/characters/sections/BondedCreature.tsx";
import { Encumbrance } from "@/client/src/components/characters/sections/Encumbrance.tsx";
import { EquipmentSection } from "@/client/src/components/characters/sections/EquipmentSection.tsx";
import { FeatsSection } from "@/client/src/components/characters/sections/FeatsSection.tsx";
import { ReadOnlyEquipmentSection } from "@/client/src/components/characters/sections/ReadOnlyEquipmentSection.tsx";
import { ScoresSection } from "@/client/src/components/characters/sections/ScoresSection.tsx";
import type { SheetSectionsProps } from "@/client/src/components/characters/sections/sectionFactory.ts";
import { blockOf } from "@/client/src/components/characters/sections/sheetBlocks.ts";
import { StatsSection } from "@/client/src/components/characters/sections/StatsSection.tsx";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { SkillsSection } from "./SkillsSection.tsx";
import { SpellsSection } from "./SpellsSection.tsx";

/**
 * A 3.5 sheet's sections, under its identity: its abilities, its saving throws, its combat (its weapon sets in it), its
 * skills, its feats with the creatures they bond, its spells, and its equipment with the load it carries.
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
  // The bonded creatures, by the feat that bonds each
  const bondedByFeat = new Map(Object.values(character.bonded).map((creature) => [creature.bondFeatId, creature]));
  const abilities = blockOf(character.blocks, "scores", "abilities");
  const saves = blockOf(character.blocks, "scores", "saves");
  const combatBlock = blockOf(character.blocks, "stats", "combat");

  return (
    <>
      {abilities && <ScoresSection block={abilities} characterId={characterId} readOnly={readOnly} />}

      {saves && <ScoresSection block={saves} characterId={characterId} readOnly={readOnly} />}

      {combatBlock && <StatsSection block={combatBlock} />}

      <SkillsSection skills={character.skills} />

      <FeatsSection
        classes={character.classes}
        virtualFeats={character.virtualFeats}
        rulesetId={rulesetId}
        renderFeatExtra={(feat) => {
          const bonded = bondedByFeat.get(feat.id);
          return bonded && <BondedCreature bonded={bonded} linkable={bondedLinkable} />;
        }}
      />

      <SpellsSection spellGroups={character.spellGroups} spellsPerDay={character.spellsPerDay} rulesetId={rulesetId} />

      {equipmentMode === "editable" && rulesetId ? (
        <EquipmentSection characterId={characterId} rulesetId={rulesetId} readOnly={readOnly} load={load} />
      ) : (
        <ReadOnlyEquipmentSection equipment={character.equipment} load={load} rulesetId={rulesetId} />
      )}
    </>
  );
}
