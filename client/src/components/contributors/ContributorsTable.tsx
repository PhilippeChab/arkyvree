import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { EmptyValue, ROW_ACTIONS_HOVER_SX, RowActions, TableFrame } from "@/client/src/components/common/index.ts";
import { InviteStatusChip } from "@/client/src/components/invites/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import type { Contributor, ContributorsPage } from "./contributorKinds.ts";
import { ContributorRoleChip } from "./ContributorRoleChip.tsx";

interface ContributorsTableProps {
  contributors: Contributor[];
  owner: ContributorsPage["owner"];
  /** A row's `RowAction`s; when omitted there is no Actions column. */
  renderActions?: (contributor: Contributor) => ReactNode;
}

/** Owner row followed by the invited contributors, with their role and their status. */
export function ContributorsTable({ owner, contributors, renderActions }: ContributorsTableProps) {
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
                <ContributorRoleChip role="Owner" />
              </TableCell>
              <TableCell>
                <InviteStatusChip status="Active" />
              </TableCell>
              {renderActions && <TableCell align="right" />}
            </TableRow>
          )}
          {contributors.map((contributor) => (
            <TableRow key={contributor.id} sx={ROW_ACTIONS_HOVER_SX}>
              {userCell(contributor.user?.username, contributor.email)}
              {!isMobile && <TableCell>{contributor.email}</TableCell>}
              <TableCell>
                <ContributorRoleChip role={contributor.role} />
              </TableCell>
              <TableCell>
                <InviteStatusChip status={contributor.status} />
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
