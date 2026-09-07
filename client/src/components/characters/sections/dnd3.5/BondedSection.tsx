import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { RPC } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { AbilityScoreBox } from "./AbilityScoreBox.tsx";
import { StatField, fmt } from "./statHelpers.tsx";

type CharacterResponse = InferResponseType<RPC["api"]["characters"][":id"]["$get"], 200>;
type Bonded = NonNullable<NonNullable<CharacterResponse["bonded"]>[string]>;

interface BondedSectionProps {
  bonded: Bonded;
  linkable?: boolean;
}

export function BondedSection({ bonded, linkable = false }: BondedSectionProps) {
  const abilityEntries = sortAbilities(
    Object.entries(bonded.abilities ?? {}),
    bonded.baseRules ?? "Dungeons & Dragons: 3.5",
    ([name]) => name,
  );

  const combat = bonded.combat;
  const saves = bonded.savingThrows ?? {};

  const featNames = Object.values(bonded.feats ?? {})
    .filter((f): f is { name: string; possessed: boolean; count: number } =>
      typeof f === "object" && f !== null && "possessed" in f && Boolean(f.possessed),
    )
    .map((f) => f.name)
    .sort();

  const nameNode = linkable ? (
    <MuiLink
      component={Link}
      to={`/characters/${bonded.id}`}
      underline="hover"
      sx={{
        fontWeight: 600,
        color: "primary.main",
        typography: { xs: "body1", sm: "h6" },
        width: "fit-content",
      }}
    >
      {bonded.name}
    </MuiLink>
  ) : (
    <Typography
      sx={{
        fontWeight: 600,
        color: "primary.main",
        typography: { xs: "body1", sm: "h6" },
        width: "fit-content",
      }}
    >
      {bonded.name}
    </Typography>
  );

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack sx={{ mb: 2, minWidth: 0 }}>{nameNode}</Stack>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3 }}>
        <Box sx={{ flex: "0 0 auto" }}>
          <Typography sx={{ fontWeight: 600, mb: 1.5, color: "text.secondary", typography: "body1" }}>
            Abilities
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(64px, 80px))", md: "repeat(3, minmax(72px, 88px))" }, gap: 1 }}>
            {abilityEntries.map(([name, data]) => {
              const a = data as { total?: number };
              const total = a.total ?? 10;
              const modifier = Math.floor((total - 10) / 2);
              return (
                <AbilityScoreBox
                  key={name}
                  ability={name}
                  score={total}
                  modifier={modifier}
                  compact
                />
              );
            })}
          </Box>
        </Box>

        <Stack spacing={3} sx={{ flex: 1, minWidth: { md: 260 } }}>
          <Box>
            <Typography sx={{ fontWeight: 600, mb: 1.5, color: "text.secondary", typography: "body1" }}>
              Combat &amp; Saves
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", columnGap: 2, rowGap: 1.5 }}>
              <Stack spacing={1.5}>
                <StatField label="HP" value={combat?.hp?.total ?? 0} />
                <StatField label="AC" value={combat?.ac?.total ?? 10} />
                <StatField label="BAB" value={fmt(combat?.bab)} />
                <StatField label="Speed" value={`${combat?.speed?.total ?? 0} ft.`} />
              </Stack>
              <Stack spacing={1.5}>
                {Object.entries(saves).map(([key, save]) => (
                  <StatField
                    key={key}
                    label={save.name ?? key}
                    value={fmt(save.total)}
                  />
                ))}
              </Stack>
            </Box>
          </Box>

          {featNames.length > 0 && (
            <Box>
              <Typography sx={{ fontWeight: 600, mb: 1, color: "text.secondary", typography: "body1" }}>
                Features
              </Typography>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                {featNames.map((n) => (
                  <Box
                    key={n}
                    sx={{
                      px: 1, py: 0.25,
                      border: "1px solid", borderColor: "divider", borderRadius: 1,
                      fontSize: "0.85rem",
                    }}
                  >
                    {n}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
