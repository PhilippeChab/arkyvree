import { type Browser, expect, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { createCampaign, postPlayerInvite } from "@/tests/e2e/support/campaigns.ts";
import { createCharacter } from "@/tests/e2e/support/dnd3.5/characters.ts";
import { openContext, signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

interface Campaign {
  characters: Record<(typeof VISIBILITIES)[number], { id: string; name: string }>;
  id: string;
}

/** What a Partial character's card and sheet say of what they hide from the other players. */
const PARTIAL_IDENTITY_NOTE = "The rest of this character's identity is private";

/** What the player keeps in each character's private notes: the Game Master reads them, and no other player. */
const PRIVATE_NOTES = "Plans to betray the party";

/**
 * A player's characters in a campaign, by the visibility the player links each with: the Game Master sees them all,
 * whole; another player sees a public one whole, a partial one's identity only, and not a private one.
 */
const VISIBILITIES = ["Public", "Partial", "Private"] as const;

/** Whether the campaign character's sheet shows its build (its ability scores), or only its identity. */
function buildShown(page: Page) {
  return page.getByRole("heading", { name: "Ability Scores" });
}

/** The campaign character's private notes, which its sheet shows its editors and the Game Master. */
function privateNotesShown(page: Page) {
  return page.getByRole("textbox", { name: "Private Notes" });
}

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
    const invite = await postPlayerInvite(gm, id, user.email);
    const page = await signedInPage(browser, user);
    await parseResponse(
      apiOf(page).api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: invite.id } }),
    );
    return page;
  };

  const playerPage = await join(player);
  const characters = {} as Campaign["characters"];
  for (const visibility of VISIBILITIES) {
    const name = `${visibility} Hero ${Date.now()}`;
    const characterId = await createCharacter(playerPage, name);
    const playerApi = apiOf(playerPage).api;
    await parseResponse(
      playerApi.characters[":id"].$put({ param: { id: characterId }, json: { privateNotes: PRIVATE_NOTES } }),
    );
    await parseResponse(
      playerApi.campaigns[":id"].characters.$post({ param: { id }, json: { characterId, visibility } }),
    );
    characters[visibility] = { id: characterId, name };
  }
  await playerPage.context().close();
  await (await join(other)).context().close();
  return { id, characters };
}

test.describe("A campaign character", () => {
  test.setTimeout(90_000);

  test("shows to the Game Master whole, whatever its visibility, its private notes, its PDF and its editing", async ({
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
    await expect(page.getByText(PARTIAL_IDENTITY_NOTE)).toHaveCount(0);

    for (const { id, name } of Object.values(campaign.characters)) {
      await page.goto(`/campaigns/${campaign.id}/characters/${id}`);
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(buildShown(page)).toBeVisible();
      await expect(privateNotesShown(page)).toHaveValue(PRIVATE_NOTES);
      await expect(privateNotesShown(page)).not.toBeEditable();
      await page.getByRole("button", { name: "More Actions" }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Download PDF" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Edit Character" })).toBeVisible();
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
      // Its card says its description is hidden, not missing
      await expect(other.getByText(PARTIAL_IDENTITY_NOTE)).toHaveCount(1);
      await expect(other.getByText(characters.Private.name, { exact: true })).toHaveCount(0);

      await other.goto(`/campaigns/${id}/characters/${characters.Public.id}`);
      await expect(other.getByText(characters.Public.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(buildShown(other)).toBeVisible();
      await expect(privateNotesShown(other)).toHaveCount(0);

      await other.goto(`/campaigns/${id}/characters/${characters.Partial.id}`);
      await expect(other.getByText(characters.Partial.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(buildShown(other)).toHaveCount(0);
      await expect(other.getByText(PARTIAL_IDENTITY_NOTE)).toBeVisible();
      await expect(privateNotesShown(other)).toHaveCount(0);

      await other.goto(`/campaigns/${id}/characters/${characters.Private.id}`);
      await expect(other.getByText("Character not found")).toBeVisible({ timeout: 15_000 });
      await expect(other.getByText(characters.Private.name, { exact: true })).toHaveCount(0);
    } finally {
      await other.context().close();
    }
  });

  test("shows in the Party View its sheet in brief, as its visibility lets the reader see it", async ({
    page,
    browser,
    ownerUser,
    inviteeUser,
    user,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const { id, characters } = await setUpCampaign(page, browser, inviteeUser, user);

    // The Game Master turns it on: every character's build, side by side, a card at a time
    await page.goto(`/campaigns/${id}/characters`);
    const partyView = page.getByRole("button", { name: "Party View" });
    await partyView.click();
    await expect(partyView).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/characterView=party/);
    const party = page.getByRole("region", { name: "Party", exact: true });
    await expect(party.getByRole("heading", { name: "Ability Scores" })).toHaveCount(3, { timeout: 15_000 });
    await expect(party.getByText(PARTIAL_IDENTITY_NOTE)).toHaveCount(0);
    const previous = page.getByRole("button", { name: "Previous Characters" });
    await expect(previous).toBeDisabled();
    await page.getByRole("button", { name: "Next Characters" }).click();
    await expect(previous).toBeEnabled();

    // A card opens the character's sheet
    await party.getByText(characters.Public.name, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${id}/characters/${characters.Public.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: characters.Public.name })).toBeVisible();

    // Another player: a public character's build, a partial one's identity alone, and no private one
    const other = await signedInPage(browser, user);
    try {
      // A screen tall enough for a column to show a short card and the next under it
      await other.setViewportSize({ width: 1366, height: 1000 });
      await other.goto(`/campaigns/${id}/characters?characterView=party`);
      const otherParty = other.getByRole("region", { name: "Party", exact: true });
      await expect(otherParty.getByText(characters.Public.name, { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(otherParty.getByText(characters.Partial.name, { exact: true })).toBeVisible();
      // Both sheets in: each card's identity names its race
      await expect(otherParty.getByText("Race", { exact: true })).toHaveCount(2);
      await expect(otherParty.getByRole("heading", { name: "Ability Scores" })).toHaveCount(1);
      await expect(otherParty.getByText(PARTIAL_IDENTITY_NOTE)).toHaveCount(1);
      await expect(otherParty.getByText(characters.Private.name, { exact: true })).toHaveCount(0);

      // The partial card, short, leaves the rest of its column to the public one under it, which scrolls within it
      const partialName = await otherParty.getByText(characters.Partial.name, { exact: true }).boundingBox();
      const publicName = await otherParty.getByText(characters.Public.name, { exact: true }).boundingBox();
      expect(publicName?.x).toBeCloseTo(partialName?.x ?? Number.NaN, 0);
      expect(publicName?.y).toBeGreaterThan(partialName?.y ?? Number.POSITIVE_INFINITY);
      const publicDetails = otherParty.getByRole("group", { name: `${characters.Public.name} Details` });
      expect(await publicDetails.evaluate((details) => details.scrollHeight > details.clientHeight)).toBe(true);
    } finally {
      await other.context().close();
    }
  });

  test("offers a demo player its editing, but not its PDF, which a demo doesn't export", async ({
    page,
    browser,
    ownerUser,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const id = await createCampaign(page, `Demo Campaign ${Date.now()}`);
    const demo = await (await openContext(browser)).newPage();
    try {
      const demoApi = apiOf(demo).api;
      const { emailAddress } = await parseResponse(demoApi.demo.start.$post());
      const invite = await postPlayerInvite(page, id, emailAddress);
      await parseResponse(demoApi.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: invite.id } }));
      const name = `Demo Hero ${Date.now()}`;
      const characterId = await createCharacter(demo, name);
      await parseResponse(
        demoApi.campaigns[":id"].characters.$post({ param: { id }, json: { characterId, visibility: "Public" } }),
      );

      await demo.goto(`/campaigns/${id}/characters/${characterId}`);
      await expect(demo.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      // The menu shows for what it holds: Edit Character alone
      const actions = demo.getByRole("button", { name: "More Actions" });
      await expect(actions).toBeVisible();
      await actions.click();
      const menu = demo.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Edit Character" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Download PDF" })).toHaveCount(0);
    } finally {
      await demo.context().close();
    }
  });
});
