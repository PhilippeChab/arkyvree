import { Skeleton, type SxProps, Table, TableBody, TableCell, TableRow, type Theme } from "@mui/material";

import { type TableColumn, TableColumnsHead } from "./TableColumnsHead.tsx";
import { TableFrame } from "./TableFrame.tsx";

interface TableSkeletonProps {
  /** The table's columns: their header and width */
  columns: readonly TableColumn[];
  sx?: SxProps<Theme>;
  tableSx?: SxProps<Theme>;
}

/** A table's first load: its frame and header, over rows of placeholder lines. */
export function TableSkeleton({ columns, sx, tableSx }: TableSkeletonProps) {
  return (
    <TableFrame sx={sx}>
      <Table sx={tableSx}>
        <TableColumnsHead columns={columns} />
        <TableBody>
          {[...Array(5)].map((_, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column.key}>
                  <Skeleton variant="text" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
