import type { CharacterDetail } from "@/client/src/lib/queries.ts";

/**
 * What the session may do with a character it opened, as the server's policy answers it (`permissions`,
 * `GET /api/characters/:id`), a demo's refusals with it: the client decides none of it; nothing until the character has
 * loaded.
 */
export function useCharacterPermissions(
  character: Pick<CharacterDetail, "deletedAt" | "parentCharacterId" | "permissions"> | undefined,
) {
  const isArchived = !!character?.deletedAt;
  // A character under another (a subsheet: 3.5's bonded creature) follows it: archived, unarchived and deleted with it
  const isSubsheet = !!character && character.parentCharacterId !== null;
  const permissions = character?.permissions;

  return {
    isArchived,
    isSubsheet,
    /** Archive it, while it's live. */
    canArchive: !!permissions?.canArchive,
    /** Export it as a PDF: its editors, while they may edit it. */
    canDownloadPdf: !!permissions?.canExport,
    /** Its sheet. */
    canEdit: !!permissions?.canEdit,
    /** Its own rows (its levels, scores, inventory and modifiers): a subsheet's are the character's it's under. */
    canEditRows: !!permissions?.canEditRows,
    /** Its portrait. */
    canEditPortrait: !!permissions?.canEditPortrait,
    /** Delete it for good, once it's archived. */
    canHardDelete: !!permissions?.canHardDelete,
    canInviteContributors: !!permissions?.canInviteContributors,
    canLeave: !!permissions?.canLeave,
    /** Remove a contributor. */
    canManageContributors: !!permissions?.canManageContributors,
    /** See its contributors. */
    canReadContributors: !!permissions?.canReadContributors,
    canShare: !!permissions?.canShare,
    /** Unarchive it, once it's archived. */
    canUnarchive: !!permissions?.canUnarchive,
  };
}
