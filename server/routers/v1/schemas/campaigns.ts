/**
 * A campaign as v1 answers it: what it is and its ruleset, its players and their invites, and the characters its
 * players link to it, each as the key's user may see it.
 */

import { z } from "zod";

import { role } from "@/drizzle/schema.ts";
import { CHARACTER_VISIBILITY_OPTIONS } from "@/shared/campaigns.ts";

import { v1CardSummary, v1Character } from "./characters.ts";
import { buildPageSchema, v1Id, v1Named } from "./references.ts";
import { v1User } from "./users.ts";

/** A player slot's role. */
const v1CampaignRole = z.enum(role.enumValues);

/** An invite sent for a player slot. */
const v1SlotInvite = z.strictObject({
  email: z.string().nullable().meta({ description: "The address it was sent to: none but to the Game Master" }),
  id: v1Id.meta({ description: "`POST /v1/campaign-invites/{id}/revoke` takes it back while it's pending" }),
  status: z.string().meta({ description: "`Pending` until it's answered, then `Accepted`, `Rejected`, or `Revoked`" }),
});

export const v1CampaignSummary = z
  .strictObject({
    archived: z.boolean(),
    description: z.string().nullable(),
    id: v1Id,
    name: z.string(),
    players: z.number().int().meta({ description: "How many of its slots have a user" }),
    ruleset: v1Named.meta({ description: "The ruleset its characters are built on" }),
  })
  .meta({ description: "A campaign in a list", id: "CampaignSummary" });

export const v1Campaign = v1CampaignSummary
  .extend({
    permissions: z
      .strictObject({
        canEdit: z.boolean(),
        canLeave: z.boolean(),
        canManagePlayers: z.boolean(),
        canRevokeInvites: z.boolean(),
      })
      .meta({ description: "What the key's user may do with it", id: "CampaignPermissions" }),
  })
  .meta({ description: "A campaign the key's user plays in, or is the Game Master of", id: "Campaign" });

/** How much of a character the campaign's other players see. */
export const v1CharacterVisibility = z.enum(CHARACTER_VISIBILITY_OPTIONS).meta({
  description: "What the campaign's other players see of it: nothing (`Private`), all of it, or its identity alone",
});

export const v1CampaignCharacter = z
  .strictObject({
    own: z.boolean().meta({ description: "Whether the key's user linked it" }),
    partial: z.boolean().meta({ description: "Whether its sheet shows its identity alone (its identity section)" }),
    sheet: v1Character,
    visibility: v1CharacterVisibility,
  })
  .meta({
    description:
      "A character linked to a campaign, as the key's user sees it: its sheet, or its identity alone (`partial`) when " +
      "it's linked `Partial` and they're neither its player, an editor of it, nor the Game Master",
    id: "CampaignCharacter",
  });

export const v1CampaignCharacterLink = z
  .strictObject({ characterId: v1Id, visibility: v1CharacterVisibility })
  .meta({ description: "A character of the key's user's linked to a campaign", id: "CampaignCharacterLink" });

export const v1CampaignCharacterSummary = z
  .strictObject({
    description: z.string().nullable(),
    id: v1Id,
    name: z.string(),
    own: z.boolean().meta({ description: "Whether the key's user linked it" }),
    partial: z.boolean().meta({ description: "Whether the key's user sees its identity alone, none of its build" }),
    summary: v1CardSummary,
    visibility: v1CharacterVisibility,
  })
  .meta({ description: "A character linked to a campaign, in its list", id: "CampaignCharacterSummary" });

export const v1CampaignCharacterPage = buildPageSchema(v1CampaignCharacterSummary);

export const v1CampaignInvite = z
  .strictObject({
    ...v1SlotInvite.shape,
    player: z.strictObject({ id: v1Id, role: v1CampaignRole }).meta({ description: "The player slot it offers" }),
    user: v1User.nullable().meta({ description: "The user it was sent to, none while the address has no account" }),
  })
  .meta({ description: "An invite to play in a campaign, as the campaign lists it", id: "CampaignInvite" });

export const v1CampaignInvitePage = buildPageSchema(v1CampaignInvite);

export const v1CampaignPage = buildPageSchema(v1CampaignSummary);

export const v1CampaignPlayer = z
  .strictObject({
    archived: z.boolean().meta({ description: "Archived, as a deleted account's slot is: `players` doesn't count it" }),
    id: v1Id,
    invite: v1SlotInvite.nullable().meta({ description: "The pending invite sent for the slot" }),
    joinedAt: z.string().nullable().meta({ description: "When its user joined, none while it has none" }),
    role: v1CampaignRole,
    user: v1User.nullable().meta({ description: "Its user, none while the slot is open" }),
  })
  .meta({
    description: "A player slot of a campaign: its role, its user, and the invite sent for it",
    id: "CampaignPlayer",
  });

export const v1CampaignPlayerPage = buildPageSchema(v1CampaignPlayer);

export const v1LinkableCharacter = z
  .strictObject({ id: v1Id, name: z.string() })
  .meta({ description: "A player character of the key's user's that a campaign could link", id: "LinkableCharacter" });

export const v1LinkableCharacterPage = buildPageSchema(v1LinkableCharacter);

export const v1PlayerSlot = z
  .strictObject({
    id: v1Id,
    invite: v1SlotInvite.nullable().meta({ description: "The invite sent for it, none when no address was given" }),
    role: v1CampaignRole,
    userId: v1Id.nullable().meta({ description: "Its user, none while the slot is open" }),
  })
  .meta({ description: "A player slot of a campaign, as its write leaves it", id: "PlayerSlot" });
