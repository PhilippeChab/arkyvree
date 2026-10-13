import { Typography } from "@mui/material";
import type { ReactNode } from "react";

import {
  DataCell,
  DataRow,
  DataTable,
  EMAIL_AS_NAME_SX,
  EmptyValue,
  ROW_ACTIONS_HOVER_SX,
  RowActions,
  type TableColumn,
  USERNAME_BESIDE_EMAIL_SX,
} from "@/client/src/components/common/index.ts";
import { InviteStatusChip } from "@/client/src/components/invites/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import type { Contributor, ContributorsPage } from "./contributorKinds.ts";
import { ContributorRoleChip } from "./ContributorRoleChip.tsx";

interface ContributorsTableProps {
  contributors: Contributor[];
  owner: ContributorsPage["owner"];
  /** A row's `RowAction`s; when omitted there is no Actions column. */
  renderActions?: (contributor: Contributor) => ReactNode;
  /** Whether its contributors have roles, which a Role column shows (a ruleset's); a character's are its editors */
  showRoles: boolean;
}

/** Owner row followed by the invited contributors, with their role and their status. */
export function ContributorsTable({ owner, contributors, renderActions, showRoles }: ContributorsTableProps) {
  const isMobile = useIsMobile();

  const columns: TableColumn[] = [
    { key: "user", label: "User" },
    ...(isMobile ? [] : [{ key: "email", label: "Email" }]),
    ...(showRoles ? [{ key: "role", label: "Role" }] : []),
    { key: "status", label: "Status" },
    ...(renderActions ? [{ key: "actions", label: "Actions", align: "right" as const }] : []),
  ];

  const userCell = (username: string | null | undefined, email: string) => (
    <DataCell slot="primary">
      <Typography variant="body2" sx={username ? USERNAME_BESIDE_EMAIL_SX : { fontWeight: 500 }}>
        {username || <EmptyValue />}
      </Typography>
      {isMobile && (
        <Typography variant="caption" sx={username ? EMAIL_AS_NAME_SX : { color: "text.secondary" }}>
          {email}
        </Typography>
      )}
    </DataCell>
  );

  return (
    <DataTable framed size={isMobile ? "small" : "medium"} columns={columns}>
      {owner && (
        <DataRow>
          {userCell(owner.username, owner.emailAddress)}
          {!isMobile && <DataCell slot="hidden">{owner.emailAddress}</DataCell>}
          {showRoles && (
            <DataCell slot="inline">
              <ContributorRoleChip role="Owner" />
            </DataCell>
          )}
          <DataCell slot="inline">
            <InviteStatusChip status="Active" />
          </DataCell>
          {renderActions && <DataCell slot="hidden" align="right" />}
        </DataRow>
      )}
      {contributors.map((contributor) => (
        <DataRow key={contributor.id} sx={ROW_ACTIONS_HOVER_SX}>
          {userCell(contributor.user?.username, contributor.email)}
          {!isMobile && <DataCell slot="hidden">{contributor.email}</DataCell>}
          {showRoles && (
            <DataCell slot="inline">
              <ContributorRoleChip role={contributor.role} />
            </DataCell>
          )}
          <DataCell slot="inline">
            <InviteStatusChip status={contributor.status} />
          </DataCell>
          {renderActions && (
            <DataCell slot="trailing" align="right">
              <RowActions>{renderActions(contributor)}</RowActions>
            </DataCell>
          )}
        </DataRow>
      ))}
    </DataTable>
  );
}
