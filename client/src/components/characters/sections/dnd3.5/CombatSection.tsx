import { Stack } from "@mui/material";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { StatField } from "./StatField.tsx";
import { WeaponSets } from "./WeaponSets.tsx";

interface CombatSectionProps {
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
 * The character's combat: its stats on one line, in the PDF's order (HP, Initiative, Speed, BAB, Grapple), then each
 * weapon set with its armor class and its attacks. On a phone, its stats wrap, however long a base attack bonus is
 * ("BAB: +16/+11/+6/+1").
 */
export function CombatSection({ combat }: CombatSectionProps) {
  return (
    <SheetSection title="Combat">
      <Stack spacing={3}>
        {/* The armor class is each weapon set's, below */}
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={STATS_SX}>
          <StatField label="HP" value={combat?.hp?.total ?? 0} />
          <StatField label="Initiative" value={formatSigned(combat?.initiative?.total)} />
          <StatField label="Speed" value={combat?.speedLabel} />
          <StatField label="BAB" value={combat?.babLabel} />
          <StatField label="Grapple" value={formatSigned(combat?.grapple?.total)} />
        </Stack>

        <WeaponSets combat={combat} />
      </Stack>
    </SheetSection>
  );
}
