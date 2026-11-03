import { Stack } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import {
  type CharacterData,
  DiagnosticsSection,
  FieldsSection,
  openingBlock,
  type SheetRows,
  SheetSections,
} from "./sections/index.ts";

type CharacterSheetBodyProps = SheetRows & {
  character: CharacterData;
  characterId: string;
  /** The owner's view only: the character's diagnostics, shown under the sheet. */
  diagnostics?: Pick<CharacterDetail, "validation" | "requirements" | "modifiers">;
  identityReadOnly?: boolean;
  partial?: boolean;
  /** The portrait can't be changed; defaults to the identity's read-only state. */
  portraitReadOnly?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views. */
  portraitUrl?: string | null;
  /** The names of the characters under it (its subsheets) link to their sheets: the owner's view. */
  subsheetsLinkable?: boolean;
};

/**
 * A character's sheet, under its header's line: its identity, then the sections its ruleset describes, then its
 * diagnostics (a partial sheet shows its identity alone).
 */
export function CharacterSheetBody({
  character,
  characterId,
  identityReadOnly,
  portraitReadOnly,
  partial = false,
  subsheetsLinkable = false,
  diagnostics,
  portraitUrl,
  ...rows
}: CharacterSheetBodyProps) {
  // Its own fields, its identity: what every sheet opens with, a partly seen one's alone
  const identity = openingBlock(character.blocks);

  return (
    <Stack spacing={3}>
      {identity && (
        <FieldsSection
          block={identity}
          characterId={characterId}
          updatedAt={character.updatedAt}
          readOnly={identityReadOnly ?? rows.readOnly}
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
            {...rows}
            subsheetsLinkable={subsheetsLinkable}
          />

          {diagnostics && character.summary.tracks.some((track) => track.advancements.length > 0) && (
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
