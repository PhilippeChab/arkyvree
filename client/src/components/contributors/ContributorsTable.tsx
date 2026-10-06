import { Typography } from "@mui/material";

import {
  DataTable,
  type DataTableColumn,
  type DataTableEmpty,
  type RowAction,
  type Tag,
  TagChip,
} from "@/client/src/components/common/index.ts";
import {
  AdminIcon,
  CheckIcon,
  EditorIcon,
  OwnerIcon,
  PendingIcon,
  RejectedIcon,
  RevokeIcon,
  ViewerIcon,
} from "@/client/src/components/icons/index.ts";
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

/** A contributor's role */
const CONTRIBUTOR_ROLES: Record<string, Tag> = {
  Admin: { icon: AdminIcon, label: "Admin", color: "error" },
  Editor: { icon: EditorIcon, label: "Editor", color: "primary" },
  Viewer: { icon: ViewerIcon, label: "Viewer", color: "default" },
};

/** Where a contributor's invite stands */
const CONTRIBUTOR_STATUSES: Record<string, Tag> = {
  Pending: { icon: PendingIcon, label: "Invite Pending", color: "warning" },
  Active: { icon: CheckIcon, label: "Active", color: "success" },
  Rejected: { icon: RejectedIcon, label: "Rejected", color: "error" },
  Revoked: { icon: RevokeIcon, label: "Revoked", color: "default" },
};

const OWNER: Tag = { icon: OwnerIcon, label: "Owner", color: "primary" };

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
        if (row.owner) return <TagChip tag={OWNER} />;
        return row.contributor.role && <TagChip tag={CONTRIBUTOR_ROLES[row.contributor.role]} />;
      default:
        if (row.owner) return <TagChip tag={showRoles ? CONTRIBUTOR_STATUSES.Active : OWNER} />;
        return <TagChip tag={CONTRIBUTOR_STATUSES[row.contributor.status]} />;
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
