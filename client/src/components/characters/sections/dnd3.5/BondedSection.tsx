import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import { TagChip } from "@/client/src/components/common/index.ts";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { computeAbilityModifier } from "@/shared/dnd3.5/abilities.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { AbilityScoreBox } from "./AbilityScoreBox.tsx";
import { StatField } from "./statHelpers.tsx";
import type { Dnd35BondedSectionProps } from "./types.ts";

type FeatEntry = NonNullable<Dnd35BondedSectionProps["bonded"]["feats"]>[string];

/** A feat entry, as opposed to a family of variants keyed by name. */
function isFeat(entry: FeatEntry): entry is Extract<FeatEntry, { possessed: boolean }> {
  return "possessed" in entry && typeof entry.possessed === "boolean";
}

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
    fontWeight: "fontWeightBold",
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
    <Stack spacing={3}>
      <Stack sx={{ minWidth: 0 }}>{nameNode}</Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Stack spacing={1} sx={{ flex: "0 0 auto" }}>
          <Typography sx={{ fontWeight: "fontWeightBold", color: "text.secondary" }}>Abilities</Typography>
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
        </Stack>

        <Stack spacing={3} sx={{ flex: 1, minWidth: { md: 260 } }}>
          <Stack spacing={1}>
            <Typography sx={{ fontWeight: "fontWeightBold", color: "text.secondary" }}>Combat &amp; Saves</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", columnGap: 2, rowGap: 1 }}>
              <Stack spacing={1}>
                <StatField label="HP" value={combat?.hp?.total ?? 0} />
                <StatField label="AC" value={combat?.ac?.total ?? 10} />
                <StatField label="BAB" value={formatSigned(combat?.bab)} />
                <StatField label="Speed" value={`${combat?.speed?.total ?? 0} ft.`} />
              </Stack>
              <Stack spacing={1}>
                {Object.entries(saves).map(([key, save]) => (
                  <StatField key={key} label={save.name ?? key} value={formatSigned(save.total)} />
                ))}
              </Stack>
            </Box>
          </Stack>

          {featNames.length > 0 && (
            <Stack spacing={1}>
              <Typography sx={{ fontWeight: "fontWeightBold", color: "text.secondary" }}>Features</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {featNames.map((n) => (
                  <TagChip key={n} tag={{ label: n, color: "default" }} />
                ))}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
