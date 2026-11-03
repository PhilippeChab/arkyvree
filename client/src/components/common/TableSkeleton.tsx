import { Skeleton, type SxProps, type Theme } from "@mui/material";

import { DataCell, DataRow, DataTable } from "./DataTable.tsx";
import type { TableColumn } from "./TableColumnsHead.tsx";

interface TableSkeletonProps {
  /** The table's columns: their header and width, and where their cells go on a phone */
  columns: readonly TableColumn[];
  /** Its table's least width from `sm` up (`DataTable`'s) */
  minWidth?: number;
  sx?: SxProps<Theme>;
}

/** A table's first load: its frame and header, over rows of placeholder lines, a list's lines on a phone. */
export function TableSkeleton({ columns, minWidth, sx }: TableSkeletonProps) {
  return (
    <DataTable framed columns={columns} minWidth={minWidth} containerSx={sx}>
      {[...Array(5)].map((_, index) => (
        <DataRow key={index}>
          {columns.map((column, columnIndex) => (
            // On a phone, an item's first line holds its place
            <DataCell key={column.key} slot={columnIndex === 0 ? "primary" : "hidden"}>
              <Skeleton variant="text" />
            </DataCell>
          ))}
        </DataRow>
      ))}
    </DataTable>
  );
}
