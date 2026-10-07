import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { ROW_ACTIONS_HOVER_SX, ROW_ACTIONS_SX, TableFrame } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

interface ContributorRow {
  email: string;
  id: string;
  role?: string;
  status: string;
  user?: { username?: string | null } | null;
}

interface ContributorsTableProps<T extends ContributorRow> {
  contributors: T[];
  owner: { emailAddress: string; username?: string | null } | null;
  /** Row buttons; when omitted there is no Actions column. */
  renderActions?: (contributor: T) => ReactNode;
  /** Show the Role column (rulesets have roles, characters don't). */
  showRoles?: boolean;
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
  showRoles = false,
  renderActions,
}: ContributorsTableProps<T>) {
  const isMobile = useIsMobile();

  const userCell = (username: string | null | undefined, email: string) => (
    <TableCell>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {username || "—"}
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
            {showRoles && <TableCell>Role</TableCell>}
            <TableCell>Status</TableCell>
            {renderActions && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {owner && (
            <TableRow>
              {userCell(owner.username, owner.emailAddress)}
              {!isMobile && <TableCell>{owner.emailAddress}</TableCell>}
              {showRoles && (
                <TableCell>
                  <Chip label="Owner" size="small" color="primary" variant="filled" />
                </TableCell>
              )}
              <TableCell>
                {showRoles ? (
                  <Chip label="Active" size="small" color="success" variant="filled" />
                ) : (
                  <Chip label="Owner" size="small" color="primary" variant="filled" />
                )}
              </TableCell>
              {renderActions && <TableCell align="right" />}
            </TableRow>
          )}
          {contributors.map((contributor) => (
            <TableRow key={contributor.id} sx={ROW_ACTIONS_HOVER_SX}>
              {userCell(contributor.user?.username, contributor.email)}
              {!isMobile && <TableCell>{contributor.email}</TableCell>}
              {showRoles && (
                <TableCell>
                  {contributor.role && (
                    <Chip
                      label={contributor.role}
                      size="small"
                      color={roleColor(contributor.role)}
                      variant="outlined"
                    />
                  )}
                </TableCell>
              )}
              <TableCell>
                <Chip
                  label={contributor.status}
                  size="small"
                  color={contributorStatusColor(contributor.status)}
                  variant="filled"
                />
              </TableCell>
              {renderActions && (
                <TableCell align="right">
                  <Stack
                    className="row-actions"
                    direction="row"
                    spacing={0.5}
                    sx={{ justifyContent: "flex-end", ...ROW_ACTIONS_SX }}
                  >
                    {renderActions(contributor)}
                  </Stack>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
