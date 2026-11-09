import { expect } from "@playwright/test";
import { parseResponse } from "hono/client";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { createCampaign, postPlayerInvite } from "@/tests/e2e/support/campaigns.ts";
import { selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

// A Game Master keeping a campaign's documents in its Documents tab, and a player reading what they're shown: a Public
// folder, a letter uploaded for that player alone, and a note the Game Master keeps to themselves. The player joins
// through the API; what the test clicks is the Game Master's, then the player's.
test.describe("A campaign's documents", () => {
  test("show a player what the Game Master shares with them, and nothing they keep", async ({
    page,
    browser,
    ownerUser,
    inviteeUser,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const id = await createCampaign(page, uniqueName("Documents Campaign"));
    const player = await signedInPage(browser, inviteeUser);
    try {
      const invite = await postPlayerInvite(page, id, inviteeUser.email);
      await parseResponse(
        apiOf(player).api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: invite.id } }),
      );

      // The Game Master's Public folder, then a letter for the player in it, and their own notes beside it
      await page.goto(`/campaigns/${id}/documents`);
      await page.getByRole("button", { name: "Add" }).click();
      await page.getByRole("menuitem", { name: "New Folder" }).click();
      const folderDialog = page.getByRole("dialog", { name: "Create New Folder" });
      await folderDialog.getByLabel("Name").fill("Handouts");
      await selectOption(page, "Visibility", "Public");
      await folderDialog.getByRole("button", { name: "Create" }).click();
      await expect(folderDialog).toBeHidden();
      await page.getByRole("row", { name: "Open Handouts" }).click();
      await expect(page.getByRole("heading", { name: "Handouts" })).toBeVisible();

      // A document is a file: a page posing as one is refused as it's picked, a text file opens its dialog, named
      // after it
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "letter.html",
        mimeType: "text/html",
        buffer: Buffer.from("<html></html>"),
      });
      await expect(
        page.getByText("Pick a picture (PNG, JPEG, WebP, GIF), a PDF or a text file (.txt, .md)"),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const letter = Buffer.from("Meet me at the old mill.");
      await fileInput.setInputFiles({ name: "A letter.txt", mimeType: "text/plain", buffer: letter });
      const letterDialog = page.getByRole("dialog", { name: "Upload Document" });
      await expect(letterDialog.getByLabel("Name")).toHaveValue("A letter");
      await expect(letterDialog.getByText("Text file · 1 KB · uploaded when saved")).toBeVisible();
      await selectOption(page, "Visibility", "Selected");
      await letterDialog.getByRole("combobox", { name: "Players" }).click();
      await page.getByRole("option", { name: inviteeUser.username }).click();
      await page.keyboard.press("Escape");
      await expect(letterDialog.getByText(`Uploading it shows it to ${inviteeUser.username}`)).toBeVisible();
      await letterDialog.getByRole("button", { name: "Upload" }).click();
      await expect(letterDialog).toBeHidden();

      // A note is text typed in the app, with no file
      await page.getByRole("button", { name: "Add" }).click();
      await page.getByRole("menuitem", { name: "New Note" }).click();
      const notesDialog = page.getByRole("dialog", { name: "Create New Note" });
      await notesDialog.getByLabel("Name").fill("Secret notes");
      await notesDialog.getByLabel("Text").fill("The miller is the cultist.");
      await notesDialog.getByRole("button", { name: "Create" }).click();
      await expect(notesDialog).toBeHidden();
      await expect(page.getByRole("row", { name: "Open A letter" })).toContainText(`Seen by ${inviteeUser.username}`);
      await expect(page.getByRole("row", { name: "Open Secret notes" })).toContainText("Seen by no player");

      // The player's tab: the folder and their letter, never the note; the letter reads as its file holds it
      await player.goto(`/campaigns/${id}/documents`);
      await player.getByRole("row", { name: "Open Handouts" }).click();
      await expect(player.getByRole("row", { name: "Open A letter" })).toBeVisible();
      await expect(player.getByRole("row", { name: "Open Secret notes" })).toHaveCount(0);
      await player.getByRole("row", { name: "Open A letter" }).click();
      await expect(player.getByRole("heading", { name: "A letter" })).toBeVisible();
      await expect(player.getByText("Meet me at the old mill.")).toBeVisible();
      await expect(player.getByRole("link", { name: "Open Text File" })).toBeVisible();
    } finally {
      await player.context().close();
    }
  });
});
