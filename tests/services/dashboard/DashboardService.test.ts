import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import { Campaigns, Characters, Players, Rulesets } from "@/server/repositories/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { DashboardService } from "@/server/services/dashboard/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { addCharacterContributor, addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** How many items each list a dashboard card links to holds as it opens (the client's defaults), every page read. */
async function readListTotals(session: Session) {
  const characters = await fetchEveryPage((pagination) =>
    CharactersService.getCharacters(session, { visibility: "active" }, pagination),
  );
  const campaigns = await fetchEveryPage((pagination) =>
    CampaignsService.getCampaigns(session, { visibility: "active" }, pagination),
  );
  const rulesets = await fetchEveryPage((pagination) => RulesetsService.getRulesets(session, {}, pagination));
  return { totalCampaigns: campaigns.length, totalCharacters: characters.length, totalRulesets: rulesets.length };
}

/** The dashboard's counts, checked against the lists their cards link to. */
async function readStats(session: Session) {
  const stats = await DashboardService.getStats(session);
  expect(stats).toEqual(await readListTotals(session));
  return stats;
}

describe("DashboardService.getStats", () => {
  test("counts the user's own live characters, campaigns and rulesets, as their lists hold them", async () => {
    const { user, session } = await createTestUser();
    const { user: other } = await createTestUser();
    const { totalCharacters, totalCampaigns, totalRulesets: bases } = await readStats(session);
    expect({ totalCharacters, totalCampaigns }).toEqual({ totalCharacters: 0, totalCampaigns: 0 });
    expect(bases).toBeGreaterThan(0);

    const character = await createTestCharacter(user.id);
    await createTestCharacter(user.id);
    const { campaign } = await createTestCampaign(user.id);
    await createTestCampaign(user.id);
    const ruleset = await createTestRuleset(user.id);
    await createTestCharacter(other.id);
    await createTestCampaign(other.id);
    await createTestRuleset(other.id);
    expect(await readStats(session)).toEqual({ totalCharacters: 2, totalCampaigns: 2, totalRulesets: bases + 1 });

    await Characters.archive(db, { id: character.id });
    await Campaigns.archive(db, { id: campaign.id });
    await Rulesets.archive(db, { id: ruleset.id });
    expect(await readStats(session)).toEqual({ totalCharacters: 1, totalCampaigns: 1, totalRulesets: bases });
  });

  test("counts a character the user contributes to, as their characters list holds it", async () => {
    const { user, session } = await createTestUser();
    const { user: owner } = await createTestUser();
    const character = await createTestCharacter(owner.id);
    await addCharacterContributor(character.id, user, owner.id);

    expect((await readStats(session)).totalCharacters).toBe(1);
  });

  test("counts the rulesets the user contributes to or plays a campaign on, as their list holds them", async () => {
    const { user, session } = await createTestUser();
    const { user: owner } = await createTestUser();
    const { totalRulesets: bases } = await readStats(session);

    const contributed = await createTestRuleset(owner.id);
    await addRulesetContributor(contributed.id, user, owner.id);
    const played = await createTestRuleset(owner.id);
    const { campaign } = await createTestCampaign(owner.id, played.id);
    await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Player Character" });

    expect((await readStats(session)).totalRulesets).toBe(bases + 2);
  });
});
