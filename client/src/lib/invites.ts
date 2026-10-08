/**
 * The kinds of invite, answered one way wherever they're answered (a notification's buttons, an invite's own page):
 * `useAnswerInvite` runs their requests, and `InviteLandingPage` shows one.
 */

import { parseResponse } from "hono/client";

import { ContributorsIcon, PlayersIcon } from "@/client/src/components/icons/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { QUERY_KEYS } from "./queryKeys.ts";

/** An answer to an invite: its kind and id, and the notification it came from when it's answered from one. */
export interface InviteAnswer {
  inviteId: string;
  kind: InviteKind;
  notificationId?: string;
}

/** What an invite's page shows of it, whatever its kind. */
export interface InviteDetails {
  entityId: string | null | undefined;
  entityName: string | undefined;
  invitedAt: string;
  isArchived: boolean;
  /** The contributor role it offers. */
  role?: string;
  status: string;
}

/** An invite's kind: who it invites to what. */
export type InviteKind = "campaign" | "characterContributor" | "rulesetContributor";

/**
 * Each kind's name in a toast (`label`), its answers' requests, and the list that gains its entity once it's accepted
 * (`listKey`); its page's facts: its title, its icon, what it's to (`entityLabel`, what accepting does, `verb`), the
 * invite read for it (`inviteFn`) and the status an accepted one ends in; and where accepting lands: its entity's
 * page, or its list's (`acceptedPath`).
 */
export const INVITE_KINDS = {
  campaign: {
    label: "Campaign invite",
    pageTitle: "Campaign Invite",
    icon: PlayersIcon,
    entityLabel: "Campaign",
    verb: "join",
    acceptedStatus: "Accepted",
    entityPath: (id: string) => `/campaigns/${id}`,
    listPath: "/campaigns",
    listKey: QUERY_KEYS.campaigns.lists,
    inviteFn: async (inviteId: string): Promise<InviteDetails> => {
      const invite = await parseResponse(rpc.api.campaigns.invites[":inviteId"].$get({ param: { inviteId } }));
      const campaign = invite.playersInCampaign?.campaignsInCampaign;
      return {
        status: invite.status,
        entityName: campaign?.name,
        entityId: campaign?.id,
        isArchived: !!campaign?.deletedAt,
        invitedAt: invite.createdAt,
      };
    },
    acceptFn: (inviteId: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId } })),
    rejectFn: (inviteId: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId } })),
  },
  characterContributor: {
    label: "Contributor invite",
    pageTitle: "Character Contributor Invite",
    icon: ContributorsIcon,
    entityLabel: "Character",
    verb: "contribute to",
    acceptedStatus: "Active",
    entityPath: (id: string) => `/characters/${id}`,
    listPath: "/characters",
    listKey: QUERY_KEYS.characters.lists,
    inviteFn: async (id: string): Promise<InviteDetails> => {
      const invite = await parseResponse(rpc.api.characters.contributors.invites[":id"].$get({ param: { id } }));
      return {
        status: invite.status,
        entityName: invite.charactersInCharacter?.name,
        entityId: invite.characterId,
        isArchived: !!invite.charactersInCharacter?.deletedAt,
        invitedAt: invite.createdAt,
        role: invite.role,
      };
    },
    acceptFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].accept.$post({ param: { id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].reject.$post({ param: { id } })),
  },
  rulesetContributor: {
    label: "Contributor invite",
    pageTitle: "Ruleset Contributor Invite",
    icon: ContributorsIcon,
    entityLabel: "Ruleset",
    verb: "contribute to",
    acceptedStatus: "Active",
    entityPath: (id: string) => `/rulesets/${id}`,
    listPath: "/rulesets",
    listKey: QUERY_KEYS.rulesets.lists,
    inviteFn: async (id: string): Promise<InviteDetails> => {
      const invite = await parseResponse(rpc.api.rulesets.contributors.invites[":id"].$get({ param: { id } }));
      return {
        status: invite.status,
        entityName: invite.rulesetsInRule?.name,
        entityId: invite.rulesetId,
        isArchived: invite.rulesetsInRule?.status === "Archived",
        invitedAt: invite.createdAt,
        role: invite.role,
      };
    },
    acceptFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].accept.$post({ param: { id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].reject.$post({ param: { id } })),
  },
} as const satisfies Record<InviteKind, unknown>;

/** Where accepting an invite of `kind` lands: its entity's page, or its list's when it doesn't name the entity. */
export function acceptedPath(kind: InviteKind, entityId: string | null | undefined) {
  const { entityPath, listPath } = INVITE_KINDS[kind];
  return entityId ? entityPath(entityId) : listPath;
}
