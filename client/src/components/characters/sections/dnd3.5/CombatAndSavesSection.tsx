import { Box, Stack, Typography } from "@mui/material";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankNote, SubsectionTitle } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { StatField } from "./StatField.tsx";

interface CombatAndSavesSectionProps {
  combat: SheetCombat;
  saves: CharacterDetail["saves"];
}

/** The sheet's combat stats; empty on a sheet that carries none. */
export type SheetCombat = Partial<CharacterDetail["combat"]>;

export function CombatAndSavesSection({ combat, saves }: CombatAndSavesSectionProps) {
  return (
    <SheetSection title="Combat & Saves">
      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Stack spacing={1} sx={{ flex: 1, minWidth: { md: 350 } }}>
          <SubsectionTitle>Combat Stats</SubsectionTitle>
          {/* One grid, so its columns line up across its rows; the armor class is each weapon set's, under Weapons */}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: { xs: 1, sm: 2 } }}>
            <StatField label="HP" value={combat?.hp?.total ?? 0} />
            <StatField label="Initiative" value={formatSigned(combat?.initiative?.total)} />
            <StatField label="Speed" value={combat?.speedLabel} />

            <StatField label="BAB" value={combat?.babLabel} />
            <StatField label="Grapple" value={formatSigned(combat?.grapple?.total)} />
          </Box>
        </Stack>

        <Stack spacing={1} sx={{ flex: 1, minWidth: { md: 300 } }}>
          <SubsectionTitle>Saving Throws</SubsectionTitle>
          {Object.keys(saves).length > 0 ? (
            <Stack spacing={3}>
              {Object.entries(saves).map(([save, saveData]) => (
                <Stack key={save} spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    {saveData.name}: {formatSigned(saveData.total)}
                  </Typography>
                  <Stack direction="row" spacing={3} sx={{ pl: 2 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Base: {formatSigned(saveData.base)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Ability: {formatSigned(saveData.ability)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Misc: {formatSigned(saveData.misc)}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          ) : (
            <BlankNote>No saving throws</BlankNote>
          )}
        </Stack>
      </Stack>
    </SheetSection>
  );
}
