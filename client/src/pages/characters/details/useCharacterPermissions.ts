import { useIsDemo } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

/**
 * What the session may do with a character it opened, as the server's policy answers it (`permissions`,
 * `GET /api/characters/:id`): the client decides none of it, beyond hiding from a demo user what the server refuses a
 * demo (pulling other users in, sharing a link, exporting a PDF), so its menu items don't show rather than 403; nothing
 * until the character has loaded.
 */
export function useCharacterPermissions(
  character: Pick<CharacterDetail, "deletedAt" | "parentCharacterId" | "permissions"> | undefined,
) {
  const isDemo = useIsDemo();
  const isArchived = !!character?.deletedAt;
  // A character under another (a subsheet: 3.5's bonded creature) follows it: archived, unarchived and deleted with it
  const isSubsheet = !!character && character.parentCharacterId !== null;
  const permissions = character?.permissions;

  return {
    isArchived,
    isSubsheet,
    /** Archive it, unarchive it, delete it for good. */
    canArchive: !!permissions?.canArchive,
    canDownloadPdf: !isDemo,
    /** Its sheet. */
    canEdit: !!permissions?.canEdit,
    /** Add, edit and remove its levels: its sheet's editors, but a subsheet's levels are the character's it's under. */
    canEditLevels: !!permissions?.canEdit && !isSubsheet,
    /** Its portrait. */
    canEditPortrait: !!permissions?.canEditPortrait,
    canInviteContributors: !!permissions?.canInviteContributors,
    canLeave: !!permissions?.canLeave,
    /** Remove a contributor. */
    canManageContributors: !!permissions?.canManageContributors,
    /** See its contributors. */
    canReadContributors: !!permissions?.canReadContributors && !isDemo,
    canShare: !!permissions?.canShare && !isDemo,
  };
}
