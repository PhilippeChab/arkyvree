import {
  Link as MuiLink,
  Stack,
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

import { EmptyValue, ROW_ACTIONS_HOVER_SX, RowActions, StatusChip } from "@/client/src/components/common/index.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { capitalize } from "@/shared/text.ts";

import { type EncumbranceData, type EquipmentRow, formatSlotDisplay } from "./equipment.ts";

interface EquipmentTableProps<T extends EquipmentTableRow> {
  encumbrance?: EncumbranceData;
  /** The row's `RowAction`s, when the viewer can change the inventory. */
  renderActions?: (row: T) => ReactNode;
  rows: T[];
  /** Links each item to its page in this ruleset. */
  rulesetId?: string;
}

type EquipmentTableRow = Omit<EquipmentRow, "type" | "updatedAt">;

/** Slots and figures stay on one line; the table scrolls on narrow screens. */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/** A character's inventory: slot, quantity, weight, value, and the carried load under it. */
export function EquipmentTable<T extends EquipmentTableRow>({
  rows,
  encumbrance,
  rulesetId,
  renderActions,
}: EquipmentTableProps<T>) {
  return (
    <Stack spacing={2}>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell align="center">Slot</TableCell>
              <TableCell align="center">Quantity</TableCell>
              <TableCell align="center">Weight</TableCell>
              <TableCell align="center">Value</TableCell>
              <TableCell>Description</TableCell>
              {renderActions && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((entry) => (
              <TableRow
                key={entry.id}
                sx={[ROW_ACTIONS_HOVER_SX, { bgcolor: entry.equipped ? "action.hover" : undefined }]}
              >
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
                <TableCell align="center" sx={NO_WRAP_SX}>
                  <Typography variant="body2">{formatSlotDisplay(entry) ?? <EmptyValue />}</Typography>
                </TableCell>
                <TableCell align="center">{entry.quantity || 1}</TableCell>
                <TableCell align="center" sx={NO_WRAP_SX}>
                  {formatWeight(entry.weight) ?? <EmptyValue />}
                </TableCell>
                <TableCell align="center" sx={NO_WRAP_SX}>
                  {formatCost(entry.costGp) ?? <EmptyValue />}
                </TableCell>
                <TableCell sx={{ fontSize: "0.875rem", minWidth: 220 }}>
                  {entry.description || <EmptyValue />}
                </TableCell>
                {renderActions && (
                  <TableCell align="right">
                    <RowActions>{renderActions(entry)}</RowActions>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {encumbrance && (
        // Each figure wraps as a whole on narrow screens.
        <Stack
          direction="row"
          sx={{
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
            <StatusChip
              label={capitalize(encumbrance.load)}
              color={encumbrance.load === "overloaded" ? "error" : encumbrance.load === "heavy" ? "warning" : "info"}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
