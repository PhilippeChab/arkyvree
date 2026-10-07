import {
  Skeleton,
  type SxProps,
  Table,
  TableBody,
  TableCell,
  type TableCellProps,
  TableHead,
  TableRow,
  type Theme,
} from "@mui/material";

import { TableFrame } from "./TableFrame.tsx";

interface TableSkeletonProps {
  /** The table's columns: their header and width */
  columns: { align?: TableCellProps["align"]; key: string; label: string; width?: string }[];
  sx?: SxProps<Theme>;
  tableSx?: SxProps<Theme>;
}

/** A table's first load: its frame and header, over rows of placeholder lines. */
export function TableSkeleton({ columns, sx, tableSx }: TableSkeletonProps) {
  return (
    <TableFrame sx={sx}>
      <Table sx={tableSx}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} align={column.align} sx={{ width: column.width }}>
                {column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
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
