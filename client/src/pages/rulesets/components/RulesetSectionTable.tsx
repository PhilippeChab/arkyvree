import { Table, TableBody, TableCell, TableRow } from "@mui/material";
import { type ElementType, type ReactNode, useMemo, useRef } from "react";

import {
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  LoadError,
  NoMatchesState,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  type TableColumn,
  TableColumnsHead,
  TableFrame,
  TableSkeleton,
} from "@/client/src/components/common/index.ts";
import { CopyIcon, DeleteIcon, EditIcon, LibraryAddIcon } from "@/client/src/components/icons/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

import { TABLE_CONTAINER_LOADING_SX, TABLE_CONTAINER_SX, TABLE_SX } from "./tableStyles.ts";

interface Column extends TableColumn {
  hideOnMobile?: boolean;
}

interface RulesetSectionTableProps<T extends { id: string }> {
  canDelete?: boolean;
  canEdit?: boolean;
  columns: Column[];
  data?: T[];
  emptyDescription: string;
  emptyIcon: ElementType;
  emptyTitle: string;
  /** Its query's failure, shown while there are no rows to keep (a failed refetch keeps them). */
  error?: unknown;
  isLoading: boolean;
  onCreateVariants?: (item: T) => void;
  onDelete?: (itemId: string) => void;
  onDuplicate?: (item: T) => void;
  onEdit?: (item: T) => void;
  onRowClick?: (item: T) => void;
  onRowMouseEnter?: (item: T) => void;
  renderCell: (item: T, columnKey: string) => ReactNode;
  /** A row's delete can be undone from Local Changes (`useRestorableDelete`): "Delete", not "Delete Permanently". */
  restorable?: boolean;
  /** The section's search, so an empty result reads as no matches rather than an empty section. */
  search?: string;
  /** What it lists, as a failure names it ("Races"). */
  what: string;
}

/** The column a row's actions take, at its end */
const ACTIONS_COLUMN: Column = { align: "right", key: "actions", label: "Actions" };

export function RulesetSectionTable<T extends { id: string }>({
  data,
  isLoading,
  error,
  what,
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
  restorable = false,
  emptyIcon,
  emptyTitle,
  emptyDescription,
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

  const headerColumns = showInlineActions ? [...visibleColumns, ACTIONS_COLUMN] : visibleColumns;

  if (isLoading) return <TableSkeleton columns={headerColumns} sx={TABLE_CONTAINER_LOADING_SX} tableSx={TABLE_SX} />;

  if (error && !data?.length) return <LoadError what={what} error={error} />;

  if (!data || data.length === 0) {
    return search ? (
      <NoMatchesState search={search} />
    ) : (
      <BlankState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <TableFrame sx={TABLE_CONTAINER_SX}>
      <Table sx={TABLE_SX}>
        <TableColumnsHead columns={headerColumns} />
        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={item.id}
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
              sx={[!!onRowClick && CLICKABLE_ROW_SX, ROW_ACTIONS_HOVER_SX, fadeInUpSx(index)]}
            >
              {visibleColumns.map((column) => (
                <TableCell key={column.key}>{renderCell(item, column.key)}</TableCell>
              ))}
              {showInlineActions && (
                <TableCell align="right">
                  <RowActions>
                    {canEdit && onEdit && <RowAction icon={EditIcon} label="Edit" onClick={() => onEdit(item)} />}
                    {canEdit && onDuplicate && (
                      <RowAction icon={CopyIcon} label="Duplicate" onClick={() => onDuplicate(item)} />
                    )}
                    {canEdit && onCreateVariants && (
                      <RowAction icon={LibraryAddIcon} label="Create Variants" onClick={() => onCreateVariants(item)} />
                    )}
                    {canDelete && onDelete && (
                      <RowAction
                        icon={DeleteIcon}
                        label={restorable ? "Delete" : "Delete Permanently"}
                        intent="destructive"
                        onClick={() => onDelete(item.id)}
                      />
                    )}
                  </RowActions>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
