import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { shownWeaponSet } from "@/client/src/components/characters/sections/weaponSets.ts";
import { BlankNote, EmptyValue, SubsectionTitle } from "@/client/src/components/common/index.ts";

import { ArmorClassBoxes } from "./ArmorClassBoxes.tsx";
import type { SheetCombat } from "./CombatAndSavesSection.tsx";

interface WeaponsSectionProps {
  combat: SheetCombat;
}

/**
 * The character's weapon sets, each a loadout: its heading ("Set 1", and what its hands hold), its armor class, then its
 * attacks. A character with no weapon set shows its one loadout without a heading.
 */
export function WeaponsSection({ combat }: WeaponsSectionProps) {
  const weaponSets = combat?.weaponSets ?? [];

  return (
    <SheetSection title="Weapons">
      {weaponSets.length > 0 ? (
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
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small" sx={{ minWidth: 600 }}>
                      <colgroup>
                        <Box component="col" sx={{ width: "25%" }} />
                        <Box component="col" sx={{ width: "15%" }} />
                        <Box component="col" sx={{ width: "15%" }} />
                        <Box component="col" sx={{ width: "15%" }} />
                        <Box component="col" sx={{ width: "12%" }} />
                        <Box component="col" sx={{ width: "18%" }} />
                      </colgroup>
                      <TableHead>
                        <TableRow>
                          <TableCell>Weapon</TableCell>
                          <TableCell align="center">Attack Bonus</TableCell>
                          <TableCell align="center">Damage</TableCell>
                          <TableCell align="center">Critical</TableCell>
                          <TableCell align="center">Range</TableCell>
                          <TableCell align="center">Type</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {weapons.flatMap((weapon) =>
                          weapon.rows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell sx={{ fontWeight: 500 }}>
                                {weapon.name}
                                <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                                  ({row.label})
                                </Typography>
                                {weapon.proficient === false && (
                                  <Typography
                                    variant="caption"
                                    sx={{ display: "block", color: "error.main", fontWeight: 600 }}
                                  >
                                    Not Proficient (-4)
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="center">{row.attack}</TableCell>
                              <TableCell align="center">{row.damage || <EmptyValue />}</TableCell>
                              <TableCell align="center">{row.critical}</TableCell>
                              <TableCell align="center">{row.range}</TableCell>
                              <TableCell align="center">{row.types || <EmptyValue />}</TableCell>
                            </TableRow>
                          )),
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <BlankNote>No weapons equipped</BlankNote>
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      ) : (
        <BlankNote>No weapons equipped</BlankNote>
      )}
    </SheetSection>
  );
}
