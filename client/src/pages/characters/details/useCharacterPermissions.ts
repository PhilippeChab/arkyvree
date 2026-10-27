import { useIsDemo } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/**
 * What the session may do with a character it opened, as its owner or a contributor (the API shows it no one else);
 * nothing of the owner's until the character has loaded.
 */
export function useCharacterPermissions(
  character: Pick<CharacterDetail, "deletedAt" | "parentCharacterId" | "userId"> | undefined,
) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  // Demo users keep their characters in the app, as the server holds them: they can't pull other users in, share a
  // link, nor export a PDF.
  const isDemo = useIsDemo();
  const isArchived = !!character?.deletedAt;
  const isOwner = !!currentUserId && character?.userId === currentUserId;
  // A character under another (a subsheet: 3.5's bonded creature) follows it: archived, unarchived and deleted with it
  const isSubsheet = !!character && character.parentCharacterId !== null;

  return {
    isArchived,
    isSubsheet,
    /** Archive it, unarchive it, delete it for good: its owner's alone, a player character's. */
    canArchive: isOwner && !isSubsheet,
    canDownloadPdf: !isDemo,
    /** Its sheet: anyone who opened it, while it isn't archived. */
    canEdit: !isArchived,
    /**
     * Add, edit and remove its levels: anyone who opened a player character, while it isn't archived; a subsheet's
     * levels are the character's it's under.
     */
    canEditLevels: !isArchived && !isSubsheet,
    /**
     * Its portrait, as the server holds it (`docs/access.md`): a player character's owner alone (contributors edit the
     * sheet, not it); a subsheet's, anyone who edits the character it's under.
     */
    canEditPortrait: (isOwner || isSubsheet) && !isArchived,
    /** Invite contributors: its owner, while it isn't archived. */
    canInviteContributors: isOwner && !isArchived,
    /** Leave it: a contributor. */
    canLeave: !isOwner,
    canManageContributors: !isDemo,
    /** Remove a contributor: its owner. */
    canRemoveContributors: isOwner,
    canShare: isOwner && !isDemo,
  };
}
