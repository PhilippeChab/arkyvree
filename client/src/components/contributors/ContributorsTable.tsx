import { Chip, Typography } from "@mui/material";

import {
  DataTable,
  type DataTableColumn,
  type DataTableEmpty,
  type RowAction,
} from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

interface ContributorRow {
  id: string;
  email: string;
  status: string;
  role?: string;
  user?: { username?: string | null } | null;
}

/** The owner's row, or a contributor's */
type TableRow<T> = { id: string; username?: string | null; email: string } & (
  | { owner: true }
  | { owner: false; contributor: T }
);

interface ContributorsTableProps<T extends ContributorRow> {
  owner: { username?: string | null; emailAddress: string } | null;
  contributors: T[];
  isLoading?: boolean;
  /** Show the Role column (rulesets have roles, characters don't). */
  showRoles?: boolean;
  /** A contributor's row actions; the owner's row has none. */
  actions?: (contributor: T) => RowAction[];
  /** What the table shows with no owner and no contributor */
  empty: DataTableEmpty;
}

const OWNER_ROW_ID = "owner";

function contributorStatusColor(status: string): "warning" | "success" | "error" | "default" {
  switch (status) {
    case "Pending":
      return "warning";
    case "Active":
      return "success";
    case "Rejected":
      return "error";
    default:
      return "default";
  }
}

function roleColor(role: string): "error" | "primary" | "default" {
  switch (role) {
    case "Admin":
      return "error";
    case "Editor":
      return "primary";
    default:
      return "default";
  }
}

/** Owner row followed by the invited contributors, with their status. */
export function ContributorsTable<T extends ContributorRow>({
  owner,
  contributors,
  isLoading = false,
  showRoles = false,
  actions,
  empty,
}: ContributorsTableProps<T>) {
  const isMobile = useIsMobile();
  const columns: DataTableColumn[] = [
    { key: "user", label: "User" },
    { key: "email", label: "Email", hideOnMobile: true },
    ...(showRoles ? [{ key: "role", label: "Role" }] : []),
    { key: "status", label: "Status" },
  ];
  const rows: TableRow<T>[] = [
    ...(owner ? [{ id: OWNER_ROW_ID, username: owner.username, email: owner.emailAddress, owner: true as const }] : []),
    ...contributors.map((contributor) => ({
      id: contributor.id,
      username: contributor.user?.username,
      email: contributor.email,
      owner: false as const,
      contributor,
    })),
  ];
  const ownerChip = <Chip label="Owner" size="small" color="primary" variant="filled" />;

  function renderCell(row: TableRow<T>, column: string) {
    switch (column) {
      case "user":
        return (
          <>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {row.username || "—"}
            </Typography>
            {isMobile && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {row.email}
              </Typography>
            )}
          </>
        );
      case "email":
        return row.email;
      case "role":
        if (row.owner) return ownerChip;
        return (
          row.contributor.role && (
            <Chip
              label={row.contributor.role}
              size="small"
              color={roleColor(row.contributor.role)}
              variant="outlined"
            />
          )
        );
      default:
        if (row.owner) {
          return showRoles ? <Chip label="Active" size="small" color="success" variant="filled" /> : ownerChip;
        }
        return (
          <Chip
            label={row.contributor.status}
            size="small"
            color={contributorStatusColor(row.contributor.status)}
            variant="filled"
          />
        );
    }
  }

  return (
    <DataTable<TableRow<T>>
      rows={rows}
      isLoading={isLoading}
      columns={columns}
      size={isMobile ? "small" : "medium"}
      minWidth={0}
      renderCell={renderCell}
      actions={actions && ((row) => (row.owner ? [] : actions(row.contributor)))}
      empty={empty}
    />
  );
}
