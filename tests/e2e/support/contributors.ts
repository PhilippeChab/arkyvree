import { expect, type Page } from "@playwright/test";

import { apiResponse, openActionsMenu } from "./page.ts";

/** Accepts or rejects, from the notifications page, the invite about `name`. */
export async function answerInvite(page: Page, name: string, answer: "Accept" | "Reject") {
  await page.goto("/notifications");
  const row = page
    .locator("tr", { hasText: name })
    .filter({ has: page.getByRole("button", { name: answer }) })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const answered = apiResponse(page, "POST", new RegExp(`/invites/[^/]+/${answer.toLowerCase()}`));
  await row.getByRole("button", { name: answer }).click();
  await answered;
}

/** Invites `email` to contribute to the ruleset or character on the page. */
export async function inviteContributor(page: Page, email: string) {
  await (await openContributors(page)).getByRole("button", { name: /^Invite$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Invite Contributor" });
  await dialog.getByLabel("Email address").fill(email);
  const invited = apiResponse(page, "POST", /\/api\/(rulesets|characters)\/[a-f0-9-]+\/contributors/);
  await dialog.getByRole("button", { name: /^Invite$/ }).click();
  await invited;
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Opens the contributors of the ruleset or character on the page, from its actions menu. */
export async function openContributors(page: Page) {
  await openActionsMenu(page, "Contributors");
  const manager = page.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: "Contributors" }).first();
  await expect(manager).toBeVisible();
  return manager;
}
