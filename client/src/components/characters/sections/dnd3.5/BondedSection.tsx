import { Box, Link as MuiLink, Stack } from "@mui/material";
import { Link } from "react-router-dom";

import { sortAbilities } from "@/client/src/components/characters/sections/abilityOrder.ts";
import { EntryTitle, SubsectionTitle, ValueChip } from "@/client/src/components/common/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { AbilityScoreBox } from "./AbilityScoreBox.tsx";
import { formatSpeed, iterativeAttacks } from "./combatValues.ts";
import { StatField } from "./StatField.tsx";

type FeatEntry = NonNullable<BondedSectionProps["bonded"]["feats"]>[string];

export interface BondedSectionProps {
  bonded: NonNullable<CharacterDetail["bonded"][string]>;
  /** The creature's name links to its sheet. */
  linkable?: boolean;
}

/** A feat entry, as opposed to a family of variants keyed by name. */
function isFeat(entry: FeatEntry): entry is Extract<FeatEntry, { possessed: boolean }> {
  return "possessed" in entry && typeof entry.possessed === "boolean";
}

export function BondedSection({ bonded, linkable = false }: BondedSectionProps) {
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

  // A heading under its feat's: the creature's name, a link to its sheet where it has one
  const nameNode = (
    <EntryTitle component="h4" sx={{ width: "fit-content" }}>
      {linkable ? (
        <MuiLink component={Link} to={`/characters/${bonded.id}`} underline="hover">
          {bonded.name}
        </MuiLink>
      ) : (
        bonded.name
      )}
    </EntryTitle>
  );

  return (
    <Stack spacing={2}>
      <Stack sx={{ minWidth: 0 }}>{nameNode}</Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Stack spacing={1} sx={{ flex: "0 0 auto" }}>
          <SubsectionTitle component="h5">Abilities</SubsectionTitle>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(64px, 80px))", md: "repeat(3, minmax(72px, 88px))" },
              gap: 1,
            }}
          >
            {abilityEntries.map(([name, data]) => (
              <AbilityScoreBox key={name} ability={name} score={data.total} modifier={data.modifier} compact />
            ))}
          </Box>
        </Stack>

        <Stack spacing={3} sx={{ flex: 1, minWidth: { md: 260 } }}>
          <Stack spacing={1}>
            <SubsectionTitle component="h5">Combat &amp; Saves</SubsectionTitle>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", columnGap: 2, rowGap: 1.5 }}>
              <Stack spacing={1.5}>
                <StatField label="HP" value={combat?.hp?.total ?? 0} />
                <StatField label="AC" value={combat?.ac?.total ?? 10} />
                <StatField label="BAB" value={iterativeAttacks(combat?.bab ?? 0)} />
                <StatField label="Speed" value={formatSpeed(combat?.speed?.total)} />
              </Stack>
              <Stack spacing={1.5}>
                {Object.entries(saves).map(([key, save]) => (
                  <StatField key={key} label={save.name ?? key} value={formatSigned(save.total)} />
                ))}
              </Stack>
            </Box>
          </Stack>

          {featNames.length > 0 && (
            <Stack spacing={1}>
              <SubsectionTitle component="h5">Features</SubsectionTitle>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                {featNames.map((name) => (
                  <ValueChip key={name} color="default" label={name} />
                ))}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
