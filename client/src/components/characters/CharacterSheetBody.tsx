import { Stack } from "@mui/material";

import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";
import { BONDED_KIND_BY_SLUG, BONDED_KIND_SLUGS } from "@/shared/dnd3.5/bondedKinds.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { getSections } from "./sectionFactory.ts";
import type { SheetCombat } from "./sections/dnd3.5/index.ts";
import {
  type CharacterData,
  CharacterIdentitySection,
  ClassesSection,
  DiagnosticsSection,
  EquipmentSection,
  FeatsSection,
  ReadOnlyEquipmentSection,
  WeaponsSection,
} from "./sections/index.ts";

interface CharacterSheetBodyProps {
  character: CharacterData;
  characterId: string;
  readOnly?: boolean;
  identityReadOnly?: boolean;
  /** The portrait can't be changed; defaults to the identity's read-only state. */
  portraitReadOnly?: boolean;
  partial?: boolean;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onAddLevel?: () => void;
  onRemoveLevel?: () => void;
  onViewBondedSheet?: (bondedId: string) => void;
  equipmentMode: "editable" | "readonly";
  rulesetId?: string;
  /** The owner's view only: the character's diagnostics, shown under the sheet. */
  diagnostics?: Pick<CharacterDetail, "validation" | "requirements" | "modifiers">;
  /** Pre-resolved portrait URL for unauthenticated views. */
  portraitUrl?: string | null;
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
  onViewBondedSheet,
  equipmentMode,
  rulesetId,
  diagnostics,
  portraitUrl,
}: CharacterSheetBodyProps) {
  const abilities = character.abilities || {};
  const saves = character.savingThrows || {};
  const combat: SheetCombat = character.combat || {};
  const encumbrance = combat.encumbrance;
  const sections = getSections(character.baseRules ?? DEFAULT_BASE_RULES);

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
      />

      {!partial && (
        <>
          <sections.AbilityScoresSection abilities={abilities} characterId={characterId} readOnly={readOnly} />

          <ClassesSection
            classes={character.classes || {}}
            rulesetId={rulesetId}
            onEditLevel={onEditLevel}
            onAddLevel={onAddLevel}
            onRemoveLevel={onRemoveLevel}
            readOnly={readOnly}
          />

          <sections.CombatAndSavesSection combat={combat} saves={saves} />

          <WeaponsSection combat={combat} />

          <sections.SkillsSection skills={character.skills || {}} />

          <FeatsSection
            classes={character.classes || {}}
            virtualFeats={character.virtualFeats}
            rulesetId={rulesetId}
            renderFeatExtra={(() => {
              const bondedMap = "bonded" in character ? character.bonded : null;
              if (!bondedMap) return undefined;
              const matches: { suffix: string; bonded: NonNullable<(typeof bondedMap)[string]> }[] = [];
              for (const [kind, bonded] of Object.entries(bondedMap)) {
                if (!bonded) continue;
                const bondedKind = oneOf(kind, BONDED_KIND_SLUGS);
                if (!bondedKind) continue;
                const suffix = BONDED_KIND_BY_SLUG[bondedKind].label;
                matches.push({ suffix, bonded });
              }
              if (matches.length === 0) return undefined;
              return (feat) => {
                for (const { suffix, bonded } of matches) {
                  const raceName = bonded.identity?.physiology?.race?.name;
                  if (raceName && feat.name === `${raceName} ${suffix}`)
                    return <sections.BondedSection bonded={bonded} linkable={!!onViewBondedSheet} />;
                }
                return null;
              };
            })()}
          />

          {/* The campaign endpoint returns powers as [] for partial visibility — guard against that since PowersSection expects a record */}
          {!Array.isArray(character.powers) && (
            <sections.PowersSection
              classes={character.classes || {}}
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
              isArchived={readOnly}
              isCustomRuleset={"isCustomRuleset" in character && !!character.isCustomRuleset}
              encumbrance={encumbrance}
            />
          ) : (
            <ReadOnlyEquipmentSection equipment={character.equipment || []} encumbrance={encumbrance} />
          )}

          {diagnostics && Object.values(character.classes || {}).some((cls) => cls.levels.length > 0) && (
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
