import { TableCell, type TableCellProps, TableHead, TableRow } from "@mui/material";

interface TableColumnsHeadProps {
  columns: readonly TableColumn[];
}

/** A table's column: its key, its header and its width, and where its cells go on a phone (`DataTable`). */
export interface TableColumn {
  align?: TableCellProps["align"];
  key: string;
  label: string;
  slot?: PhoneSlot;
  width?: string;
}

/**
 * Where a cell goes on a phone, where a `DataTable`'s row is a list's item: its `primary` cell first, a `trailing` one
 * (the number a player reads, the row's actions) at the end of that line, then its `inline` cells (chips, a short
 * text) and its `labeled` ones (led by their column's name: "Rank 6") on the line under it, a `block` one (a
 * description, what a row expands to) on a line of its own, and a `hidden` one not at all.
 */
export type PhoneSlot = "block" | "hidden" | "inline" | "labeled" | "primary" | "trailing";

/** A table's header, from its columns: a cell each, its label at its width, which the theme draws. */
export function TableColumnsHead({ columns }: TableColumnsHeadProps) {
  return (
    <TableHead>
      <TableRow>
        {columns.map((column) => (
          <TableCell key={column.key} align={column.align} sx={{ width: column.width }}>
            {column.label}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}
