import { expect, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "@/tests/e2e/support/api.ts";
import { apiResponse } from "@/tests/e2e/support/page.ts";
import { coreRulesetId } from "@/tests/e2e/support/rulesets.ts";

/** Creates a campaign on the core rules through the API, and opens its page. Returns its id. */
export async function createCampaign(page: Page, name: string) {
  const { campaign } = await parseResponse(
    apiOf(page).api.campaigns.$post({ json: { name, rulesetId: await coreRulesetId(page) } }),
  );
  await page.goto(`/campaigns/${campaign.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 10_000 });
  return campaign.id;
}

/** Invites `email` as a player of the open campaign. */
export async function invitePlayer(page: Page, email: string) {
  await page.getByRole("tab", { name: /Players/i }).click();
  await page.getByRole("button", { name: "Add Player" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Player" });
  await dialog.locator('input[name="email"]').fill(email);
  const invited = apiResponse(page, "POST", /\/api\/campaigns\/[a-f0-9-]+\/players/);
  await dialog.getByRole("button", { name: /Add Player|Send|Invite/ }).click();
  await invited;
  await expect(page.locator('text="Invite Pending"').first()).toBeVisible({ timeout: 15_000 });
}

/** Invites `email` to play in campaign `id`, as `page`'s user does, through the API: the invite. */
export async function postPlayerInvite(page: Page, id: string, email: string) {
  const { invite } = await parseResponse(
    apiOf(page).api.campaigns[":id"].players.$post({ param: { id }, json: { role: "Player Character", email } }),
  );
  if (!invite) throw new Error("The invite wasn't created");
  return invite;
}
