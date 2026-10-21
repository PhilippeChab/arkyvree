import { Stack } from "@mui/material";
import type { ReactNode } from "react";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { SheetSection } from "./SheetSection.tsx";
import { StatField } from "./StatField.tsx";

interface CombatSectionProps {
  /** What its ruleset shows under its line: 3.5's weapon sets, each with its armor class and its attacks */
  children?: ReactNode;
  combat: SheetCombat;
}

/** The sheet's combat stats; empty on a sheet that carries none. */
export type SheetCombat = Partial<CharacterDetail["combat"]>;

/**
 * The combat stats' line: spread over its width from a desktop's, as the PDF's first page sets its five boxes; on a
 * phone, as many to a line as fit.
 */
const STATS_SX = { flexWrap: "wrap", justifyContent: { md: "space-between" } } as const;

/**
 * The character's combat: its stats on one line, as its rules list and write them (3.5's, in the PDF's order: HP,
 * Initiative, Speed, BAB, Grapple), then what its ruleset shows under them (`children`). On a phone, its stats wrap,
 * however long a value is ("BAB: +16/+11/+6/+1").
 */
export function CombatSection({ children, combat }: CombatSectionProps) {
  return (
    <SheetSection title="Combat">
      <Stack spacing={3}>
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={STATS_SX}>
          {combat.stats?.map(({ label, value }) => (
            <StatField key={label} label={label} value={value} />
          ))}
        </Stack>
        {children}
      </Stack>
    </SheetSection>
  );
}
