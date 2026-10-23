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
import { formatAmount, formatTrimmedAmount } from "@/client/src/lib/formatNumeric.ts";

import { type BlockOf, entityPagePath, type InventoryRow } from "./sheetBlocks.ts";

interface InventoryTableProps {
  block: BlockOf<"inventory">;
  /** The load the character carries, under the table. */
  load?: ReactNode;
  /** The row's `RowAction`s, when the viewer can change the inventory. */
  renderActions?: (row: InventoryRow) => ReactNode;
  /** Links each item to its page in this ruleset. */
  rulesetId?: string;
}

/** Slots and figures stay on one line */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/**
 * A character's inventory: each item's slot, quantity, weight and value, in its block's units, and the carried load
 * under it. On a phone, its name leads, its actions at the line's end, its slot and its figures under them; its
 * description is its page's.
 */
export function InventoryTable({ block, load, rulesetId, renderActions }: InventoryTableProps) {
  const { columns: words } = block.words;
  const columns: TableColumn[] = [
    { key: "item", label: words.item },
    { key: "slot", label: words.slot, align: "center" },
    { key: "quantity", label: words.quantity, align: "center" },
    { key: "weight", label: words.weight, align: "center" },
    { key: "value", label: words.value, align: "center" },
    { key: "description", label: words.description },
    // The column its actions take, at its end
    ...(renderActions ? [{ key: "actions", label: "Actions", align: "right" as const }] : []),
  ];

  return (
    <Stack spacing={2}>
      <DataTable size="small" columns={columns} minWidth={640} inset={1}>
        {block.rows.map((row) => {
          const quantity = row.quantity || 1;
          const weight = formatAmount(row.weight, block.units.weight);
          const cost = formatAmount(row.cost, block.units.cost);
          const path = entityPagePath(rulesetId, block.entityType, row.id);
          return (
            <DataRow key={row.key} sx={[ROW_ACTIONS_HOVER_SX, { bgcolor: row.held ? "action.hover" : undefined }]}>
              <DataCell slot="primary">
                {path ? (
                  <MuiLink component={Link} to={path} target="_blank" underline="hover">
                    {row.name || block.words.unknown}
                  </MuiLink>
                ) : (
                  row.name || block.words.unknown
                )}
                {row.charges && (
                  <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                    {block.words.charges}: {row.charges.remaining ?? 0}/{row.charges.total}
                  </Typography>
                )}
              </DataCell>
              <DataCell slot={row.slot ? "inline" : "hidden"} align="center" sx={NO_WRAP_SX}>
                {row.slot ?? <EmptyValue />}
              </DataCell>
              <DataCell slot={quantity > 1 ? "inline" : "hidden"} align="center" phoneChildren={`×${quantity}`}>
                {quantity}
              </DataCell>
              <DataCell
                slot={weight ? "inline" : "hidden"}
                align="center"
                sx={NO_WRAP_SX}
                phoneChildren={formatTrimmedAmount(row.weight, block.units.weight)}
              >
                {weight ?? <EmptyValue />}
              </DataCell>
              <DataCell
                slot={cost ? "inline" : "hidden"}
                align="center"
                sx={NO_WRAP_SX}
                phoneChildren={formatTrimmedAmount(row.cost, block.units.cost)}
              >
                {cost ?? <EmptyValue />}
              </DataCell>
              <DataCell slot="hidden" sx={{ fontSize: "0.875rem", minWidth: 220 }}>
                {row.description || <EmptyValue />}
              </DataCell>
              {renderActions && (
                <DataCell slot="trailing" align="right">
                  <RowActions>{renderActions(row)}</RowActions>
                </DataCell>
              )}
            </DataRow>
          );
        })}
      </DataTable>
      {load}
    </Stack>
  );
}
