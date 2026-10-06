/**
 * The pages an invitation email links to: the invite, answered there, or why it can't be anymore. The sender, the
 * worker's owner, sets it up through the API; the invitee is the test's own user.
 */

import type { Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { expect, test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { createCampaign, postPlayerInvite } from "@/tests/e2e/support/campaigns.ts";
import { createCharacter } from "@/tests/e2e/support/characters.ts";
import { uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signedInPage, signIn, submitSignIn } from "@/tests/e2e/support/signIn.ts";

/** The page of a campaign, ruleset or character, on whichever section it opens. */
function entityPage(kind: string, id: string) {
  return new RegExp(`/${kind}/${id}(/[a-z-]+)?$`);
}

/** A campaign `gm` runs, with an invite for `email`: its name, its id, the invite's link, and its page. */
async function campaignInvite(gm: Page, email: string) {
  const name = uniqueName("Invite Campaign");
  const id = await createCampaign(gm, name);
  const invite = await postPlayerInvite(gm, id, email);
  return { name, id, link: `/campaign-invite/${invite.id}`, page: entityPage("campaigns", id) };
}

test.describe("A campaign invite link", () => {
  test("opened signed out, signs in back to the invite, and accepted, opens the campaign it then says it joined", async ({
    page,
    browser,
    ownerUser,
    user,
  }) => {
    const gm = await signedInPage(browser, ownerUser);
    const campaign = await campaignInvite(gm, user.email);
    await gm.context().close();

    await page.goto(campaign.link);
    await expect(page).toHaveURL(/\/sign-in\?redirect=/);
    await submitSignIn(page, user.email, user.password);
    await expect(page).toHaveURL(campaign.link, { timeout: 10_000 });
    await expect(page.getByText(campaign.name, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Invited on /)).toBeVisible();

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page).toHaveURL(campaign.page, { timeout: 10_000 });
    await expect(page.getByText("Invitation accepted!", { exact: true })).toBeVisible();

    await page.goto(campaign.link);
    await expect(page.getByText("Already Accepted", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Go to Campaign" }).click();
    await expect(page).toHaveURL(campaign.page);
  });

  test("rejected, lands on the dashboard, and then says it was", async ({ page, browser, ownerUser, user }) => {
    const gm = await signedInPage(browser, ownerUser);
    const campaign = await campaignInvite(gm, user.email);
    await gm.context().close();

    await signIn(page, user.email, user.password);
    await page.goto(campaign.link);
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 10_000 });
    await expect(page.getByText("Invitation rejected", { exact: true })).toBeVisible();

    await page.goto(campaign.link);
    await expect(page.getByText("Invitation Rejected", { exact: true })).toBeVisible();
  });

  test("is not found by anyone else, and can't be accepted once the campaign is archived", async ({
    page,
    browser,
    ownerUser,
    user,
  }) => {
    const gm = await signedInPage(browser, ownerUser);
    try {
      const campaign = await campaignInvite(gm, user.email);
      // Not even the Game Master who sent it
      await gm.goto(campaign.link);
      await expect(gm.getByText("Invitation Not Found", { exact: true })).toBeVisible();
      await parseResponse(apiOf(gm).api.campaigns[":id"].$delete({ param: { id: campaign.id } }));

      await signIn(page, user.email, user.password);
      await page.goto(campaign.link);
      await expect(page.getByText("Campaign Archived", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
    } finally {
      await gm.context().close();
    }
  });
});

// A contributor invite shows its role, if it has one, and accepted, opens what it's to
for (const { kind, path, role, open, invite } of [
  {
    kind: "ruleset",
    path: "ruleset-contributor-invite",
    role: "Editor",
    open: (page: Page, name: string) => forkCoreRuleset(page, name),
    invite: (page: Page, id: string, email: string) =>
      parseResponse(
        apiOf(page).api.rulesets[":id"].contributors.$post({ param: { id }, json: { email, role: "Editor" } }),
      ),
  },
  {
    kind: "character",
    path: "character-contributor-invite",
    role: undefined,
    open: (page: Page, name: string) => createCharacter(page, name),
    invite: (page: Page, id: string, email: string) =>
      parseResponse(apiOf(page).api.characters[":id"].contributors.$post({ param: { id }, json: { email } })),
  },
] as const) {
  test(`A ${kind} contributor invite link${role ? ", with its role," : ""} opens the ${kind} once accepted`, async ({
    page,
    browser,
    ownerUser,
    user,
  }) => {
    const owner = await signedInPage(browser, ownerUser);
    const name = uniqueName(`Invite ${kind}`);
    const id = await open(owner, name);
    const contributor = await invite(owner, id, user.email);
    await owner.context().close();

    await signIn(page, user.email, user.password);
    await page.goto(`/${path}/${contributor.id}`);
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 10_000 });
    if (role) await expect(page.getByText(role, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page).toHaveURL(entityPage(`${kind}s`, id), { timeout: 10_000 });
  });
}
