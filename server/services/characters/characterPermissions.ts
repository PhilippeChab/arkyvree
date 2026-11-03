/** What the session may do with a character it reads, wherever it reads it: its own sheet, or a campaign's. */

import { type CharactersPolicy, isAllowed } from "@/server/services/policies/index.ts";

/**
 * What a share link's reader may do with the character it shares, whoever they are (its owner too): nothing, as the
 * link gives them no role on it. Each is a permission its own sheet answers (`describeCharacterPermissions`).
 */
export const SHARE_LINK_PERMISSIONS = {
  canArchive: false,
  canEdit: false,
  canEditPortrait: false,
  canEditRows: false,
  canExport: false,
  canHardDelete: false,
  canInviteContributors: false,
  canLeave: false,
  canManageContributors: false,
  canReadContributors: false,
  canShare: false,
  canUnarchive: false,
} satisfies Record<keyof ReturnType<typeof describeCharacterPermissions>, false>;

/**
 * What the session may do with a character it reads, as its policy decides each (`policy`), the character's state
 * with it, so its page offers what the server allows: edit it, its own rows (a bonded creature has none), change its
 * portrait, export it, archive it while it's live, unarchive it and delete it for good once it's archived (whether a
 * campaign it plays in refuses that is its delete's answer), share it, read, invite and manage its contributors. It
 * may leave it while it contributes to it (`isActiveContributor`).
 */
export function describeCharacterPermissions(policy: CharactersPolicy) {
  return {
    canArchive: isAllowed(() => policy.canArchive()),
    canEdit: policy.isEditable(),
    canEditPortrait: policy.isPortraitEditable(),
    canEditRows: policy.isRowEditable(),
    canExport: isAllowed(() => policy.canExport()),
    canHardDelete: isAllowed(() => policy.canHardDelete({ inActiveCampaign: false })),
    canInviteContributors: isAllowed(() => policy.canInviteContributors()),
    canLeave: isAllowed(() => policy.canLeave()),
    canManageContributors: isAllowed(() => policy.canManageContributors()),
    canReadContributors: isAllowed(() => policy.canReadContributors()),
    canShare: isAllowed(() => policy.canShare()),
    canUnarchive: isAllowed(() => policy.canUnarchive()),
  };
}
