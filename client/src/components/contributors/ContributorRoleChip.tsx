import { RoleChip } from "@/client/src/components/common/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";

interface ContributorRoleChipProps {
  /** A contributor's role, or the record's owner's. */
  role: ContributorRole | "Owner";
}

/** Each role's color: the owner's and an Editor's the theme's, an Admin's red, a Viewer's grey. */
const ROLE_COLORS = {
  Admin: "error",
  Editor: "primary",
  Owner: "primary",
  Viewer: "default",
} as const;

/** A ruleset's or a character's contributor's role, the owner's too, in one color wherever it shows. */
export function ContributorRoleChip({ role }: ContributorRoleChipProps) {
  return <RoleChip label={role} color={ROLE_COLORS[role]} />;
}
