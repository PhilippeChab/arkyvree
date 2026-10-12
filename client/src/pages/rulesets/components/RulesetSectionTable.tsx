import { Table, TableBody, TableCell, TableRow } from "@mui/material";
import type { ReactNode } from "react";

import {
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
import { useRowPrefetch } from "@/client/src/pages/rulesets/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

import { TABLE_CONTAINER_LOADING_SX, TABLE_CONTAINER_SX, TABLE_SX } from "./tableStyles.ts";

interface RulesetSectionTableProps<T extends { id: string }> {
  /**
   * The rows before the page that came in, which its rows' stagger starts after (`fadeInUpSx`): a paged list's
   * `itemsBeforeLastPage(data)`, so a page loaded with Load More fades in at once.
   */
  animationOffset?: number;
  /** Its rows' actions, for who may edit the ruleset's entities: each shows when its handler is given */
  canEdit?: boolean;
  columns: TableColumn[];
  data?: T[];
  /** What it shows while it lists nothing and nothing was searched: its `BlankState` */
  empty: ReactNode;
  /** Its query's failure, shown while there are no rows to keep (a failed refetch keeps them). */
  error?: unknown;
  isLoading: boolean;
  onCreateVariants?: (item: T) => void;
  onDelete?: (itemId: string) => void;
  onDuplicate?: (item: T) => void;
  onEdit?: (item: T) => void;
  onRowClick?: (item: T) => void;
  /** Warms the page a row opens (`useRowPrefetch`): 150ms into a hover, at once on focus */
  onRowPrefetch?: (item: T) => void;
  renderCell: (item: T, columnKey: string) => ReactNode;
  /** A row's delete can be undone from Local Changes (`useRestorableDelete`): "Delete", not "Delete Permanently". */
  restorable?: boolean;
  /** The section's search, so an empty result reads as no matches rather than an empty section. */
  search?: string;
  /** What it lists, as a failure names it ("Races"). */
  what: string;
}

/** The column a row's actions take, at its end */
const ACTIONS_COLUMN: TableColumn = { align: "right", key: "actions", label: "Actions" };

export function RulesetSectionTable<T extends { id: string }>({
  animationOffset = 0,
  data,
  isLoading,
  error,
  what,
  columns,
  canEdit = false,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateVariants,
  onRowClick,
  onRowPrefetch,
  renderCell,
  restorable = false,
  empty,
  search,
}: RulesetSectionTableProps<T>) {
  const prefetchProps = useRowPrefetch(onRowPrefetch);

  const showInlineActions = canEdit && !!(onEdit || onDelete || onDuplicate || onCreateVariants);

  const headerColumns = showInlineActions ? [...columns, ACTIONS_COLUMN] : columns;

  if (isLoading) return <TableSkeleton columns={headerColumns} sx={TABLE_CONTAINER_LOADING_SX} tableSx={TABLE_SX} />;

  if (error && !data?.length) return <LoadError what={what} error={error} />;

  if (!data || data.length === 0) return search ? <NoMatchesState search={search} /> : empty;

  return (
    <TableFrame sx={TABLE_CONTAINER_SX}>
      <Table sx={TABLE_SX}>
        <TableColumnsHead columns={headerColumns} />
        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={item.id}
              {...(onRowClick && clickableProps(() => onRowClick(item)))}
              {...prefetchProps(item)}
              sx={[!!onRowClick && CLICKABLE_ROW_SX, ROW_ACTIONS_HOVER_SX, fadeInUpSx(index, animationOffset)]}
            >
              {columns.map((column) => (
                <TableCell key={column.key}>{renderCell(item, column.key)}</TableCell>
              ))}
              {showInlineActions && (
                <TableCell align="right">
                  <RowActions>
                    {onEdit && <RowAction icon={EditIcon} label="Edit" onClick={() => onEdit(item)} />}
                    {onDuplicate && <RowAction icon={CopyIcon} label="Duplicate" onClick={() => onDuplicate(item)} />}
                    {onCreateVariants && (
                      <RowAction icon={LibraryAddIcon} label="Create Variants" onClick={() => onCreateVariants(item)} />
                    )}
                    {onDelete && (
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
