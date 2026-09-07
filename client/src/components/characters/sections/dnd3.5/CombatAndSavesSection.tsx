import { BlankState } from "@/client/src/components/common/index.ts";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { CombatAndSavesSectionProps } from "../../sectionFactory.ts";
import { StatField, fmt } from "./statHelpers.tsx";

function iterativeAttacks(bab: number): string {
  const attacks: string[] = [];
  for (let bonus = bab; bonus > 0; bonus -= 5) {
    attacks.push(fmt(bonus));
  }
  return attacks.length > 0 ? attacks.join("/") : fmt(bab);
}

export function CombatAndSavesSection({
  combat,
  saves,
}: CombatAndSavesSectionProps) {
  const bab = combat?.bab ?? 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography sx={{ fontWeight: 600, mb: 3, color: "primary.main", typography: { xs: "h6", sm: "h5" } }}>
        Combat & Saves
      </Typography>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3 }}>
        {/* Left column: Combat Stats */}
        <Box sx={{ flex: 1, minWidth: { md: 350 } }}>
          <Typography sx={{ fontWeight: 600, mb: 2, color: "text.secondary", typography: { xs: "body1", sm: "h6" } }}>
            Combat Stats
          </Typography>
          <Stack spacing={2}>
            {/* Combat stat grid — single grid so columns align across rows */}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
              <StatField label="HP" value={combat?.hp?.total ?? 0} />
              <StatField label="Initiative" value={fmt(combat?.initiative?.total)} />
              <StatField label="Speed" value={`${combat?.speed?.total ?? 30} ft.`} />

              <StatField label="BAB" value={iterativeAttacks(bab)} />
              <StatField label="Grapple" value={fmt(combat?.grapple?.total)} />
              <Box />

              <StatField label="AC" value={combat?.ac?.total ?? 10} />
              <StatField label="Touch" value={combat?.ac?.touch ?? 10} />
              <StatField label="Flat-footed" value={combat?.ac?.flatfooted ?? 10} />
            </Box>

            {/* AC Breakdown */}
            <Box sx={{ ml: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Armor: {fmt(combat?.ac?.armor)}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Shield: {fmt(combat?.ac?.shield)}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Dex: {fmt(combat?.ac?.dexterity)}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Natural: {fmt(combat?.ac?.natural)}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Deflection: {fmt(combat?.ac?.deflection)}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Misc: {fmt(combat?.ac?.misc)}
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* Right column: Saving Throws */}
        <Box sx={{ flex: 1, minWidth: { md: 300 } }}>
          <Typography sx={{ fontWeight: 600, mb: 2, color: "text.secondary", typography: { xs: "body1", sm: "h6" } }}>
            Saving Throws
          </Typography>
          {Object.keys(saves).length > 0
            ? (
              <Stack spacing={3}>
                {Object.entries(saves).map(([save, saveData]) => {
                  const total = saveData?.total ?? 0;
                  const displayName = saveData?.name || save.charAt(0).toUpperCase() + save.slice(1);
                  return (
                    <Box key={save}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary", mb: 1 }}>
                        {displayName}: {total >= 0 ? `+${total}` : total}
                      </Typography>
                      <Box sx={{ ml: 2, display: "flex", gap: 3 }}>
                        <Typography variant="caption" sx={{
                          color: "text.secondary"
                        }}>
                          Base: {fmt(saveData?.base)}
                        </Typography>
                        <Typography variant="caption" sx={{
                          color: "text.secondary"
                        }}>
                          Ability: {fmt(saveData?.ability)}
                        </Typography>
                        <Typography variant="caption" sx={{
                          color: "text.secondary"
                        }}>
                          Misc: {fmt(saveData?.misc)}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )
            : (
              <BlankState title="No saving throws available" />
            )}
        </Box>
      </Box>
    </Paper>
  );
}
