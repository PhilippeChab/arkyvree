import type { ElementType, ReactNode } from "react";

import { DataTable, type DataTableColumn, type RowAction } from "@/client/src/components/common/index.ts";
import { DeleteIcon, DuplicateIcon, EditIcon, VariantsIcon } from "@/client/src/components/icons/index.ts";

interface RulesetSectionTableProps<T extends { id: string }> {
  data?: T[];
  isLoading: boolean;
  columns: (DataTableColumn & { width: string })[];
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

/** A ruleset section's table: a `DataTable` whose rows an editor edits, duplicates, varies or deletes. */
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
  const actions = (item: T): RowAction[] => [
    ...(canEdit && onEdit
      ? [{ label: "Edit", icon: <EditIcon fontSize="small" />, onClick: () => onEdit(item), color: "primary" as const }]
      : []),
    ...(canEdit && onDuplicate
      ? [{ label: "Duplicate", icon: <DuplicateIcon fontSize="small" />, onClick: () => onDuplicate(item) }]
      : []),
    ...(canEdit && onCreateVariants
      ? [{ label: "Create variants", icon: <VariantsIcon fontSize="small" />, onClick: () => onCreateVariants(item) }]
      : []),
    ...(canDelete && onDelete
      ? [
          {
            label: "Delete",
            icon: <DeleteIcon fontSize="small" />,
            onClick: () => onDelete(item.id),
            color: "error" as const,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      rows={data}
      isLoading={isLoading}
      columns={columns}
      renderCell={renderCell}
      actions={actions}
      onRowClick={onRowClick}
      onRowMouseEnter={onRowMouseEnter}
      empty={{ icon: emptyIcon, title: emptyTitle, description: emptyDescription }}
      search={search}
    />
  );
}
