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
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import {
  buildAttackRows,
  describeWeaponSlot,
  formatAttackBonus,
  formatCritical,
} from "@/shared/dnd3.5/weaponAttacks.ts";

import type { SheetCombat } from "./CombatAndSavesSection.tsx";

type WeaponSet = CharacterDetail["combat"]["weaponsets"][string];
type WeaponSlot = NonNullable<WeaponSet["mainhand"]>;

export interface WeaponsSectionProps {
  combat: SheetCombat;
}

export function WeaponsSection({ combat }: WeaponsSectionProps) {
  const weaponsets = combat?.weaponsets ?? {};
  const setEntries = Object.entries(weaponsets).sort(([a], [b]) => Number(a) - Number(b));

  const hasWeapons = setEntries.some(([, set]) => set.mainhand || set.offhand || set.twohanded);

  return (
    <SheetSection title="Weapons">
      {hasWeapons ? (
        // The last set keeps the space under it
        <Stack spacing={2} sx={{ pb: 2 }}>
          {setEntries.map(([setIndex, set]) => {
            const weapons: { slot: string; weapon: WeaponSlot }[] = [];
            for (const slotKey of ["mainhand", "offhand", "twohanded"] as const) {
              const weapon = set?.[slotKey];
              if (weapon) weapons.push({ weapon, slot: describeWeaponSlot(weapon, slotKey) });
            }
            if (weapons.length === 0) return null;

            return (
              <TableContainer key={setIndex} sx={{ overflowX: "auto" }}>
                <Stack spacing={1}>
                  <SubsectionTitle>Set {shownWeaponSet(Number(setIndex))}</SubsectionTitle>
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
                      {weapons.flatMap(({ weapon, slot }) =>
                        buildAttackRows(weapon, slot).map((row) => (
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
                            <TableCell align="center">{formatAttackBonus(row.attack)}</TableCell>
                            <TableCell align="center">
                              {row.damage ?? (weapon.damage.total || <EmptyValue />)}
                            </TableCell>
                            <TableCell align="center">{formatCritical(weapon.damage.critical)}</TableCell>
                            <TableCell align="center">{row.range}</TableCell>
                            <TableCell align="center">
                              {weapon.damage.types.length > 0 ? weapon.damage.types.join(", ") : <EmptyValue />}
                            </TableCell>
                          </TableRow>
                        )),
                      )}
                    </TableBody>
                  </Table>
                </Stack>
              </TableContainer>
            );
          })}
        </Stack>
      ) : (
        <BlankNote>No weapons equipped</BlankNote>
      )}
    </SheetSection>
  );
}
