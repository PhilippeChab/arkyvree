import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface RulesetData {
  userId?: string | null;
  status?: string;
  contributorRole?: string | null;
}

export function useRulesetPermissions(ruleset: RulesetData | undefined) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  // Demo users own everything they fork, but cross-user / publish actions are
  // server-blocked. Suppress the affordances here so the menu items don't
  // appear at all rather than 403'ing.
  const isDemo = useAuthStore((state) => !!state.user?.expiresAt);

  if (!ruleset || !currentUserId) {
    return {
      isOwner: false,
      canEditEntities: false,
      canEditRuleset: false,
      canManageContributors: false,
      canPublish: false,
      isContributor: false,
      contributorRole: null as string | null,
    };
  }

  const isOwner = ruleset.userId === currentUserId;
  const contributorRole = ruleset.contributorRole ?? null;
  const isAdmin = contributorRole === "Admin";
  const isEditor = contributorRole === "Editor";
  const isContributor = !!contributorRole;
  const isNotArchived = ruleset.status !== "Archived";

  return {
    isOwner,
    isContributor,
    contributorRole,
    /** Owner, Admin, or Editor — can CRUD entities (feats, skills, etc.) */
    canEditEntities: (isOwner || isAdmin || isEditor) && isNotArchived,
    /** Owner or Admin — can update ruleset name/description/privacy, archive */
    canEditRuleset: (isOwner || isAdmin) && isNotArchived,
    /** Owner or Admin — can invite/remove contributors. Demo users blocked. */
    canManageContributors: (isOwner || isAdmin) && !isDemo,
    /** Owner only. Demo users blocked. */
    canPublish: isOwner && !isDemo,
  };
}
