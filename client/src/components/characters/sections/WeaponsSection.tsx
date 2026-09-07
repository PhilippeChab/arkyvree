import { BlankState } from "@/client/src/components/common/index.ts";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

interface WeaponSlot {
  name: string;
  itemId?: string | null;
  proficient?: boolean;
  range?: number;
  tohit?: { total?: number[] };
  damage?: {
    total?: string;
    critical?: { range?: number; multiplier?: number };
    types?: string[];
  };
}

interface WeaponSet {
  mainhand?: WeaponSlot | null;
  offhand?: WeaponSlot | null;
  twohanded?: WeaponSlot | null;
}

interface WeaponsSectionProps {
  combat: {
    weaponsets?: Record<string, WeaponSet>;
  };
}

const SLOT_LABELS: Record<string, string> = {
  mainhand: "Main Hand",
  offhand: "Off Hand",
  twohanded: "Two Handed",
};

export function WeaponsSection({ combat }: WeaponsSectionProps) {
  const weaponsets = combat?.weaponsets ?? {};
  const setEntries = Object.entries(weaponsets).sort(([a], [b]) => Number(a) - Number(b));

  const hasWeapons = setEntries.some(([, set]) =>
    set.mainhand || set.offhand || set.twohanded
  );

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography sx={{ fontWeight: 600, color: "primary.main", mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Weapons
      </Typography>
      {hasWeapons
        ? setEntries.map(([setIndex, set]) => {
            const weapons: { weapon: WeaponSlot; slot: string }[] = [];
            for (const slotKey of ["mainhand", "offhand", "twohanded"] as const) {
              const weapon = set?.[slotKey];
              if (weapon) {
                weapons.push({ weapon, slot: SLOT_LABELS[slotKey] });
              }
            }
            if (weapons.length === 0) return null;

            return (
              <TableContainer key={setIndex} sx={{ mb: 2, overflowX: "auto" }}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
                  Set {Number(setIndex) + 1}
                </Typography>
                <Table size="small" sx={{ minWidth: 600 }}>
                  <colgroup>
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "grey.100" }}>
                      <TableCell sx={{ fontWeight: 600 }}>Weapon</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Attack Bonus</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Damage</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Critical</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Range</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {weapons.map(({ weapon, slot }) => (
                      <TableRow key={slot}>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {weapon.name}
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            ({slot})
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
                          {weapon.tohit?.total?.length
                            ? weapon.tohit.total.map((v) => (v >= 0 ? `+${v}` : String(v))).join("/")
                            : "+0"}
                        </TableCell>
                        <TableCell align="center">
                          {weapon.damage?.total || "—"}
                        </TableCell>
                        <TableCell align="center">
                          {weapon.damage?.critical
                            ? `${
                                (weapon.damage.critical.range ?? 1) > 1
                                  ? `${21 - (weapon.damage.critical.range ?? 1)}-20`
                                  : "20"
                              }/x${weapon.damage.critical.multiplier || 2}`
                            : "20/x2"}
                        </TableCell>
                        <TableCell align="center">
                          {weapon.range ? `${weapon.range} ft.` : "Melee"}
                        </TableCell>
                        <TableCell align="center">
                          {weapon.damage?.types ? weapon.damage.types.join(", ") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })
        : <BlankState title="No weapons equipped" />}
    </Paper>
  );
}
