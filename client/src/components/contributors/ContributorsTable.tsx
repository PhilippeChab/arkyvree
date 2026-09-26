import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";

import { useIsMobile } from "@/client/src/hooks/index.ts";

function contributorStatusColor(status: string): "warning" | "success" | "error" | "default" {
  switch (status) {
    case "Pending": return "warning";
    case "Active": return "success";
    case "Rejected": return "error";
    default: return "default";
  }
}

function roleColor(role: string): "error" | "primary" | "default" {
  switch (role) {
    case "Admin": return "error";
    case "Editor": return "primary";
    default: return "default";
  }
}

interface ContributorRow {
  id: string;
  email: string;
  status: string;
  role?: string;
  user?: { username?: string | null } | null;
}

interface ContributorsTableProps<T extends ContributorRow> {
  owner: { username?: string | null; emailAddress: string } | null;
  contributors: T[];
  /** Show the Role column (rulesets have roles, characters don't). */
  showRoles?: boolean;
  /** Row buttons; when omitted there is no Actions column. */
  renderActions?: (contributor: T) => ReactNode;
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
    <TableContainer component={Paper} variant="outlined">
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
                {showRoles
                  ? <Chip label="Active" size="small" color="success" variant="filled" />
                  : <Chip label="Owner" size="small" color="primary" variant="filled" />}
              </TableCell>
              {renderActions && <TableCell align="right" />}
            </TableRow>
          )}
          {contributors.map((contributor) => (
            <TableRow key={contributor.id} sx={{ "&:hover .row-actions": { opacity: 1 } }}>
              {userCell(contributor.user?.username, contributor.email)}
              {!isMobile && <TableCell>{contributor.email}</TableCell>}
              {showRoles && contributor.role && (
                <TableCell>
                  <Chip label={contributor.role} size="small" color={roleColor(contributor.role)} variant="outlined" />
                </TableCell>
              )}
              <TableCell>
                <Chip label={contributor.status} size="small" color={contributorStatusColor(contributor.status)} variant="filled" />
              </TableCell>
              {renderActions && (
                <TableCell align="right">
                  <Box
                    className="row-actions"
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      justifyContent: "flex-end",
                      // Revealed on row hover where there is a pointer; always shown on touch screens.
                      "@media (hover: hover)": { opacity: 0 },
                      "&:focus-within": { opacity: 1 },
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    {renderActions(contributor)}
                  </Box>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
