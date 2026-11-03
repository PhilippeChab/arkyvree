import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/** The fields permissions depend on: what the server allows on the ruleset (`permissions`), and its owner. */
type RulesetData = Pick<RulesetDetail, "permissions" | "userId">;

/**
 * What the session may do with a ruleset: the server's answers (`permissions`), but the three kept for the public API
 * (each contributor's row and `inviteRoles` answer them here: whether it may invite is whether an invite may give any
 * role), and whether it owns the ruleset.
 */
type RulesetPermissions = Omit<
  RulesetDetail["permissions"],
  "canInviteContributors" | "canManageAdminContributors" | "canUpdateContributorRoles"
> & {
  isOwner: boolean;
};

const NONE: RulesetPermissions = {
  canEditEntities: false,
  canEditRuleset: false,
  canFork: false,
  canLeave: false,
  canMakePrivate: false,
  canManageContributors: false,
  canPublish: false,
  canReadContributors: false,
  canSubscribeExtensions: false,
  canUnarchive: false,
  canUnsubscribeExtensions: false,
  canViewChanges: false,
  inviteRoles: [],
  isOwner: false,
  kinds: [],
};

/**
 * What the session may do with a ruleset, as the server's policy answers it (`permissions`, `GET /api/rulesets/:id`),
 * a demo's refusals with it: the client decides none of it.
 */
export function useRulesetPermissions(ruleset: RulesetData | undefined): RulesetPermissions {
  const currentUserId = useAuthStore((state) => state.user?.id);
  if (!ruleset || !currentUserId) return NONE;

  return { ...ruleset.permissions, isOwner: ruleset.userId === currentUserId };
}
