import {
  Box,
  IconButton,
  Paper,
  Skeleton,
  type SxProps,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  type Theme,
  Tooltip,
} from "@mui/material";
import { type ElementType, type ReactNode, useMemo, useRef } from "react";

import { useIsMobile, useStaggerOffset } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";

import { BlankState, NoMatchesState } from "./BlankState.tsx";
import { CLICKABLE_SX, clickableProps } from "./clickable.ts";
import { ROW_ACTIONS_HOVER_SX, ROW_ACTIONS_SX } from "./rowActions.ts";
import { TABLE_CONTAINER_LOADING_STYLE, TABLE_CONTAINER_STYLE } from "./tableStyles.ts";

interface DataTableProps<T extends { id: string }> {
  rows: T[] | undefined;
  isLoading: boolean;
  columns: DataTableColumn[];
  renderCell: (row: T, columnKey: string) => ReactNode;
  /** The row's actions, over its last cell: shown on hover or focus, always on a touch screen */
  actions?: (row: T) => RowAction[];
  onRowClick?: (row: T) => void;
  /** Whether a click opens the row, when only some rows open (default: every row) */
  isRowClickable?: (row: T) => boolean;
  /** Prefetches what a click on the row opens, once the pointer rests on it (or it's focused) */
  onRowMouseEnter?: (row: T) => void;
  /** A row's own look (an unread notification) */
  rowSx?: (row: T) => SxProps<Theme>;
  /** What an empty table shows; a search that found nothing says so instead */
  empty: DataTableEmpty;
  search?: string;
  size?: "small" | "medium";
  /** The narrowest the table lays out at: it scrolls sideways below it */
  minWidth?: number;
}

interface RowActionsProps {
  actions: RowAction[];
}

export interface DataTableColumn {
  key: string;
  label: string;
  width?: string;
  /** Left out on a phone's narrow screen */
  hideOnMobile?: boolean;
}

/** One of a row's actions: an icon button its label names. */
export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  color?: "primary" | "warning" | "error";
  disabled?: boolean;
}

/** What an empty table shows */
export interface DataTableEmpty {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** A row's actions, laid over its last cell. */
function RowActions({ actions }: RowActionsProps) {
  return (
    <Box
      className="row-actions"
      sx={{
        position: "absolute",
        right: 8,
        top: "50%",
        transform: "translateY(-50%)",
        ...ROW_ACTIONS_SX,
        display: "flex",
        gap: 0.5,
        bgcolor: "background.paper",
        borderRadius: 1,
        boxShadow: 1,
        p: 0.25,
      }}
    >
      {actions.map(({ label, icon, onClick, color, disabled }) => (
        <Tooltip key={label} title={label}>
          <span>
            <IconButton
              size="small"
              aria-label={label}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              sx={color ? { color: `${color}.main` } : undefined}
            >
              {icon}
            </IconButton>
          </span>
        </Tooltip>
      ))}
    </Box>
  );
}

/**
 * The app's table of rows: its columns (fewer on a phone), a skeleton while it loads, an empty state (or the search's
 * no matches), rows a click opens, and each row's actions on hover.
 */
export function DataTable<T extends { id: string }>({
  rows,
  isLoading,
  columns,
  renderCell,
  actions,
  onRowClick,
  isRowClickable,
  onRowMouseEnter,
  rowSx,
  empty,
  search,
  size = "medium",
  minWidth = 600,
}: DataTableProps<T>) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isMobile = useIsMobile();
  const staggerOffset = useStaggerOffset(rows);
  const visibleColumns = useMemo(
    () => (isMobile ? columns.filter((c) => !c.hideOnMobile) : columns),
    [columns, isMobile],
  );

  const head = (
    <TableHead>
      <TableRow>
        {visibleColumns.map((column) => (
          <TableCell key={column.key} sx={{ width: column.width }}>
            {column.label}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );

  if (isLoading) {
    return (
      <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_LOADING_STYLE}>
        <Table size={size} sx={{ minWidth }}>
          {head}
          <TableBody>
            {[...Array(5)].map((_, index) => (
              <TableRow key={index}>
                {visibleColumns.map((column) => (
                  <TableCell key={column.key}>
                    <Skeleton variant="text" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (!rows || rows.length === 0) {
    return search ? (
      <NoMatchesState search={search} />
    ) : (
      <BlankState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_STYLE}>
      <Table size={size} sx={{ minWidth }}>
        {head}
        <TableBody>
          {rows.map((row, index) => {
            const rowActions = actions?.(row) ?? [];
            const ownSx = rowSx?.(row);
            const clickable = !!onRowClick && (isRowClickable?.(row) ?? true);
            return (
              <TableRow
                key={row.id}
                hover={clickable || rowActions.length > 0}
                {...(clickable && clickableProps(() => onRowClick?.(row)))}
                onMouseEnter={
                  onRowMouseEnter
                    ? () => {
                        clearTimeout(hoverTimer.current);
                        hoverTimer.current = setTimeout(() => onRowMouseEnter(row), 150);
                      }
                    : undefined
                }
                onMouseLeave={onRowMouseEnter ? () => clearTimeout(hoverTimer.current) : undefined}
                onFocus={onRowMouseEnter ? () => onRowMouseEnter(row) : undefined}
                sx={[
                  {
                    position: "relative",
                    ...(clickable && CLICKABLE_SX),
                    ...ROW_ACTIONS_HOVER_SX,
                    ...fadeInUpSx(index, staggerOffset),
                  },
                  ...(Array.isArray(ownSx) ? ownSx : [ownSx]),
                ]}
              >
                {visibleColumns.map((column, columnIndex) => {
                  const carriesActions = columnIndex === visibleColumns.length - 1 && rowActions.length > 0;
                  return (
                    <TableCell key={column.key} sx={{ position: carriesActions ? "relative" : undefined }}>
                      {carriesActions ? (
                        <>
                          <Box sx={{ pr: rowActions.length * 5 }}>{renderCell(row, column.key)}</Box>
                          <RowActions actions={rowActions} />
                        </>
                      ) : (
                        renderCell(row, column.key)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
