import { Stack } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import {
  type CharacterData,
  CharacterIdentitySection,
  DiagnosticsSection,
  type EditingLevel,
  getSections,
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

/** A character's sheet: its identity, then its base rules' sections (a partial sheet has none), then its diagnostics. */
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
  const { SheetSections } = getSections(character.baseRules);

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
          <SheetSections
            character={character}
            characterId={characterId}
            readOnly={readOnly}
            onEditLevel={onEditLevel}
            onAddLevel={onAddLevel}
            onRemoveLevel={onRemoveLevel}
            bondedLinkable={bondedLinkable}
            equipmentMode={equipmentMode}
            rulesetId={rulesetId}
          />

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
