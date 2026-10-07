import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { createCampaign, postPlayerInvite } from "@/tests/e2e/support/campaigns.ts";
import { selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

// A Game Master managing a campaign's players from its Players tab: a player's role, a pending invite, a player's
// seat. The players join through the API; what the test does is the Game Master's. A Game Master can't remove another
// Game Master, so the player it promotes and the one it removes are two.
test.describe("A campaign's Game Master", () => {
  test("changes a player's role, revokes a pending invite and removes a player, each kept after a reload", async ({
    page,
    browser,
    ownerUser,
    inviteeUser,
    user,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const id = await createCampaign(page, uniqueName("Players Campaign"));
    // Two players accept; an invite to an email without an account waits
    for (const joining of [user, inviteeUser]) {
      const player = await signedInPage(browser, joining);
      try {
        const accepted = await postPlayerInvite(page, id, joining.email);
        await parseResponse(
          apiOf(player).api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: accepted.id } }),
        );
      } finally {
        await player.context().close();
      }
    }
    const pendingEmail = `pending-${randomUUID().slice(0, 8)}@example.com`;
    await postPlayerInvite(page, id, pendingEmail);

    const players = async () => {
      await page.goto(`/campaigns/${id}/players`);
      await expect(page.getByRole("row").filter({ hasText: user.username })).toBeVisible({ timeout: 15_000 });
    };
    const act = async (row: ReturnType<Page["getByRole"]>, action: string) => {
      await row.hover();
      await row.getByRole("button", { name: action }).click();
    };
    await players();
    const promotedRow = page.getByRole("row").filter({ hasText: user.username });
    const removedRow = page.getByRole("row").filter({ hasText: inviteeUser.username });
    const pendingRow = page.getByRole("row").filter({ hasText: pendingEmail });
    await expect(promotedRow.getByText("Player Character", { exact: true })).toBeVisible();

    // A player's role
    await act(promotedRow, "Edit");
    const edit = page.getByRole("dialog", { name: "Edit Player" });
    await selectOption(page, "Role", "Game Master");
    await expect(edit.getByRole("combobox", { name: "Role" })).toHaveText("Game Master");
    await edit.getByRole("button", { name: "Update Player" }).click();
    await expect(edit).toBeHidden();
    await players();
    await expect(promotedRow.getByText("Game Master", { exact: true })).toBeVisible();

    // The pending invite
    await expect(pendingRow).toBeVisible();
    await act(pendingRow, "Revoke Invite");
    await page
      .getByRole("dialog", { name: "Confirm Revoke" })
      .getByRole("button", { name: "Revoke Invitation" })
      .click();
    await expect(pendingRow).toHaveCount(0);
    await players();
    await expect(pendingRow).toHaveCount(0);

    // Another player
    await act(removedRow, "Remove");
    await page.getByRole("dialog", { name: "Remove Player" }).getByRole("button", { name: "Remove Player" }).click();
    await expect(removedRow).toHaveCount(0);
    await players();
    await expect(removedRow).toHaveCount(0);
  });
});
