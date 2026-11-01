/** What an invite's page shows of each kind of invite (`InvitePage`), whose answers are `INVITE_KINDS`'. */

import { parseResponse } from "hono/client";

import { ContributorsIcon, PlayersIcon } from "@/client/src/components/icons/index.ts";
import type { InviteKind } from "@/client/src/components/invites/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { ContributorRole } from "@/shared/enums.ts";

/** What an invite's page shows of it, whatever its kind. */
interface InviteDetails {
  /** Whether the session may accept it, as the server's policy answers: none once its parent is archived. */
  canAccept: boolean;
  entityId: string | null | undefined;
  entityName: string | undefined;
  invitedAt: string;
  /** The contributor role it offers. */
  role?: ContributorRole;
  status: string;
}

/**
 * Each kind's page: its title, its icon, what it's to (`entityLabel`, what accepting does, `verb`), the invite read for
 * it (`inviteFn`) and the status an accepted one ends in.
 */
export const INVITE_PAGES = {
  campaign: {
    pageTitle: "Campaign Invite",
    icon: PlayersIcon,
    entityLabel: "Campaign",
    verb: "join",
    acceptedStatus: "Accepted",
    inviteFn: async (inviteId: string): Promise<InviteDetails> => {
      const invite = await parseResponse(rpc.api.campaigns.invites[":inviteId"].$get({ param: { inviteId } }));
      const campaign = invite.playersInCampaign?.campaignsInCampaign;
      return {
        status: invite.status,
        entityName: campaign?.name,
        entityId: campaign?.id,
        canAccept: invite.canAccept,
        invitedAt: invite.createdAt,
      };
    },
  },
  characterContributor: {
    pageTitle: "Character Contributor Invite",
    icon: ContributorsIcon,
    entityLabel: "Character",
    verb: "contribute to",
    acceptedStatus: "Active",
    inviteFn: async (id: string): Promise<InviteDetails> => {
      const invite = await parseResponse(rpc.api.characters.contributors.invites[":id"].$get({ param: { id } }));
      return {
        status: invite.status,
        entityName: invite.charactersInCharacter?.name,
        entityId: invite.characterId,
        canAccept: invite.canAccept,
        invitedAt: invite.createdAt,
        role: invite.role,
      };
    },
  },
  rulesetContributor: {
    pageTitle: "Ruleset Contributor Invite",
    icon: ContributorsIcon,
    entityLabel: "Ruleset",
    verb: "contribute to",
    acceptedStatus: "Active",
    inviteFn: async (id: string): Promise<InviteDetails> => {
      const invite = await parseResponse(rpc.api.rulesets.contributors.invites[":id"].$get({ param: { id } }));
      return {
        status: invite.status,
        entityName: invite.rulesetsInRule?.name,
        entityId: invite.rulesetId,
        canAccept: invite.canAccept,
        invitedAt: invite.createdAt,
        role: invite.role,
      };
    },
  },
} as const satisfies Record<InviteKind, unknown>;
