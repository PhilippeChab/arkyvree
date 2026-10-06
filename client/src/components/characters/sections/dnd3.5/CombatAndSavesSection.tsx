import { Box, Stack, Typography } from "@mui/material";

import { BlankState, Section, Subsection } from "@/client/src/components/common/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { capitalize } from "@/shared/text.ts";

import { StatField } from "./statHelpers.tsx";
import type { Dnd35CombatAndSavesSectionProps } from "./types.ts";

/** The parts of the AC the breakdown lists, by their label */
const AC_PARTS = [
  ["Armor", "armor"],
  ["Shield", "shield"],
  ["Dex", "dexterity"],
  ["Natural", "natural"],
  ["Deflection", "deflection"],
  ["Dodge", "dodge"],
  ["Size", "size"],
  ["Misc", "misc"],
] as const;

function iterativeAttacks(bab: number): string {
  const attacks: string[] = [];
  for (let bonus = bab; bonus > 0; bonus -= 5) {
    attacks.push(formatSigned(bonus));
  }
  return attacks.length > 0 ? attacks.join("/") : formatSigned(bab);
}

export function CombatAndSavesSection({ combat, saves }: Dnd35CombatAndSavesSectionProps) {
  const bab = combat?.bab ?? 0;

  return (
    <Section title="Combat & Saves">
      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        {/* Left column: Combat Stats */}
        <Box sx={{ flex: 1, minWidth: { md: 350 } }}>
          <Subsection title="Combat Stats">
            {/* Combat stat grid — single grid so columns align across rows */}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
              <StatField label="HP" value={combat?.hp?.total ?? 0} />
              <StatField label="Initiative" value={formatSigned(combat?.initiative?.total)} />
              <StatField label="Speed" value={`${combat?.speed?.total ?? 30} ft.`} />

              <StatField label="BAB" value={iterativeAttacks(bab)} />
              <StatField label="Grapple" value={formatSigned(combat?.grapple?.total)} />
              <Box />

              <StatField label="AC" value={combat?.ac?.total ?? 10} />
              <StatField label="Touch" value={combat?.ac?.touch ?? 10} />
              <StatField label="Flat-footed" value={combat?.ac?.flatfooted ?? 10} />
            </Box>

            {/* AC Breakdown */}
            <Box sx={{ pl: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              {AC_PARTS.map(([label, part]) => (
                <Typography key={part} variant="caption" sx={{ color: "text.secondary" }}>
                  {label}: {formatSigned(combat?.ac?.[part])}
                </Typography>
              ))}
            </Box>
          </Subsection>
        </Box>

        {/* Right column: Saving Throws */}
        <Box sx={{ flex: 1, minWidth: { md: 300 } }}>
          <Subsection title="Saving Throws">
            {Object.keys(saves).length > 0 ? (
              <Stack spacing={3}>
                {Object.entries(saves).map(([save, saveData]) => {
                  const total = saveData?.total ?? 0;
                  const displayName = saveData?.name || capitalize(save);
                  return (
                    <Stack key={save} spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: "fontWeightMedium", color: "text.secondary" }}>
                        {displayName}: {formatSigned(total)}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ pl: 2 }}>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Base: {formatSigned(saveData?.base)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Ability: {formatSigned(saveData?.ability)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Misc: {formatSigned(saveData?.misc)}
                        </Typography>
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            ) : (
              <BlankState title="No saving throws available" />
            )}
          </Subsection>
        </Box>
      </Stack>
    </Section>
  );
}
