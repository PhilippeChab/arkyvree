import { EquipmentSection } from "@/client/src/components/characters/sections/EquipmentSection.tsx";
import { FeatsSection } from "@/client/src/components/characters/sections/FeatsSection.tsx";
import { ReadOnlyEquipmentSection } from "@/client/src/components/characters/sections/ReadOnlyEquipmentSection.tsx";
import type { SheetSectionsProps } from "@/client/src/components/characters/sections/sectionFactory.ts";

import { AbilityScoresSection } from "./AbilityScoresSection.tsx";
import { BondedCreature } from "./BondedCreature.tsx";
import { CombatSection, type SheetCombat } from "./CombatSection.tsx";
import { Encumbrance } from "./Encumbrance.tsx";
import { SavingThrowsSection } from "./SavingThrowsSection.tsx";
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
  const combat: SheetCombat = character.combat;
  const load = combat.encumbrance && <Encumbrance encumbrance={combat.encumbrance} />;
  // The bonded creatures, by the feat that bonds each
  const bondedByFeat = new Map(Object.values(character.bonded).map((creature) => [creature.bondFeatId, creature]));

  return (
    <>
      <AbilityScoresSection abilities={character.abilities} characterId={characterId} readOnly={readOnly} />

      <SavingThrowsSection saves={character.saves} />

      <CombatSection combat={combat} />

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
