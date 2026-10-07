import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";

import {
  EmptyValue,
  RoleChip,
  ROW_ACTIONS_HOVER_SX,
  RowActions,
  StatusChip,
  TableFrame,
} from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";

interface ContributorsTableProps<T extends ContributorRow> {
  contributors: T[];
  owner: { emailAddress: string; username?: string | null } | null;
  /** A row's `RowAction`s; when omitted there is no Actions column. */
  renderActions?: (contributor: T) => ReactNode;
}

/** A contributor's row, a ruleset's or a character's: who, their role and their invite's status. */
export interface ContributorRow {
  email: string;
  id: string;
  role: ContributorRole;
  status: string;
  user?: { username?: string | null } | null;
}

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

function roleColor(role: ContributorRole): "error" | "primary" | "default" {
  switch (role) {
    case "Admin":
      return "error";
    case "Editor":
      return "primary";
    default:
      return "default";
  }
}

/** Owner row followed by the invited contributors, with their role and their status. */
export function ContributorsTable<T extends ContributorRow>({
  owner,
  contributors,
  renderActions,
}: ContributorsTableProps<T>) {
  const isMobile = useIsMobile();

  const userCell = (username: string | null | undefined, email: string) => (
    <TableCell>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {username || <EmptyValue />}
      </Typography>
      {isMobile && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {email}
        </Typography>
      )}
    </TableCell>
  );

  return (
    <TableFrame>
      <Table size={isMobile ? "small" : "medium"}>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            {!isMobile && <TableCell>Email</TableCell>}
            <TableCell>Role</TableCell>
            <TableCell>Status</TableCell>
            {renderActions && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {owner && (
            <TableRow>
              {userCell(owner.username, owner.emailAddress)}
              {!isMobile && <TableCell>{owner.emailAddress}</TableCell>}
              <TableCell>
                <RoleChip label="Owner" color="primary" />
              </TableCell>
              <TableCell>
                <StatusChip label="Active" color="success" />
              </TableCell>
              {renderActions && <TableCell align="right" />}
            </TableRow>
          )}
          {contributors.map((contributor) => (
            <TableRow key={contributor.id} sx={ROW_ACTIONS_HOVER_SX}>
              {userCell(contributor.user?.username, contributor.email)}
              {!isMobile && <TableCell>{contributor.email}</TableCell>}
              <TableCell>
                <RoleChip label={contributor.role} color={roleColor(contributor.role)} />
              </TableCell>
              <TableCell>
                <StatusChip label={contributor.status} color={contributorStatusColor(contributor.status)} />
              </TableCell>
              {renderActions && (
                <TableCell align="right">
                  <RowActions>{renderActions(contributor)}</RowActions>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
