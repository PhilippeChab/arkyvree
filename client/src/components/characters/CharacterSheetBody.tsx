import { Stack } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { blockOf, type CharacterData, DiagnosticsSection, FieldsSection, getSections } from "./sections/index.ts";

interface CharacterSheetBodyProps {
  /** The bonded creatures' names link to their sheets: the owner's view. */
  bondedLinkable?: boolean;
  character: CharacterData;
  characterId: string;
  /** The owner's view only: the character's diagnostics, shown under the sheet. */
  diagnostics?: Pick<CharacterDetail, "validation" | "requirements" | "modifiers">;
  equipmentMode: "editable" | "readonly";
  identityReadOnly?: boolean;
  partial?: boolean;
  /** The portrait can't be changed; defaults to the identity's read-only state. */
  portraitReadOnly?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views. */
  portraitUrl?: string | null;
  readOnly?: boolean;
  rulesetId?: string;
}

/**
 * A character's sheet, under its header's classes: its identity, then its base rules' sections, then its diagnostics
 * (a partial sheet shows its identity alone).
 */
export function CharacterSheetBody({
  character,
  characterId,
  readOnly = false,
  identityReadOnly,
  portraitReadOnly,
  partial = false,
  bondedLinkable = false,
  equipmentMode,
  rulesetId,
  diagnostics,
  portraitUrl,
}: CharacterSheetBodyProps) {
  const { SheetSections } = getSections(character.baseRules);
  // Its identity, its own fields: what every sheet opens with, a partly seen one's alone
  const identity = blockOf(character.blocks, "fields", "identity");

  return (
    <Stack spacing={3}>
      {identity && (
        <FieldsSection
          block={identity}
          characterId={characterId}
          updatedAt={character.updatedAt}
          readOnly={identityReadOnly ?? readOnly}
          portraitReadOnly={portraitReadOnly}
          partial={partial}
          portraitUrl={portraitUrl}
        />
      )}

      {!partial && (
        <>
          <SheetSections
            character={character}
            characterId={characterId}
            readOnly={readOnly}
            bondedLinkable={bondedLinkable}
            equipmentMode={equipmentMode}
            rulesetId={rulesetId}
          />

          {diagnostics && Object.values(character.classes).some((cls) => cls.levels.length > 0) && (
            <DiagnosticsSection
              baseRules={character.baseRules}
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
