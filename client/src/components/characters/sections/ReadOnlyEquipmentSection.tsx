import { BlankState } from "@/client/src/components/common/index.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

interface EquipmentEntry {
  itemId: string;
  name: string;
  type: string | null;
  description: string | null;
  weight: string | null;
  costGp: string | null;
  quantity: number | null;
  equipped: boolean;
  location: string | null;
  weaponSet: number | null;
  totalCharges: number | null;
  remainingCharges: number | null;
}

const HAND_SLOTS = new Set(["Main Hand", "Off Hand", "Two Handed"]);

function formatSlotDisplay(entry: EquipmentEntry): string {
  if (!entry.equipped || !entry.location) return "\u2014";
  if (HAND_SLOTS.has(entry.location) && entry.weaponSet !== null) {
    return `${entry.location} (Set ${entry.weaponSet})`;
  }
  return entry.location;
}

interface EncumbranceData {
  carriedweight?: number;
  lightload?: number;
  mediumload?: number;
  heavyload?: number;
  load?: string;
}

export function ReadOnlyEquipmentSection({
  equipment,
  encumbrance,
}: {
  equipment: EquipmentEntry[];
  encumbrance?: EncumbranceData;
}) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography
        sx={{ fontWeight: 600, color: "primary.main", mb: 3, typography: { xs: "h6", sm: "h5" } }}
      >
        Equipment & Inventory
      </Typography>
      {equipment.length > 0 ? (
        <>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.100" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Item</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Slot</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Quantity</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Weight</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Value</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {equipment.map((entry) => (
                  <TableRow
                    key={entry.itemId}
                    sx={entry.equipped ? { backgroundColor: "action.hover" } : {}}
                  >
                    <TableCell>
                      {entry.name || "Unknown Item"}
                      {entry.totalCharges !== null && entry.totalCharges !== undefined && (
                        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                          Charges: {entry.remainingCharges ?? 0}/{entry.totalCharges}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{formatSlotDisplay(entry)}</Typography>
                    </TableCell>
                    <TableCell align="center">{entry.quantity || 1}</TableCell>
                    <TableCell align="center">
                      {(() => {
                        const w = formatDecimal(entry.weight);
                        return w ? `${w} lbs` : "\u2014";
                      })()}
                    </TableCell>
                    <TableCell align="center">
                      {(() => {
                        const c = formatDecimal(entry.costGp);
                        return c ? `${c} gp` : "\u2014";
                      })()}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.875rem" }}>
                      {entry.description || "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {encumbrance && (
            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                Carried Weight: {encumbrance.carriedweight ?? 0} lbs
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Light: {encumbrance.lightload ?? 0}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Medium: {encumbrance.mediumload ?? 0}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Heavy: {encumbrance.heavyload ?? 0}
              </Typography>
              {encumbrance.load && encumbrance.load !== "light" && (
                <Chip
                  label={encumbrance.load.charAt(0).toUpperCase() + encumbrance.load.slice(1)}
                  size="small"
                  color={
                    encumbrance.load === "overloaded" ? "error"
                      : encumbrance.load === "heavy" ? "warning"
                      : "info"
                  }
                />
              )}
            </Box>
          )}
        </>
      ) : (
        <BlankState title="No equipment" />
      )}
    </Paper>
  );
}
