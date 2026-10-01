import {
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  LibraryAdd as LibraryAddIcon,
} from "@mui/icons-material";
import {
  Box,
  IconButton,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import { type ElementType, type ReactNode, useMemo, useRef } from "react";

import {
  BlankState,
  CLICKABLE_SX,
  clickableProps,
  NoMatchesState,
  ROW_ACTIONS_HOVER_SX,
  ROW_ACTIONS_SX,
} from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";

import { TABLE_CONTAINER_LOADING_STYLE, TABLE_CONTAINER_STYLE, TABLE_STYLE } from "./tableStyles.ts";

interface Column {
  key: string;
  label: string;
  width: string;
  hideOnMobile?: boolean;
}

interface RulesetSectionTableProps<T extends { id: string }> {
  data?: T[];
  isLoading: boolean;
  columns: Column[];
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (item: T) => void;
  onDelete?: (itemId: string) => void;
  onDuplicate?: (item: T) => void;
  onCreateVariants?: (item: T) => void;
  onRowClick?: (item: T) => void;
  onRowMouseEnter?: (item: T) => void;
  renderCell: (item: T, columnKey: string) => ReactNode;
  emptyIcon?: ElementType;
  emptyTitle?: string;
  emptyDescription?: string;
  /** The section's search, so an empty result reads as no matches rather than an empty section. */
  search?: string;
}

export function RulesetSectionTable<T extends { id: string }>({
  data,
  isLoading,
  columns,
  canEdit = false,
  canDelete = false,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateVariants,
  onRowClick,
  onRowMouseEnter,
  renderCell,
  emptyIcon,
  emptyTitle = "No data available",
  emptyDescription = "No data available for this ruleset.",
  search,
}: RulesetSectionTableProps<T>) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isMobile = useIsMobile();
  const visibleColumns = useMemo(
    () => (isMobile ? columns.filter((c) => !c.hideOnMobile) : columns),
    [columns, isMobile],
  );

  const showInlineActions =
    (canEdit && onEdit) || (canDelete && onDelete) || (canEdit && onDuplicate) || (canEdit && onCreateVariants);

  if (isLoading) {
    return (
      <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_LOADING_STYLE}>
        <Table sx={TABLE_STYLE}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell key={column.key} sx={{ width: column.width, fontWeight: 600 }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
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

  if (!data || data.length === 0) {
    return search ? (
      <NoMatchesState search={search} />
    ) : (
      <BlankState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_STYLE}>
      <Table sx={TABLE_STYLE}>
        <TableHead>
          <TableRow>
            {visibleColumns.map((column) => (
              <TableCell key={column.key} sx={{ width: column.width, fontWeight: 600 }}>
                {column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={item.id}
              hover
              {...(onRowClick && clickableProps(() => onRowClick(item)))}
              onMouseEnter={
                onRowMouseEnter
                  ? () => {
                      clearTimeout(hoverTimer.current);
                      hoverTimer.current = setTimeout(() => onRowMouseEnter(item), 150);
                    }
                  : undefined
              }
              onMouseLeave={onRowMouseEnter ? () => clearTimeout(hoverTimer.current) : undefined}
              onFocus={onRowMouseEnter ? () => onRowMouseEnter(item) : undefined}
              sx={{
                position: "relative",
                ...(onRowClick && CLICKABLE_SX),
                ...ROW_ACTIONS_HOVER_SX,
                ...fadeInUpSx(index),
              }}
            >
              {visibleColumns.map((column, index) => (
                <TableCell
                  key={column.key}
                  sx={{ position: index === visibleColumns.length - 1 && showInlineActions ? "relative" : undefined }}
                >
                  {index === visibleColumns.length - 1 && showInlineActions ? (
                    <>
                      <Box
                        sx={{
                          pr:
                            [
                              canEdit && onEdit,
                              canEdit && onDuplicate,
                              canEdit && onCreateVariants,
                              canDelete && onDelete,
                            ].filter(Boolean).length * 5,
                        }}
                      >
                        {renderCell(item, column.key)}
                      </Box>
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
                          width: canDelete ? "auto" : "fit-content",
                        }}
                      >
                        {canEdit && onEdit && (
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(item);
                              }}
                              sx={{ color: "primary.main" }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canEdit && onDuplicate && (
                          <Tooltip title="Duplicate">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicate(item);
                              }}
                            >
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canEdit && onCreateVariants && (
                          <Tooltip title="Create variants">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateVariants(item);
                              }}
                            >
                              <LibraryAddIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canDelete && onDelete && (
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(item.id);
                              }}
                              sx={{ color: "error.main" }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </>
                  ) : (
                    renderCell(item, column.key)
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
