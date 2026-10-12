/**
 * The kinds of invite, answered one way wherever they're answered (a notification's buttons, an invite's own page):
 * `useAnswerInvite` runs their requests.
 */

import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** An answer to an invite: its kind and id, and the notification it came from when it's answered from one. */
export interface InviteAnswer {
  inviteId: string;
  kind: InviteKind;
  notificationId?: string;
}

/** An invite's kind: who it invites to what. */
export type InviteKind = "campaign" | "characterContributor" | "rulesetContributor";

/** An answer to an invite, as its buttons send it and its mutation's key names it. */
export type InviteVerb = (typeof INVITE_VERBS)[number];

/**
 * Each kind's name in a toast (`label`), its answers' requests (an accept's answering the cache key of the record it
 * gave the user rights on, which it refreshes), the list that gains its entity once it's accepted (`listKey`), and where
 * accepting lands: its entity's page, or its list's (`acceptedPath`). What its page shows of it is its page's
 * (`INVITE_PAGES`, `pages/invites`).
 */
export const INVITE_KINDS = {
  campaign: {
    label: "Campaign invite",
    entityPath: (id: string) => `/campaigns/${id}`,
    listPath: "/campaigns",
    listKey: QUERY_KEYS.campaigns.lists,
    // The answer names its slot, not its campaign: every campaign's own data, which only a member's page holds
    acceptFn: async (inviteId: string) => {
      await parseResponse(rpc.api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId } }));
      return QUERY_KEYS.campaigns.details;
    },
    rejectFn: (inviteId: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId } })),
  },
  characterContributor: {
    label: "Contributor invite",
    entityPath: (id: string) => `/characters/${id}`,
    listPath: "/characters",
    listKey: QUERY_KEYS.characters.lists,
    acceptFn: async (id: string) => {
      const contributor = await parseResponse(
        rpc.api.characters.contributors.invites[":id"].accept.$post({ param: { id } }),
      );
      return QUERY_KEYS.characters.detail(contributor.characterId);
    },
    rejectFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].reject.$post({ param: { id } })),
  },
  rulesetContributor: {
    label: "Contributor invite",
    entityPath: (id: string) => `/rulesets/${id}`,
    listPath: "/rulesets",
    listKey: QUERY_KEYS.rulesets.lists,
    acceptFn: async (id: string) => {
      const contributor = await parseResponse(
        rpc.api.rulesets.contributors.invites[":id"].accept.$post({ param: { id } }),
      );
      return QUERY_KEYS.rulesets.detail(contributor.rulesetId);
    },
    rejectFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].reject.$post({ param: { id } })),
  },
} as const satisfies Record<InviteKind, unknown>;

/** The answers to an invite. */
export const INVITE_VERBS = ["accept", "reject"] as const;

/** Where accepting an invite of `kind` lands: its entity's page, or its list's when it doesn't name the entity. */
export function acceptedPath(kind: InviteKind, entityId: string | null | undefined) {
  const { entityPath, listPath } = INVITE_KINDS[kind];
  return entityId ? entityPath(entityId) : listPath;
}
