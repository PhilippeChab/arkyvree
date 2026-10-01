import type { Browser, Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "@/tests/e2e/api.ts";
import { expect, test } from "@/tests/e2e/fixtures.ts";
import { createCampaign, createCharacter, signedInPage, signIn } from "@/tests/e2e/helpers.ts";

/*
 * A player's characters in a campaign, by the visibility the player links each with: the Game Master sees them all,
 * whole; another player sees a public one whole, a partial one's identity only, and not a private one.
 */
const VISIBILITIES = ["Public", "Partial", "Private"] as const;

type Campaign = { id: string; characters: Record<(typeof VISIBILITIES)[number], { id: string; name: string }> };

/**
 * A campaign `gm` runs, which `player` and `other` join: `player` links a character of each visibility. All through
 * the API. The players' pages are closed after.
 */
async function setUpCampaign(
  gm: Page,
  browser: Browser,
  player: { email: string; password: string },
  other: { email: string; password: string },
): Promise<Campaign> {
  const id = await createCampaign(gm, `Visibility Campaign ${Date.now()}`);
  const join = async (user: { email: string; password: string }) => {
    const { invite } = await parseResponse(
      apiOf(gm).api.campaigns[":id"].players.$post({
        param: { id },
        json: { role: "Player Character", email: user.email },
      }),
    );
    const page = await signedInPage(browser, user);
    await parseResponse(
      apiOf(page).api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: invite!.id } }),
    );
    return page;
  };

  const playerPage = await join(player);
  const characters = {} as Campaign["characters"];
  for (const visibility of VISIBILITIES) {
    const name = `${visibility} Hero ${Date.now()}`;
    const characterId = await createCharacter(playerPage, name);
    await parseResponse(
      apiOf(playerPage).api.campaigns[":id"].characters.$post({ param: { id }, json: { characterId, visibility } }),
    );
    characters[visibility] = { id: characterId, name };
  }
  await playerPage.context().close();
  await (await join(other)).context().close();
  return { id, characters };
}

/** Whether the campaign character's sheet shows its build, or only its identity. */
const buildShown = (page: Page) => page.getByText("Classes & Levels", { exact: true });

test.describe("A campaign character", () => {
  test.setTimeout(90_000);

  test("shows to the Game Master whole, whatever its visibility, with its PDF but not its editing", async ({
    page,
    browser,
    ownerUser,
    inviteeUser,
    user,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const campaign = await setUpCampaign(page, browser, inviteeUser, user);

    await page.goto(`/campaigns/${campaign.id}/characters`);
    for (const { name } of Object.values(campaign.characters))
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    for (const { id, name } of Object.values(campaign.characters)) {
      await page.goto(`/campaigns/${campaign.id}/characters/${id}`);
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(buildShown(page)).toBeVisible();
      await page.getByRole("button", { name: "More actions" }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Download PDF" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Edit Character" })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  });

  test("shows to another player whole when public, its identity when partial, and not at all when private", async ({
    page,
    browser,
    ownerUser,
    inviteeUser,
    user,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const { id, characters } = await setUpCampaign(page, browser, inviteeUser, user);
    const other = await signedInPage(browser, user);
    try {
      await other.goto(`/campaigns/${id}/characters`);
      await expect(other.getByText(characters.Public.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(other.getByText(characters.Partial.name, { exact: true }).first()).toBeVisible();
      await expect(other.getByText(characters.Private.name, { exact: true })).toHaveCount(0);

      await other.goto(`/campaigns/${id}/characters/${characters.Public.id}`);
      await expect(other.getByText(characters.Public.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(buildShown(other)).toBeVisible();

      await other.goto(`/campaigns/${id}/characters/${characters.Partial.id}`);
      await expect(other.getByText(characters.Partial.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(buildShown(other)).toHaveCount(0);

      await other.goto(`/campaigns/${id}/characters/${characters.Private.id}`);
      await expect(other.getByText("Character not found")).toBeVisible({ timeout: 15_000 });
      await expect(other.getByText(characters.Private.name, { exact: true })).toHaveCount(0);
    } finally {
      await other.context().close();
    }
  });
});
