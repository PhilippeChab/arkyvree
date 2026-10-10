import { ClassesSection } from "@/client/src/components/characters/sections/ClassesSection.tsx";
import { EquipmentSection } from "@/client/src/components/characters/sections/EquipmentSection.tsx";
import { FeatsSection } from "@/client/src/components/characters/sections/FeatsSection.tsx";
import { ReadOnlyEquipmentSection } from "@/client/src/components/characters/sections/ReadOnlyEquipmentSection.tsx";
import type { SheetSectionsProps } from "@/client/src/components/characters/sections/sectionFactory.ts";

import { AbilityScoresSection } from "./AbilityScoresSection.tsx";
import { BondedCreature } from "./BondedCreature.tsx";
import { CombatAndSavesSection, type SheetCombat } from "./CombatAndSavesSection.tsx";
import { Encumbrance } from "./Encumbrance.tsx";
import { SkillsSection } from "./SkillsSection.tsx";
import { SpellsSection } from "./SpellsSection.tsx";
import { WeaponsSection } from "./WeaponsSection.tsx";

/**
 * A 3.5 sheet's sections, under its identity: its abilities, its classes, its combat and saves, its weapons, its skills,
 * its feats with the creatures they bond, its spells, and its equipment with the load it carries.
 */
export function SheetSections({
  character,
  characterId,
  readOnly,
  onEditLevel,
  onAddLevel,
  onRemoveLevel,
  bondedLinkable,
  equipmentMode,
  rulesetId,
}: SheetSectionsProps) {
  // A partial sheet carries no combat
  const combat: SheetCombat = character.combat;
  const load = combat.encumbrance && <Encumbrance encumbrance={combat.encumbrance} />;
  const { baseRules } = character;
  // The bonded creatures, by the feat that bonds each
  const bondedByFeat = new Map(Object.values(character.bonded).map((creature) => [creature.bondFeatId, creature]));

  return (
    <>
      <AbilityScoresSection
        abilities={character.abilities}
        baseRules={baseRules}
        characterId={characterId}
        readOnly={readOnly}
      />

      <ClassesSection
        classes={character.classes}
        rulesetId={rulesetId}
        onEditLevel={onEditLevel}
        onAddLevel={onAddLevel}
        onRemoveLevel={onRemoveLevel}
        readOnly={readOnly}
      />

      <CombatAndSavesSection combat={combat} saves={character.saves} />

      <WeaponsSection combat={combat} />

      <SkillsSection skills={character.skills} />

      <FeatsSection
        classes={character.classes}
        virtualFeats={character.virtualFeats}
        rulesetId={rulesetId}
        renderFeatExtra={(feat) => {
          const bonded = bondedByFeat.get(feat.id);
          return bonded && <BondedCreature bonded={bonded} baseRules={baseRules} linkable={bondedLinkable} />;
        }}
      />

      <SpellsSection spellGroups={character.spellGroups} rulesetId={rulesetId} />

      {equipmentMode === "editable" && rulesetId ? (
        <EquipmentSection characterId={characterId} rulesetId={rulesetId} readOnly={readOnly} load={load} />
      ) : (
        <ReadOnlyEquipmentSection equipment={character.equipment} load={load} />
      )}
    </>
  );
}
