/**
 * The invites to the key's user as v1 answers them: to play in a campaign, to contribute to a character or a ruleset,
 * and what answering one leaves it.
 */

import { z } from "zod";

import { contributorRole, role } from "@/drizzle/schema.ts";

import { v1Id, v1Named } from "./references.ts";

/** An invite to contribute's status. */
const v1ContributorInviteStatus = z
  .string()
  .meta({ description: "`Pending` until it's answered, `Active` once accepted, `Rejected`, or `Revoked`" });

export const v1InviteStatus = z
  .strictObject({
    id: v1Id,
    status: z.string().meta({
      description:
        "What its answer left it: a campaign's `Accepted`, `Rejected` or `Revoked`, a contributor's `Active`, " +
        "`Rejected` or `Revoked`",
    }),
  })
  .meta({ description: "An invite, and the status its answer left it in", id: "InviteStatus" });

export const v1ReceivedCampaignInvite = z
  .strictObject({
    campaign: v1Named,
    canAccept: z.boolean().meta({ description: "Whether the key's user may accept it now" }),
    id: v1Id,
    role: z.enum(role.enumValues).meta({ description: "The role of the player slot it offers" }),
    status: z
      .string()
      .meta({ description: "`Pending` until it's answered, then `Accepted`, `Rejected`, or `Revoked`" }),
  })
  .meta({ description: "An invite to the key's user to play in a campaign", id: "ReceivedCampaignInvite" });

export const v1ReceivedCharacterInvite = z
  .strictObject({
    canAccept: z.boolean().meta({ description: "Whether the key's user may accept it now" }),
    character: v1Named,
    id: v1Id,
    status: v1ContributorInviteStatus,
  })
  .meta({ description: "An invite to the key's user to contribute to a character", id: "ReceivedCharacterInvite" });

export const v1ReceivedRulesetInvite = z
  .strictObject({
    canAccept: z.boolean().meta({ description: "Whether the key's user may accept it now" }),
    id: v1Id,
    role: z.enum(contributorRole.enumValues),
    ruleset: v1Named,
    status: v1ContributorInviteStatus,
  })
  .meta({ description: "An invite to the key's user to contribute to a ruleset", id: "ReceivedRulesetInvite" });
