import { TableCell, type TableCellProps, TableHead, TableRow } from "@mui/material";

interface TableColumnsHeadProps {
  columns: readonly TableColumn[];
}

/** A table's column: its key, its header and its width. */
export interface TableColumn {
  align?: TableCellProps["align"];
  key: string;
  label: string;
  width?: string;
}

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
