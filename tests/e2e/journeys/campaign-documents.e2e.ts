import { expect } from "@playwright/test";
import { parseResponse } from "hono/client";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { createCampaign, postPlayerInvite } from "@/tests/e2e/support/campaigns.ts";
import { selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

// A Game Master keeping a campaign's documents in its Documents tab, and a player reading what they're shown: a Public
// folder, a letter shown to that player alone, and notes the Game Master keeps to themselves. The player joins through
// the API; what the test clicks is the Game Master's, then the player's.
test.describe("A campaign's documents", () => {
  test("show a player what the Game Master shares with them, and nothing they keep", async ({
    page,
    browser,
    ownerUser,
    user,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const id = await createCampaign(page, uniqueName("Documents Campaign"));
    const player = await signedInPage(browser, user);
    try {
      const invite = await postPlayerInvite(page, id, user.email);
      await parseResponse(
        apiOf(player).api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: invite.id } }),
      );

      // The Game Master's Public folder, then a letter for the player in it, and their own notes beside it
      await page.goto(`/campaigns/${id}/documents`);
      await page.getByRole("button", { name: "Add Folder" }).click();
      const folderDialog = page.getByRole("dialog", { name: "Create New Folder" });
      await folderDialog.getByLabel("Name").fill("Handouts");
      await selectOption(page, "Visibility", "Public");
      await folderDialog.getByRole("button", { name: "Create" }).click();
      await expect(folderDialog).toBeHidden();
      await page.getByRole("row", { name: "Open Handouts" }).click();
      await expect(page.getByRole("navigation", { name: "Folders" })).toContainText("Handouts");

      await page.getByRole("button", { name: "Add Document" }).click();
      const letterDialog = page.getByRole("dialog", { name: "Create New Document" });
      await letterDialog.getByLabel("Name").fill("A letter");
      await letterDialog.getByLabel("Text").fill("Meet me at the old mill.");
      await selectOption(page, "Visibility", "Selected");
      await letterDialog.getByRole("combobox", { name: "Players" }).click();
      await page.getByRole("option", { name: user.username }).click();
      await page.keyboard.press("Escape");
      await expect(letterDialog.getByText(`Creating it shows it to ${user.username}`)).toBeVisible();
      await letterDialog.getByRole("button", { name: "Create" }).click();
      await expect(letterDialog).toBeHidden();

      await page.getByRole("button", { name: "Add Document" }).click();
      const notesDialog = page.getByRole("dialog", { name: "Create New Document" });
      await notesDialog.getByLabel("Name").fill("Secret notes");
      await notesDialog.getByRole("button", { name: "Create" }).click();
      await expect(notesDialog).toBeHidden();
      await expect(page.getByRole("row", { name: "Open A letter" })).toContainText(`Seen by ${user.username}`);
      await expect(page.getByRole("row", { name: "Open Secret notes" })).toContainText("Seen by no player");

      // The player's tab: the folder and their letter, never the notes; the letter reads as written
      await player.goto(`/campaigns/${id}/documents`);
      await player.getByRole("row", { name: "Open Handouts" }).click();
      await expect(player.getByRole("row", { name: "Open A letter" })).toBeVisible();
      await expect(player.getByRole("row", { name: "Open Secret notes" })).toHaveCount(0);
      await player.getByRole("row", { name: "Open A letter" }).click();
      await expect(player.getByRole("heading", { name: "A letter" })).toBeVisible();
      await expect(player.getByText("Meet me at the old mill.")).toBeVisible();
    } finally {
      await player.context().close();
    }
  });
});
