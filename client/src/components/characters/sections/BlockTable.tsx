import { Typography } from "@mui/material";

import { DataCell, DataRow, DataTable, EmptyValue } from "@/client/src/components/common/index.ts";

import { GroupedRow, GroupedRows } from "./GroupedRows.tsx";
import { type SheetColumn, type SheetRow, type SheetTable, splitNameColumn } from "./sheetBlocks.ts";

interface BlockCellProps {
  column: SheetColumn;
  value: string;
}

interface BlockTableProps {
  table: SheetTable;
}

interface NameCellProps {
  row: SheetRow;
  value: string;
}

/** A row's name over its caption */
const NAME_SX = { fontWeight: 500 };

/** A fixed table's number columns' headers, smaller, and their cells closer to their figures */
const NARROW_HEADERS_SX = {
  "& > thead th:not(:first-of-type)": { fontSize: "0.8125rem" },
  "& th:not(:first-of-type), & td:not(:first-of-type)": { px: { sm: 1 } },
};

/** A cell that keeps to one line */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/** A total's cell, bold */
const STRONG_SX = { fontWeight: 600 };

/**
 * A row's name, bolder over its caption (in parentheses: after the name on a phone, wrapping under it whole), and its
 * alert under that.
 */
function NameCell({ row, value }: NameCellProps) {
  return (
    <DataCell slot="primary" {...(row.caption && { sx: NAME_SX })}>
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

/**
 * A row's cell of a column past its name: where its column's slot puts it on a phone, labeled there where it says, an
 * empty one hidden where it may be (a dash from `sm` up, unless its column says none).
 */
export function BlockCell({ column, value }: BlockCellProps) {
  const hidden = column.hideEmpty && !value;
  const styles = [column.noWrap && NO_WRAP_SX, column.strong && STRONG_SX].filter((style) => !!style);
  const sx = styles.length > 1 ? { ...styles[0], ...styles[1] } : styles[0];
  return (
    <DataCell
      slot={hidden ? "hidden" : column.slot}
      label={column.slot === "labeled" ? column.label : undefined}
      align={column.align}
      {...(sx && { sx })}
    >
      {hidden && !column.noDash ? <EmptyValue /> : value}
    </DataCell>
  );
}

/**
 * A block's table: its columns as described, each cell where its column's slot puts it on a phone. A grouped table's
 * rows of a family two or more share go under its header, which shows or hides them, each by its name within it.
 */
export function BlockTable({ table }: BlockTableProps) {
  const { name: nameColumn, others } = splitNameColumn(table.columns);
  const columns = [nameColumn, ...others].map(({ key, label, width, align }) => ({ key, label, width, align }));
  const cellsOf = (row: SheetRow) =>
    others.map((column) => <BlockCell key={column.key} column={column} value={row.cells[column.key] ?? ""} />);

  return (
    <DataTable
      size="small"
      columns={columns}
      minWidth={table.minWidth}
      {...(table.fixed && { fixed: true, sx: NARROW_HEADERS_SX })}
    >
      {table.grouped ? (
        <GroupedRows
          rows={table.rows.map((row) => ({ ...row, family: row.group ?? null }))}
          columns={table.columns.length}
          renderRow={(row, placement) => {
            const name = row.cells[nameColumn.key] ?? "";
            return (
              <GroupedRow key={row.key} name={name} shortName={row.short ?? name} {...placement}>
                {cellsOf(row)}
              </GroupedRow>
            );
          }}
        />
      ) : (
        table.rows.map((row) => (
          <DataRow key={row.key}>
            <NameCell row={row} value={row.cells[nameColumn.key] ?? ""} />
            {cellsOf(row)}
          </DataRow>
        ))
      )}
    </DataTable>
  );
}
