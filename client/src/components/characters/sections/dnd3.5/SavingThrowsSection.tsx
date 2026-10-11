import { Box, Stack } from "@mui/material";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankNote } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface SavingThrowsSectionProps {
  saves: CharacterDetail["saves"];
}

/**
 * The character's saving throws, laid out as the ability scores are: a box each, side by side, with its name, its total
 * and its base, ability and misc parts.
 */
export function SavingThrowsSection({ saves }: SavingThrowsSectionProps) {
  const entries = Object.entries(saves);

  return (
    <SheetSection title="Saving Throws">
      {entries.length > 0 ? (
        // The boxes keep the space under them
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "center", pb: 2 }}>
          {entries.map(([save, saveData]) => (
            <Box key={save} sx={{ minWidth: { xs: 120, sm: 140 } }}>
              <ScoreBox
                label={saveData.name}
                value={formatSigned(saveData.total)}
                minHeight={160}
                breakdown={[
                  `Base: ${formatSigned(saveData.base)}`,
                  `Ability: ${formatSigned(saveData.ability)}`,
                  `Misc: ${formatSigned(saveData.misc)}`,
                ]}
              />
            </Box>
          ))}
        </Stack>
      ) : (
        <BlankNote>No saving throws</BlankNote>
      )}
    </SheetSection>
  );
}
