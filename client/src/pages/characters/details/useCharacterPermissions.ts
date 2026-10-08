import { useIsDemo } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/**
 * What the session may do with a character it opened, as its owner or a contributor (the API shows it no one else);
 * nothing of the owner's until the character has loaded.
 */
export function useCharacterPermissions(character: Pick<CharacterDetail, "deletedAt" | "userId"> | undefined) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  // Demo users keep their characters to themselves: they can't pull other users in, nor share a link.
  const isDemo = useIsDemo();
  const isArchived = !!character?.deletedAt;
  const isOwner = !!currentUserId && character?.userId === currentUserId;

  return {
    isArchived,
    isOwner,
    /** Archive it, unarchive it, delete it for good: its owner's alone. */
    canArchive: isOwner,
    /** Its sheet: anyone who opened it, while it isn't archived. */
    canEdit: !isArchived,
    /** Its portrait: contributors edit the sheet, but only the owner changes it. */
    canEditPortrait: isOwner && !isArchived,
    canManageContributors: !isDemo,
    canShare: isOwner && !isDemo,
  };
}
