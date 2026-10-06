import type { InferRequestType } from "hono/client";

import { db } from "@/server/database/index.ts";
import { Campaigns, Players } from "@/server/repositories/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import type { Player, Session } from "@/shared/relations.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";

/** A campaign on the seeded ruleset (or `rulesetId`) with `userId` as its Game Master. */
export async function createTestCampaign(userId: string, rulesetId?: string) {
  const [campaign] = await Campaigns.create(db, {
    name: `Test Campaign ${uniqueId()}`,
    description: "Test campaign",
    rulesetId: rulesetId ?? (await getSeedCtx()).rulesetId,
  });
  const [player] = await Players.create(db, { userId, campaignId: campaign.id, role: "Game Master" });
  return { campaign, player };
}

/** Invites `email` into a campaign's player slot, as its Game Master does (`CampaignPlayersService.updatePlayer`). */
export async function inviteToSlot(gmSession: Session, slot: Player, email: string) {
  const { invite } = await CampaignPlayersService.updatePlayer(gmSession, slot.campaignId, slot.id, slot.role, email);
  if (!invite) throw new Error("The invite wasn't created");
  return invite;
}

/** A new campaign of the seed user's (or `client`'s), created through the API: on the seeded ruleset, unless `json` says otherwise. */
export async function postCampaign(
  json: Partial<InferRequestType<typeof api.api.campaigns.$post>["json"]> = {},
  client = api,
) {
  const { rulesetId } = await getSeedCtx();
  const { campaign } = await expectOk(
    client.api.campaigns.$post({ json: { name: `Test Campaign ${uniqueId()}`, rulesetId, ...json } }),
  );
  return campaign;
}

/** A new campaign of the seed user's (or `client`'s), created through the API with `email` invited to play in it. */
export async function postCampaignInvite(email: string, client = api) {
  const campaign = await postCampaign({}, client);
  const { invite } = await expectOk(
    client.api.campaigns[":id"].players.$post({
      param: { id: campaign.id },
      json: { email, role: "Player Character" },
    }),
  );
  if (!invite) throw new Error("The invite wasn't created");
  return { campaign, invite };
}
