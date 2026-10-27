import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { useIsDemo } from "./useIsDemo.ts";

interface RulesetPermissions {
  /** Owner, Admin, or Editor, while it isn't archived — can create, edit and delete its entities. */
  canEditEntities: boolean;
  /** Owner or Admin, while it isn't archived — can update ruleset name/description/privacy, archive. */
  canEditRuleset: boolean;
  /** Owner or Admin, while it isn't archived — can invite contributors and change their roles. Demo users blocked. */
  canInviteContributors: boolean;
  /** A contributor, but its owner — can leave it, archived or not. */
  canLeave: boolean;
  /** Owner or Admin — can invite/remove contributors. Demo users blocked. */
  canManageContributors: boolean;
  /** Owner, while it's a draft. Demo users blocked. */
  canPublish: boolean;
  isContributor: boolean;
  isOwner: boolean;
}

/** The fields permissions depend on: what the server allows on the ruleset (`permissions`), its owner and the role. */
type RulesetData = Pick<RulesetDetail, "contributorRole" | "permissions" | "userId">;

const NONE: RulesetPermissions = {
  canEditEntities: false,
  canEditRuleset: false,
  canInviteContributors: false,
  canLeave: false,
  canManageContributors: false,
  canPublish: false,
  isContributor: false,
  isOwner: false,
};

/**
 * What the session may do with a ruleset, as the server's policy answers it (`permissions`, `GET /api/rulesets/:id`):
 * the client decides none of it, beyond hiding from a demo user what the server refuses a demo (inviting, managing
 * contributors, publishing), so its menu items don't show rather than 403.
 */
export function useRulesetPermissions(ruleset: RulesetData | undefined): RulesetPermissions {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isDemo = useIsDemo();
  if (!ruleset || !currentUserId) return NONE;

  const { permissions } = ruleset;
  return {
    ...permissions,
    canInviteContributors: permissions.canInviteContributors && !isDemo,
    canManageContributors: permissions.canManageContributors && !isDemo,
    canPublish: permissions.canPublish && !isDemo,
    isContributor: !!ruleset.contributorRole,
    isOwner: ruleset.userId === currentUserId,
  };
}
