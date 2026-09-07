import type { ComponentProps } from "react";
import type { InferResponseType } from "hono/client";
import type { RPC } from "@/client/src/services/rpc.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";
import { getSections } from "./sectionFactory.ts";
import {
  CharacterIdentitySection,
  ClassesSection,
  DiagnosticsSection,
  EquipmentSection,
  FeatsSection,
  ReadOnlyEquipmentSection,
  WeaponsSection,
} from "./sections/index.ts";
import { Stack } from "@mui/material";
import { BONDED_LABEL_BY_KIND } from "@/shared/dnd3.5/bondedKinds.ts";

type OwnerCharacterData = InferResponseType<RPC["api"]["characters"][":id"]["$get"], 200>;
type CampaignCharacterData = InferResponseType<RPC["api"]["campaigns"][":id"]["characters"][":characterId"]["$get"], 200>;
type SharedCharacterData = InferResponseType<RPC["api"]["shared"]["characters"][":shareToken"]["$get"], 200>;

export type CharacterData = OwnerCharacterData | Exclude<CampaignCharacterData, { error: string }> | Exclude<SharedCharacterData, { error: string }>;

type CharacterSheetBodyProps = {
  character: CharacterData;
  characterId: string;
  readOnly?: boolean;
  identityReadOnly?: boolean;
  partial?: boolean;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onAddLevel?: () => void;
  onRemoveLevel?: () => void;
  onViewBondedSheet?: (bondedId: string) => void;
  equipmentMode: "editable" | "readonly";
  rulesetId?: string;
  showDiagnostics?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views. */
  portraitUrl?: string | null;
};

export function CharacterSheetBody({
  character,
  characterId,
  readOnly = false,
  identityReadOnly,
  partial = false,
  onEditLevel,
  onAddLevel,
  onRemoveLevel,
  onViewBondedSheet,
  equipmentMode,
  rulesetId,
  showDiagnostics = false,
  portraitUrl,
}: CharacterSheetBodyProps) {
  const abilities = character.abilities || {};
  const saves = character.savingThrows || {};
  const combat = character.combat || {};
  const encumbrance = (combat as { encumbrance?: { carriedweight?: number; lightload?: number; mediumload?: number; heavyload?: number; load?: string } })?.encumbrance;
  const sections = getSections(character.baseRules!);

  return (
    <Stack spacing={3}>
      <CharacterIdentitySection
        characterName={character.identity?.physiology?.name || ""}
        characterId={characterId}
        rulesetId={rulesetId}
        character={character}
        readOnly={identityReadOnly ?? readOnly}
        partial={partial}
        portraitUrl={portraitUrl}
      />

      {!partial && (
        <>
          <sections.AbilityScoresSection
            abilities={abilities}
            characterId={characterId}
            readOnly={readOnly}
          />

          <ClassesSection
            classes={character.classes || {}}
            rulesetId={rulesetId}
            onEditLevel={onEditLevel}
            onAddLevel={onAddLevel}
            onRemoveLevel={onRemoveLevel}
            readOnly={readOnly}
          />

          <sections.CombatAndSavesSection
            combat={combat}
            saves={saves}
          />

          <WeaponsSection combat={combat} />

          <sections.SkillsSection skills={character.skills || {}} />

          <FeatsSection
            classes={character.classes || {}}
            virtualFeats={character.virtualFeats}
            rulesetId={rulesetId}
            renderFeatExtra={(() => {
              const bondedMap = "bonded" in character ? character.bonded : null;
              if (!bondedMap) return undefined;
              const matches: { suffix: string; bonded: NonNullable<typeof bondedMap[string]> }[] = [];
              for (const [kind, bonded] of Object.entries(bondedMap)) {
                if (!bonded) continue;
                const suffix = BONDED_LABEL_BY_KIND[kind as keyof typeof BONDED_LABEL_BY_KIND];
                if (!suffix) continue;
                matches.push({ suffix, bonded });
              }
              if (matches.length === 0) return undefined;
              return (feat) => {
                for (const { suffix, bonded } of matches) {
                  const raceName = bonded.identity?.physiology?.race?.name;
                  if (raceName && feat.name === `${raceName} ${suffix}`) {
                    return (
                      <sections.BondedSection
                        bonded={bonded}
                        linkable={!!onViewBondedSheet}
                      />
                    );
                  }
                }
                return null;
              };
            })()}
          />

          {/* The campaign endpoint returns powers as [] for partial visibility — guard against that since PowersSection expects a record */}
          {!Array.isArray(character.powers) && (
            <sections.PowersSection classes={character.classes || {}} powers={character.powers} virtualPowers={character.virtualPowers} aptitudes={character.aptitudes} spellTags={character.spellTags} rulesetId={rulesetId} />
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
            <ReadOnlyEquipmentSection
              equipment={character.equipment || []}
              encumbrance={encumbrance}
            />
          )}

          {showDiagnostics && "invalidRequirements" in character.requirements && Object.values(character.classes || {}).some((cls) => cls.levels.length > 0) && (
            <DiagnosticsSection
              validation={character.validation}
              requirements={character.requirements}
              modifiers={character.modifiers as ComponentProps<typeof DiagnosticsSection>["modifiers"]}
            />
          )}
        </>
      )}
    </Stack>
  );
}
