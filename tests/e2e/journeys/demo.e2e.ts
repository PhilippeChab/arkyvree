import { expect, type Page } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { visitCoreRulesetList } from "@/tests/e2e/support/rulesets.ts";
import { openContext } from "@/tests/e2e/support/signIn.ts";

/** Starts a demo from the sign-up page, which lands on the dashboard under the demo banner. */
async function startDemo(page: Page) {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await page.waitForURL("/dashboard", { timeout: 15_000 });
  await expect(page.getByText(/Demo mode/)).toBeVisible({ timeout: 10_000 });
}

test.describe("Demo", () => {
  test.setTimeout(60_000);

  test("lasts through the app, and ends on reaching sign-in", async ({ page }) => {
    await startDemo(page);
    await visitCoreRulesetList(page);
    await expect(page.getByRole("heading", { name: "Core SRD 3.5" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Demo mode/)).toBeVisible();

    // Signing in is for returning users: it ends the demo, and offers none.
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: /^Sign In$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Try the demo/ })).toHaveCount(0);
    await expect(page.getByText(/Demo mode/)).toHaveCount(0);
    await page.goto("/dashboard");
    await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
  });

  test("ends in another tab when this one reaches sign-in", async ({ browser }) => {
    const context = await openContext(browser);
    const first = await context.newPage();
    await startDemo(first);
    const second = await context.newPage();
    await second.goto("/sign-in");
    // The form shows once the demo user is gone.
    await expect(second.getByRole("button", { name: /^Sign In$/ })).toBeVisible({ timeout: 15_000 });

    // Whichever of the 401 or the other tab's cleared session lands first decides the page: both mean the demo is over.
    await first.bringToFront();
    await first.goto("/rulesets");
    await first.waitForURL(/\/(demo-expired|sign-in)/, { timeout: 15_000 });
    await expect(first.getByText(/Demo mode/)).toHaveCount(0);
    await context.close();
  });

  test("that expired sends the user to the demo-expired page, which leads to sign-up", async ({ page }) => {
    await startDemo(page);
    // The server answers an expired demo with a 401. Every API call gets one but the auth probe, whose failure
    // would send the user to sign in instead.
    await page.route("**/api/**", async (route) => {
      if (route.request().url().includes("/auth/me")) return route.continue();
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "UnauthenticatedError", message: "" }),
      });
    });
    await page.goto("/rulesets");
    await page.waitForURL(/\/demo-expired$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Your demo has ended/ })).toBeVisible();

    await page.unroute("**/api/**");
    await page.getByRole("link", { name: /^Sign up$/ }).click();
    await page.waitForURL("/sign-up", { timeout: 10_000 });
  });
});
