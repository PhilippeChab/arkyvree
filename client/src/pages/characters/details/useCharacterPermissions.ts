import { useIsDemo } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/**
 * What the session may do with a character it opened, as its owner or a contributor (the API shows it no one else);
 * nothing of the owner's until the character has loaded.
 */
export function useCharacterPermissions(character: Pick<CharacterDetail, "deletedAt" | "kind" | "userId"> | undefined) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  // Demo users keep their characters in the app, as the server holds them: they can't pull other users in, share a
  // link, nor export a PDF.
  const isDemo = useIsDemo();
  const isArchived = !!character?.deletedAt;
  const isOwner = !!currentUserId && character?.userId === currentUserId;
  // A bonded creature follows its master: archived, unarchived and deleted with it
  const isBonded = !!character && character.kind !== "pc";

  return {
    isArchived,
    isBonded,
    isOwner,
    /** Archive it, unarchive it, delete it for good: its owner's alone, a player character's. */
    canArchive: isOwner && !isBonded,
    canDownloadPdf: !isDemo,
    /** Its sheet: anyone who opened it, while it isn't archived. */
    canEdit: !isArchived,
    /** Its portrait: contributors edit the sheet, but only the owner changes it. */
    canEditPortrait: isOwner && !isArchived,
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
