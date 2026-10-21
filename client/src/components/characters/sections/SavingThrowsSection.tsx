import { Stack } from "@mui/material";

import { BlankNote } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { ScoreBox } from "./ScoreBox.tsx";
import { SCORE_ROW_GAP, SCORE_ROW_SX, SCORE_SLOT_SX } from "./scoreRow.ts";
import { SheetSection } from "./SheetSection.tsx";

interface SavingThrowsSectionProps {
  saves: CharacterDetail["saves"];
}

/**
 * The character's saving throws, laid out as the ability scores are: a box each, side by side, with its name, its total
 * and its parts as its rules list them (3.5's base, ability and misc).
 */
export function SavingThrowsSection({ saves }: SavingThrowsSectionProps) {
  const entries = Object.entries(saves);

  return (
    <SheetSection title="Saving Throws">
      {entries.length > 0 ? (
        // The boxes keep the space under them
        <Stack direction="row" spacing={SCORE_ROW_GAP} sx={[SCORE_ROW_SX, { pb: 2 }]}>
          {entries.map(([save, saveData]) => (
            <ScoreBox
              key={save}
              sx={SCORE_SLOT_SX}
              label={saveData.name}
              value={formatSigned(saveData.total)}
              minHeight={160}
              breakdown={saveData.parts.map(({ label, value }) => `${label}: ${value}`)}
            />
          ))}
        </Stack>
      ) : (
        <BlankNote>No saving throws</BlankNote>
      )}
    </SheetSection>
  );
}
