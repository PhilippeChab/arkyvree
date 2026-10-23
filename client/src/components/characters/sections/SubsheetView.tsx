import { Box, Link as MuiLink, Stack } from "@mui/material";
import { Link } from "react-router-dom";

import { SubsectionTitle, ValueChip } from "@/client/src/components/common/index.ts";

import { EntryTitle } from "./EntryTitle.tsx";
import { ScoreTile } from "./ScoreTile.tsx";
import type { SheetSubsheet } from "./sheetBlocks.ts";
import { StatBoxes } from "./StatBoxes.tsx";
import { StatField } from "./StatField.tsx";

interface SubsheetViewProps {
  /** The creature's name links to its sheet. */
  linkable?: boolean;
  subsheet: SheetSubsheet;
}

/**
 * A creature its entry bonds, in the entry's details: its name, a link to its sheet where it has one, then its scores in
 * compact boxes beside its stats (its boxes, then its columns of lines), and its entries' names as chips.
 */
export function SubsheetView({ subsheet, linkable = false }: SubsheetViewProps) {
  const { chips, scores, stats } = subsheet;

  return (
    <Stack spacing={2}>
      {/* A heading under its entry's: the creature's name */}
      <EntryTitle component="h4" sx={{ width: "fit-content" }}>
        {linkable ? (
          <MuiLink component={Link} to={`/characters/${subsheet.id}`} underline="hover">
            {subsheet.name}
          </MuiLink>
        ) : (
          subsheet.name
        )}
      </EntryTitle>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Stack spacing={1} sx={{ flex: "0 0 auto" }}>
          <SubsectionTitle component="h5">{scores.title}</SubsectionTitle>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(64px, 80px))", md: "repeat(3, minmax(72px, 88px))" },
              gap: 1,
            }}
          >
            {scores.scores.map((score) => (
              <ScoreTile key={score.key} score={score} compact />
            ))}
          </Box>
        </Stack>

        <Stack spacing={3} sx={{ flex: 1, minWidth: { md: 260 } }}>
          <Stack spacing={1}>
            <SubsectionTitle component="h5">{stats.title}</SubsectionTitle>
            <Stack spacing={2}>
              {stats.boxes && <StatBoxes boxes={stats.boxes} />}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", columnGap: 2, rowGap: 1.5 }}>
                {stats.columns.map(({ key, lines }) => (
                  <Stack key={key} spacing={1.5}>
                    {lines.map(({ label, value }) => (
                      <StatField key={label} label={label} value={value} />
                    ))}
                  </Stack>
                ))}
              </Box>
            </Stack>
          </Stack>

          {chips.names.length > 0 && (
            <Stack spacing={1}>
              <SubsectionTitle component="h5">{chips.title}</SubsectionTitle>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                {chips.names.map((name) => (
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
