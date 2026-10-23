import { Box, Link as MuiLink, Stack } from "@mui/material";
import { Link } from "react-router-dom";

import { SubsectionTitle, ValueChip } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { EntryTitle } from "./EntryTitle.tsx";
import { ScoreTile } from "./ScoreTile.tsx";
import { blockOf } from "./sheetBlocks.ts";
import { StatBoxes } from "./StatBoxes.tsx";
import { StatField } from "./StatField.tsx";

interface BondedCreatureProps {
  bonded: NonNullable<CharacterDetail["bonded"][string]>;
  /** The creature's name links to its sheet. */
  linkable?: boolean;
}

type FeatEntry = NonNullable<BondedCreatureProps["bonded"]["feats"]>[string];

/** A feat entry, as opposed to a family of variants keyed by name. */
function isFeat(entry: FeatEntry): entry is Extract<FeatEntry, { possessed: boolean }> {
  return "possessed" in entry && typeof entry.possessed === "boolean";
}

export function BondedCreature({ bonded, linkable = false }: BondedCreatureProps) {
  const combat = bonded.combat;
  const abilities = blockOf(bonded.blocks, "scores", "abilities")?.scores ?? [];
  // A creature has one weapon set, its natural attacks', with no shield: its armor class
  const armorClass = blockOf(bonded.blocks, "stats", "combat")?.panels[0]?.boxes;
  const saves = blockOf(bonded.blocks, "scores", "saves")?.scores ?? [];

  const featNames = Object.values(bonded.feats)
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
      {nameNode}

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
            {abilities.map((score) => (
              <ScoreTile key={score.key} score={score} compact />
            ))}
          </Box>
        </Stack>

        <Stack spacing={3} sx={{ flex: 1, minWidth: { md: 260 } }}>
          <Stack spacing={1}>
            <SubsectionTitle component="h5">Combat &amp; Saves</SubsectionTitle>
            <Stack spacing={2}>
              {armorClass && <StatBoxes boxes={armorClass} />}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", columnGap: 2, rowGap: 1.5 }}>
                <Stack spacing={1.5}>
                  {combat?.summary?.map(({ label, value }) => (
                    <StatField key={label} label={label} value={value} />
                  ))}
                </Stack>
                <Stack spacing={1.5}>
                  {saves.map(({ key, label, value }) => (
                    <StatField key={key} label={label} value={formatSigned(value)} />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </Stack>

          {featNames.length > 0 && (
            <Stack spacing={1}>
              <SubsectionTitle component="h5">Feats</SubsectionTitle>
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
