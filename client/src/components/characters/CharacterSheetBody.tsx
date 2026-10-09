import { Stack } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { getSections } from "./sectionFactory.ts";
import type { SheetCombat } from "./sections/dnd3.5/index.ts";
import {
  type CharacterData,
  CharacterIdentitySection,
  ClassesSection,
  DiagnosticsSection,
  type EditingLevel,
  EquipmentSection,
  FeatsSection,
  ReadOnlyEquipmentSection,
} from "./sections/index.ts";

interface CharacterSheetBodyProps {
  /** The bonded creatures' names link to their sheets: the owner's view. */
  bondedLinkable?: boolean;
  character: CharacterData;
  characterId: string;
  /** The owner's view only: the character's diagnostics, shown under the sheet. */
  diagnostics?: Pick<CharacterDetail, "validation" | "requirements" | "modifiers">;
  equipmentMode: "editable" | "readonly";
  identityReadOnly?: boolean;
  onAddLevel?: () => void;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onRemoveLevel?: () => void;
  partial?: boolean;
  /** The portrait can't be changed; defaults to the identity's read-only state. */
  portraitReadOnly?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views. */
  portraitUrl?: string | null;
  readOnly?: boolean;
  rulesetId?: string;
  /** The viewer receives the private notes: the character's editors, and its campaign's Game Master. */
  showPrivateNotes?: boolean;
}

export function CharacterSheetBody({
  character,
  characterId,
  readOnly = false,
  identityReadOnly,
  portraitReadOnly,
  partial = false,
  onEditLevel,
  onAddLevel,
  onRemoveLevel,
  bondedLinkable = false,
  equipmentMode,
  rulesetId,
  diagnostics,
  portraitUrl,
  showPrivateNotes,
}: CharacterSheetBodyProps) {
  const combat: SheetCombat = character.combat;
  const encumbrance = combat.encumbrance;
  const baseRules = character.baseRules ?? DEFAULT_BASE_RULES;
  const sections = getSections(baseRules);
  const bondedByFeat = sections.bondedFeats(character.bonded);

  return (
    <Stack spacing={3}>
      <CharacterIdentitySection
        characterId={characterId}
        rulesetId={rulesetId}
        character={character}
        readOnly={identityReadOnly ?? readOnly}
        portraitReadOnly={portraitReadOnly}
        partial={partial}
        portraitUrl={portraitUrl}
        showPrivateNotes={showPrivateNotes}
      />

      {!partial && (
        <>
          <sections.AbilityScoresSection
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

          <sections.CombatAndSavesSection combat={combat} saves={character.saves} />

          <sections.WeaponsSection combat={combat} />

          <sections.SkillsSection skills={character.skills} />

          <FeatsSection
            classes={character.classes}
            virtualFeats={character.virtualFeats}
            rulesetId={rulesetId}
            renderFeatExtra={(feat) => {
              const bonded = bondedByFeat.get(feat.name);
              return (
                bonded && <sections.BondedCreature bonded={bonded} baseRules={baseRules} linkable={bondedLinkable} />
              );
            }}
          />

          {/* A Partial character's powers are [] (`partial` already leaves them out): this narrows them to the record PowersSection takes */}
          {!Array.isArray(character.powers) && (
            <sections.PowersSection
              classes={character.classes}
              powers={character.powers}
              virtualPowers={character.virtualPowers}
              aptitudes={character.aptitudes}
              spellTags={character.spellTags}
              spellTagLists={character.spellTagLists}
              rulesetId={rulesetId}
            />
          )}

          {equipmentMode === "editable" && rulesetId ? (
            <EquipmentSection
              characterId={characterId}
              rulesetId={rulesetId}
              readOnly={readOnly}
              encumbrance={encumbrance}
            />
          ) : (
            <ReadOnlyEquipmentSection equipment={character.equipment} encumbrance={encumbrance} />
          )}

          {diagnostics && Object.values(character.classes).some((cls) => cls.levels.length > 0) && (
            <DiagnosticsSection
              validation={diagnostics.validation}
              requirements={diagnostics.requirements}
              modifiers={diagnostics.modifiers}
            />
          )}
        </>
      )}
    </Stack>
  );
}
