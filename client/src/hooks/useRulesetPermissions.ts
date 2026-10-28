import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { useIsDemo } from "./useIsDemo.ts";

interface RulesetPermissions {
  /** A fork that subscribes to no extension — can be published as an extension, or made one. */
  canBeExtension: boolean;
  /** Owner, Admin, or Editor, while it isn't archived — can create, edit and delete its entities. */
  canEditEntities: boolean;
  /** Owner or Admin, while it isn't archived — can update ruleset name/description/privacy, archive. */
  canEditRuleset: boolean;
  /** Anyone, on a published base ruleset — can fork it. */
  canFork: boolean;
  /** Owner or Admin, while it isn't archived — can invite contributors. Demo users blocked. */
  canInviteContributors: boolean;
  /** A contributor, but its owner — can leave it, archived or not. */
  canLeave: boolean;
  /** Owner — can make a contributor an Admin, and change or remove an Admin. */
  canManageAdminContributors: boolean;
  /** Owner or Admin — can remove contributors, archived or not. Demo users blocked. */
  canManageContributors: boolean;
  /** Owner, while it's a draft. Demo users blocked. */
  canPublish: boolean;
  /** Owner or a contributor — can see its contributors (and a contributor leave), archived or not. */
  canReadContributors: boolean;
  /** Owner, of a live fork that isn't an extension, nor subscribed to as one — can subscribe it to extensions. */
  canSubscribeExtensions: boolean;
  /** Owner, while it's archived — can unarchive it. */
  canUnarchive: boolean;
  /** Owner, of a live fork — can unsubscribe it from an extension, unless a character uses what would leave. */
  canUnsubscribeExtensions: boolean;
  /** Owner or Admin, while it isn't archived — can change its contributors' roles. */
  canUpdateContributorRoles: boolean;
  isOwner: boolean;
}

/** The fields permissions depend on: what the server allows on the ruleset (`permissions`), and its owner. */
type RulesetData = Pick<RulesetDetail, "permissions" | "userId">;

const NONE: RulesetPermissions = {
  canBeExtension: false,
  canEditEntities: false,
  canEditRuleset: false,
  canFork: false,
  canInviteContributors: false,
  canLeave: false,
  canManageAdminContributors: false,
  canManageContributors: false,
  canPublish: false,
  canReadContributors: false,
  canSubscribeExtensions: false,
  canUnarchive: false,
  canUnsubscribeExtensions: false,
  canUpdateContributorRoles: false,
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
    isOwner: ruleset.userId === currentUserId,
  };
}
