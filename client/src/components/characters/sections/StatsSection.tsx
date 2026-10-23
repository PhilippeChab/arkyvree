import { Stack, Typography } from "@mui/material";

import { BlankNote, SubsectionTitle } from "@/client/src/components/common/index.ts";

import { ArmorClassBoxes } from "./ArmorClassBoxes.tsx";
import { BlockTable } from "./BlockTable.tsx";
import type { BlockOf } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";
import { StatField } from "./StatField.tsx";

interface StatsSectionProps {
  block: BlockOf<"stats">;
}

/**
 * The stats' line: spread over its width from a desktop's, as the PDF's first page sets its five boxes; on a phone, as
 * many to a line as fit.
 */
const STATS_SX = { flexWrap: "wrap", justifyContent: { md: "space-between" } } as const;

/**
 * A `stats` block: its stats on one line (3.5's, in the PDF's order: HP, Initiative, Speed, BAB, Grapple), wrapping on
 * a phone however long a value is ("BAB: +16/+11/+6/+1"); then its panels, each its heading and its note after it
 * (3.5's weapon set, and what its hands hold), its boxes (its armor class), then its table (its attacks).
 */
export function StatsSection({ block }: StatsSectionProps) {
  return (
    <SheetSection title={block.title}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={STATS_SX}>
          {block.stats.map(({ label, value }) => (
            <StatField key={label} label={label} value={value} />
          ))}
        </Stack>
        {block.panels.length > 0 ? (
          // The last panel keeps the space under it
          <Stack spacing={3} sx={{ pb: 2 }}>
            {block.panels.map(({ key, heading, boxes, table }) => (
              <Stack key={key} spacing={1}>
                {heading && (
                  <SubsectionTitle>
                    {heading.label}
                    {heading.note && (
                      <Typography component="span" variant="inherit" sx={{ color: "text.secondary" }}>
                        {` · ${heading.note}`}
                      </Typography>
                    )}
                  </SubsectionTitle>
                )}
                <Stack spacing={2}>
                  <ArmorClassBoxes boxes={boxes} />
                  {table.rows.length > 0 ? <BlockTable table={table} /> : <BlankNote>{table.empty}</BlankNote>}
                </Stack>
              </Stack>
            ))}
          </Stack>
        ) : (
          <BlankNote>{block.empty}</BlankNote>
        )}
      </Stack>
    </SheetSection>
  );
}
