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

import { BlankNote } from "@/client/src/components/common/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { buildAttackRows, describeWeaponSlot } from "@/shared/dnd3.5/weaponAttacks.ts";

import type { SheetCombat } from "./dnd3.5/index.ts";
import { SheetSection } from "./SheetSection.tsx";
import { shownWeaponSet } from "./weaponSets.ts";

type WeaponSet = CharacterDetail["combat"]["weaponsets"][string];
type WeaponSlot = NonNullable<WeaponSet["mainhand"]>;

interface WeaponsSectionProps {
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
                  <Typography variant="subtitle2" component="h3" sx={{ color: "text.secondary" }}>
                    Set {shownWeaponSet(Number(setIndex))}
                  </Typography>
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
                            <TableCell align="center">
                              {row.attack.length ? row.attack.map(formatSigned).join("/") : "+0"}
                            </TableCell>
                            <TableCell align="center">{row.damage ?? (weapon.damage?.total || "—")}</TableCell>
                            <TableCell align="center">
                              {weapon.damage?.critical
                                ? `${
                                    (weapon.damage.critical.range ?? 1) > 1
                                      ? `${21 - (weapon.damage.critical.range ?? 1)}-20`
                                      : "20"
                                  }/x${weapon.damage.critical.multiplier || 2}`
                                : "20/x2"}
                            </TableCell>
                            <TableCell align="center">{row.range}</TableCell>
                            <TableCell align="center">
                              {weapon.damage?.types ? weapon.damage.types.join(", ") : "—"}
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
