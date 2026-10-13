import { Stack, Typography } from "@mui/material";

import { shownWeaponSet } from "@/client/src/components/characters/sections/weaponSets.ts";
import {
  BlankNote,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  SubsectionTitle,
  type TableColumn,
} from "@/client/src/components/common/index.ts";

import { ArmorClassBoxes } from "./ArmorClassBoxes.tsx";
import type { SheetCombat } from "./CombatSection.tsx";

interface WeaponSetsProps {
  combat: SheetCombat;
}

/**
 * An attack's columns. On a phone, its weapon leads, its attack bonus at the line's end, and the rest under them
 * ("1d8 · ×3 · 1,100 ft. · -2 / 110 ft. · Piercing")
 */
const ATTACK_COLUMNS: TableColumn[] = [
  { key: "weapon", label: "Weapon", width: "22%" },
  { key: "attack", label: "Attack Bonus", width: "15%", align: "center" },
  { key: "damage", label: "Damage", width: "12%", align: "center" },
  { key: "critical", label: "Critical", width: "11%", align: "center" },
  { key: "range", label: "Range", width: "11%", align: "center" },
  { key: "increment", label: "Increment", width: "13%", align: "center" },
  { key: "type", label: "Type", width: "16%", align: "center" },
];

/** A range and its increment keep to one line ("-2 / 110 ft.") */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/**
 * The character's weapon sets, under its combat stats: each its heading ("Set 1", and what its hands hold), its armor
 * class, then its attacks, a ranged or thrown one's range and its range increment among them. A character with no
 * weapon set shows its one set without a heading.
 */
export function WeaponSets({ combat }: WeaponSetsProps) {
  const weaponSets = combat?.weaponSets ?? [];

  return weaponSets.length > 0 ? (
    // The last set keeps the space under it
    <Stack spacing={3} sx={{ pb: 2 }}>
      {weaponSets.map(({ set, ac, held, weapons }) => (
        <Stack key={set} spacing={1}>
          {combat?.hasWeaponSets && (
            <SubsectionTitle>
              Set {shownWeaponSet(set)}
              {held.length > 0 && (
                <Typography component="span" variant="inherit" sx={{ color: "text.secondary" }}>
                  {` · ${held.join(", ")}`}
                </Typography>
              )}
            </SubsectionTitle>
          )}
          <Stack spacing={2}>
            <ArmorClassBoxes ac={ac} />
            {weapons.length > 0 ? (
              <DataTable size="small" columns={ATTACK_COLUMNS} minWidth={700}>
                {weapons.flatMap((weapon) =>
                  weapon.rows.map((row) => (
                    <DataRow key={row.key}>
                      <DataCell slot="primary" sx={{ fontWeight: 500 }}>
                        {weapon.name}
                        <Typography
                          variant="caption"
                          sx={{
                            display: { xs: "inline", sm: "block" },
                            color: "text.secondary",
                            pl: { xs: 0.5, sm: 0 },
                          }}
                        >
                          ({row.label})
                        </Typography>
                        {weapon.proficient === false && (
                          <Typography variant="caption" sx={{ display: "block", color: "error.main", fontWeight: 600 }}>
                            Not Proficient (-4)
                          </Typography>
                        )}
                      </DataCell>
                      <DataCell slot="trailing" align="center">
                        {row.attack}
                      </DataCell>
                      <DataCell slot={row.damage ? "inline" : "hidden"} align="center">
                        {row.damage || <EmptyValue />}
                      </DataCell>
                      <DataCell slot="inline" align="center">
                        {row.critical}
                      </DataCell>
                      <DataCell slot={row.range ? "inline" : "hidden"} align="center" sx={NO_WRAP_SX}>
                        {row.range || <EmptyValue />}
                      </DataCell>
                      <DataCell slot={row.increment ? "inline" : "hidden"} align="center" sx={NO_WRAP_SX}>
                        {row.increment || <EmptyValue />}
                      </DataCell>
                      <DataCell slot={row.types ? "inline" : "hidden"} align="center">
                        {row.types || <EmptyValue />}
                      </DataCell>
                    </DataRow>
                  )),
                )}
              </DataTable>
            ) : (
              <BlankNote>No weapons equipped</BlankNote>
            )}
          </Stack>
        </Stack>
      ))}
    </Stack>
  ) : (
    <BlankNote>No weapons equipped</BlankNote>
  );
}
