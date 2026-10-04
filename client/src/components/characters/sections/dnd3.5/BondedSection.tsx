import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { computeAbilityModifier } from "@/shared/dnd3.5/abilities.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { AbilityScoreBox } from "./AbilityScoreBox.tsx";
import { StatField } from "./statHelpers.tsx";
import type { Dnd35BondedSectionProps } from "./types.ts";

type FeatEntry = NonNullable<Dnd35BondedSectionProps["bonded"]["feats"]>[string];

/** A feat entry, as opposed to a family of variants keyed by name. */
const isFeat = (entry: FeatEntry): entry is Extract<FeatEntry, { possessed: boolean }> =>
  "possessed" in entry && typeof entry.possessed === "boolean";

export function BondedSection({ bonded, linkable = false }: Dnd35BondedSectionProps) {
  const abilityEntries = sortAbilities(
    Object.entries(bonded.abilities ?? {}),
    bonded.baseRules ?? DEFAULT_BASE_RULES,
    ([name]) => name,
  );

  const combat = bonded.combat;
  const saves = bonded.savingThrows ?? {};

  const featNames = Object.values(bonded.feats ?? {})
    .filter(isFeat)
    .filter((feat) => feat.possessed)
    .map((feat) => feat.name)
    .sort();

  const nameSx = {
    fontWeight: 600,
    color: "primary.main",
    typography: { xs: "body1", sm: "h6" },
    width: "fit-content",
  };
  const nameNode = linkable ? (
    <MuiLink component={Link} to={`/characters/${bonded.id}`} underline="hover" sx={nameSx}>
      {bonded.name}
    </MuiLink>
  ) : (
    <Typography sx={nameSx}>{bonded.name}</Typography>
  );

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack sx={{ mb: 2, minWidth: 0 }}>{nameNode}</Stack>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3 }}>
        <Box sx={{ flex: "0 0 auto" }}>
          <Typography sx={{ fontWeight: 600, mb: 1.5, color: "text.secondary", typography: "body1" }}>
            Abilities
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(64px, 80px))", md: "repeat(3, minmax(72px, 88px))" },
              gap: 1,
            }}
          >
            {abilityEntries.map(([name, data]) => {
              const total = data.total ?? 10;
              const modifier = computeAbilityModifier(total);
              return <AbilityScoreBox key={name} ability={name} score={total} modifier={modifier} compact />;
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
                <StatField label="BAB" value={formatSigned(combat?.bab)} />
                <StatField label="Speed" value={`${combat?.speed?.total ?? 0} ft.`} />
              </Stack>
              <Stack spacing={1.5}>
                {Object.entries(saves).map(([key, save]) => (
                  <StatField key={key} label={save.name ?? key} value={formatSigned(save.total)} />
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
                      px: 1,
                      py: 0.25,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
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
