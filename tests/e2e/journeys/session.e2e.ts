import { expect, test } from "@/tests/e2e/fixtures.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

test.describe("A session", () => {
  test.beforeEach(async ({ page, user }) => {
    await signIn(page, user.email, user.password);
  });

  test("opens the protected pages", async ({ page }) => {
    for (const route of ["/dashboard", "/campaigns", "/characters", "/rulesets"]) {
      // Loaded, auth check included: a redirect to sign in would have happened
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(route);
    }
  });

  test("ends when the user signs out, the protected pages sending them to sign in", async ({ page }) => {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });

    await page.goto("/characters");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
