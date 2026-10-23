import { Typography } from "@mui/material";

import { DataCell, DataRow, DataTable, EmptyValue } from "@/client/src/components/common/index.ts";

import type { SheetTable } from "./sheetBlocks.ts";

interface BlockTableProps {
  table: SheetTable;
}

/** A row's name over its caption */
const NAME_SX = { fontWeight: 500 };

/** A cell that keeps to one line */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/**
 * A block's table: its columns as described, each cell where its column's slot puts it on a phone, an empty one hidden
 * there where its column says. A row's name leads, bolder over its caption (in parentheses: after the name on a phone,
 * wrapping under it whole), and its alert under that.
 */
export function BlockTable({ table }: BlockTableProps) {
  const columns = table.columns.map(({ key, label, width, align }) => ({ key, label, width, align }));

  return (
    <DataTable size="small" columns={columns} minWidth={table.minWidth}>
      {table.rows.map((row) => (
        <DataRow key={row.key}>
          {table.columns.map((column) => {
            const value = row.cells[column.key] ?? "";
            if (column.slot === "primary") {
              return (
                <DataCell key={column.key} slot="primary" {...(row.caption && { sx: NAME_SX })}>
                  {value}
                  {row.caption && (
                    <Typography
                      variant="caption"
                      sx={{
                        // On a phone, after the name, wrapping under it whole
                        display: { xs: "inline-block", sm: "block" },
                        color: "text.secondary",
                        pl: { xs: 0.5, sm: 0 },
                      }}
                    >
                      ({row.caption})
                    </Typography>
                  )}
                  {row.alert && (
                    <Typography variant="caption" sx={{ display: "block", color: "error.main", fontWeight: 600 }}>
                      {row.alert}
                    </Typography>
                  )}
                </DataCell>
              );
            }
            const hidden = column.hideEmpty && !value;
            return (
              <DataCell
                key={column.key}
                slot={hidden ? "hidden" : column.slot}
                label={column.slot === "labeled" ? column.label : undefined}
                align={column.align}
                {...(column.noWrap && { sx: NO_WRAP_SX })}
              >
                {hidden ? <EmptyValue /> : value}
              </DataCell>
            );
          })}
        </DataRow>
      ))}
    </DataTable>
  );
}
