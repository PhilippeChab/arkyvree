import {
  Box,
  Chip,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { capitalize } from "@/shared/text.ts";

import { type EncumbranceData, type EquipmentRow, formatSlotDisplay } from "./equipment.ts";

const headerSx = { fontWeight: 600 };
// Slots and figures stay on one line; the table scrolls on narrow screens.
const noWrap = { whiteSpace: "nowrap" };

type EquipmentTableRow = Omit<EquipmentRow, "type" | "updatedAt">;

interface EquipmentTableProps<T extends EquipmentTableRow> {
  rows: T[];
  encumbrance?: EncumbranceData;
  /** Links each item to its page in this ruleset. */
  rulesetId?: string;
  /** The row's actions, when the viewer can change the inventory. */
  renderActions?: (row: T) => ReactNode;
}

/** A character's inventory: slot, quantity, weight, value, and the carried load under it. */
export function EquipmentTable<T extends EquipmentTableRow>({
  rows,
  encumbrance,
  rulesetId,
  renderActions,
}: EquipmentTableProps<T>) {
  return (
    <>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerSx}>Item</TableCell>
              <TableCell align="center" sx={headerSx}>
                Slot
              </TableCell>
              <TableCell align="center" sx={headerSx}>
                Quantity
              </TableCell>
              <TableCell align="center" sx={headerSx}>
                Weight
              </TableCell>
              <TableCell align="center" sx={headerSx}>
                Value
              </TableCell>
              <TableCell sx={headerSx}>Description</TableCell>
              {renderActions && (
                <TableCell align="center" sx={headerSx}>
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((entry) => (
              <TableRow key={entry.id} sx={entry.equipped ? { backgroundColor: "action.hover" } : {}}>
                <TableCell>
                  {rulesetId ? (
                    <MuiLink
                      component={Link}
                      to={`/rulesets/${rulesetId}/items/${entry.itemId}/customization`}
                      target="_blank"
                      underline="hover"
                    >
                      {entry.name || "Unknown Item"}
                    </MuiLink>
                  ) : (
                    entry.name || "Unknown Item"
                  )}
                  {entry.totalCharges != null && (
                    <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                      Charges: {entry.remainingCharges ?? 0}/{entry.totalCharges}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="center" sx={noWrap}>
                  <Typography variant="body2">{formatSlotDisplay(entry)}</Typography>
                </TableCell>
                <TableCell align="center">{entry.quantity || 1}</TableCell>
                <TableCell align="center" sx={noWrap}>
                  {formatWeight(entry.weight) ?? "—"}
                </TableCell>
                <TableCell align="center" sx={noWrap}>
                  {formatCost(entry.costGp) ?? "—"}
                </TableCell>
                <TableCell sx={{ fontSize: "0.875rem", minWidth: 220 }}>{entry.description || "—"}</TableCell>
                {renderActions && <TableCell align="center">{renderActions(entry)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {encumbrance && (
        // Each figure wraps as a whole on narrow screens.
        <Box
          sx={{
            mt: 2,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "center",
            columnGap: 2,
            rowGap: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
            Carried Weight: {encumbrance.carriedweight ?? 0} lbs
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Light: {encumbrance.lightload ?? 0}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Medium: {encumbrance.mediumload ?? 0}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Heavy: {encumbrance.heavyload ?? 0}
          </Typography>
          {encumbrance.load && encumbrance.load !== "light" && (
            <Chip
              label={capitalize(encumbrance.load)}
              size="small"
              color={encumbrance.load === "overloaded" ? "error" : encumbrance.load === "heavy" ? "warning" : "info"}
            />
          )}
        </Box>
      )}
    </>
  );
}
