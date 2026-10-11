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

import { EmptyValue, ROW_ACTIONS_HOVER_SX, RowActions } from "@/client/src/components/common/index.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import type { EquipmentRow } from "./equipment.ts";

interface EquipmentTableProps<T extends EquipmentTableRow> {
  /** What the sheet's base rules say of the load the character carries, under the table (3.5's encumbrance). */
  load?: ReactNode;
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
  load,
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
                      to={`/rulesets/${rulesetId}/${buildCustomizationPath("items", entry.itemId)}`}
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
                  <Typography variant="body2">{entry.slotLabel ?? <EmptyValue />}</Typography>
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
      {load}
    </Stack>
  );
}
