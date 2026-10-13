import { Link as MuiLink, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ROW_ACTIONS_HOVER_SX,
  RowActions,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import { formatCost, formatTrimmed, formatWeight } from "@/client/src/lib/formatNumeric.ts";
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

/** The column its actions take, at its end */
const ACTIONS_COLUMN: TableColumn = { key: "actions", label: "Actions", align: "right" };

/**
 * An item's columns, before its actions'. On a phone, its name leads, its actions at the line's end, its slot and its
 * figures under them; its description is its page's.
 */
const ITEM_COLUMNS: TableColumn[] = [
  { key: "item", label: "Item" },
  { key: "slot", label: "Slot", align: "center" },
  { key: "quantity", label: "Quantity", align: "center" },
  { key: "weight", label: "Weight", align: "center" },
  { key: "value", label: "Value", align: "center" },
  { key: "description", label: "Description" },
];

/** Slots and figures stay on one line */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/** A weight in whole pounds where it is one ("2 lbs", "1 lb", "0.5 lbs"), as a phone shows it */
function formatPounds(weight: EquipmentTableRow["weight"]) {
  const pounds = formatTrimmed(weight);
  return `${pounds} ${pounds === "1" ? "lb" : "lbs"}`;
}

/** A character's inventory: slot, quantity, weight, value, and the carried load under it. */
export function EquipmentTable<T extends EquipmentTableRow>({
  rows,
  load,
  rulesetId,
  renderActions,
}: EquipmentTableProps<T>) {
  return (
    <Stack spacing={2}>
      <DataTable
        size="small"
        columns={renderActions ? [...ITEM_COLUMNS, ACTIONS_COLUMN] : ITEM_COLUMNS}
        minWidth={640}
        inset={1}
      >
        {rows.map((entry) => (
          <DataRow key={entry.id} sx={[ROW_ACTIONS_HOVER_SX, { bgcolor: entry.equipped ? "action.hover" : undefined }]}>
            <DataCell slot="primary" sx={{ fontWeight: 400 }}>
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
            </DataCell>
            <DataCell slot={entry.slotLabel ? "inline" : "hidden"} align="center" sx={NO_WRAP_SX}>
              {entry.slotLabel ?? <EmptyValue />}
            </DataCell>
            <DataCell
              slot={(entry.quantity || 1) > 1 ? "inline" : "hidden"}
              align="center"
              phoneChildren={`×${entry.quantity || 1}`}
            >
              {entry.quantity || 1}
            </DataCell>
            <DataCell
              slot={formatWeight(entry.weight) ? "inline" : "hidden"}
              align="center"
              sx={NO_WRAP_SX}
              phoneChildren={formatPounds(entry.weight)}
            >
              {formatWeight(entry.weight) ?? <EmptyValue />}
            </DataCell>
            <DataCell
              slot={formatCost(entry.costGp) ? "inline" : "hidden"}
              align="center"
              sx={NO_WRAP_SX}
              phoneChildren={`${formatTrimmed(entry.costGp)} gp`}
            >
              {formatCost(entry.costGp) ?? <EmptyValue />}
            </DataCell>
            <DataCell slot="hidden" sx={{ fontSize: "0.875rem", minWidth: 220 }}>
              {entry.description || <EmptyValue />}
            </DataCell>
            {renderActions && (
              <DataCell slot="trailing" align="right">
                <RowActions>{renderActions(entry)}</RowActions>
              </DataCell>
            )}
          </DataRow>
        ))}
      </DataTable>
      {load}
    </Stack>
  );
}
