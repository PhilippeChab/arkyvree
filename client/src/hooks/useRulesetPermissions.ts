import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { useIsDemo } from "./useIsDemo.ts";

interface RulesetPermissions {
  /** Owner, Admin, or Editor — can CRUD entities (feats, skills, etc.) */
  canEditEntities: boolean;
  /** Owner or Admin — can update ruleset name/description/privacy, archive */
  canEditRuleset: boolean;
  /** Owner or Admin — can invite/remove contributors. Demo users blocked. */
  canManageContributors: boolean;
  /** Owner only. Demo users blocked. */
  canPublish: boolean;
  isContributor: boolean;
  isOwner: boolean;
}

/** The fields permissions depend on; ruleset details and list items both carry them. */
type RulesetData = Pick<RulesetDetail, "userId" | "status" | "contributorRole">;

export function useRulesetPermissions(ruleset: RulesetData | undefined): RulesetPermissions {
  const currentUserId = useAuthStore((state) => state.user?.id);
  // Demo users own everything they fork, but cross-user / publish actions are
  // server-blocked. Suppress the affordances here so the menu items don't
  // appear at all rather than 403'ing.
  const isDemo = useIsDemo();

  if (!ruleset || !currentUserId) {
    return {
      isOwner: false,
      canEditEntities: false,
      canEditRuleset: false,
      canManageContributors: false,
      canPublish: false,
      isContributor: false,
    };
  }

  const isOwner = ruleset.userId === currentUserId;
  const { contributorRole } = ruleset;
  const isAdmin = contributorRole === "Admin";
  const isEditor = contributorRole === "Editor";
  const isContributor = !!contributorRole;
  const isNotArchived = ruleset.status !== "Archived";

  return {
    isOwner,
    isContributor,
    canEditEntities: (isOwner || isAdmin || isEditor) && isNotArchived,
    canEditRuleset: (isOwner || isAdmin) && isNotArchived,
    canManageContributors: (isOwner || isAdmin) && !isDemo,
    canPublish: isOwner && !isDemo,
  };
}
