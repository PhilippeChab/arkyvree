/**
 * The kinds of invite, answered one way wherever they're answered (a notification's buttons, an invite's own page):
 * `useAnswerInvite` runs their requests.
 */

import { parseResponse } from "hono/client";

import { rpc } from "@/client/src/services/rpc.ts";

import { QUERY_KEYS } from "./queryKeys.ts";

/** An answer to an invite: its kind and id, and the notification it came from when it's answered from one. */
export interface InviteAnswer {
  inviteId: string;
  kind: InviteKind;
  notificationId?: string;
}

/** An invite's kind: who it invites to what. */
export type InviteKind = "campaign" | "characterContributor" | "rulesetContributor";

/**
 * Shared by accept and reject, so every surface can tell which invites are being answered, whichever surface the click
 * came from.
 */
export const ANSWER_INVITE_KEY = ["invites", "answer"] as const;

/** Each kind's name in a toast, its answers' requests, and the list that gains its entity once it's accepted. */
export const INVITE_KINDS = {
  campaign: {
    label: "Campaign invite",
    acceptFn: (inviteId: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId } })),
    rejectFn: (inviteId: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId } })),
    listKey: QUERY_KEYS.campaigns.lists,
  },
  characterContributor: {
    label: "Contributor invite",
    acceptFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].accept.$post({ param: { id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].reject.$post({ param: { id } })),
    listKey: QUERY_KEYS.characters.lists,
  },
  rulesetContributor: {
    label: "Contributor invite",
    acceptFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].accept.$post({ param: { id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].reject.$post({ param: { id } })),
    listKey: QUERY_KEYS.rulesets.lists,
  },
} as const satisfies Record<InviteKind, unknown>;
