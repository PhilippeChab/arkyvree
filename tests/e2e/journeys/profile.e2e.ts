import { expect, test } from "@/tests/e2e/fixtures.ts";
import { fillOtp, getEmailVerificationCode } from "@/tests/e2e/support/emails.ts";
import { signIn, submitSignIn } from "@/tests/e2e/support/signIn.ts";
import { TEST_USERS } from "@/tests/fixtures/auth.fixture.ts";

// Each test changes a user of its own, so it needs no cleanup and no order.
test.describe("Profile editing", () => {
  test.beforeEach(async ({ page, user }) => {
    await signIn(page, user.email, user.password);
  });

  test("opens from the account menu, with the user's email", async ({ page, user }) => {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    await page.waitForURL("/profile");
    await expect(page.locator('input[name="emailAddress"]')).toHaveValue(user.email);
  });

  test("saves a new username", async ({ page }) => {
    await page.goto("/profile");
    const username = `testuser_${Date.now()}`;
    await page.fill('input[name="username"]', username);
    await page.locator("form").filter({ hasText: "Username" }).locator('button[type="submit"]').click();
    await expect(page.locator("text=/Profile updated/i")).toBeVisible({ timeout: 5000 });
    await page.reload();
    await expect(page.locator('input[name="username"]')).toHaveValue(username);
  });

  for (const [what, email, error] of [
    ["an invalid email", "not-an-email", /Please enter a valid email address/i],
    ["an email already in use", TEST_USERS.user1.email, /Email address already in use/i],
  ] as const) {
    test(`refuses ${what}`, async ({ page }) => {
      await page.goto("/profile");
      await page.fill('input[name="emailAddress"]', email);
      await page.locator("form").filter({ hasText: "Email Address" }).locator('button[type="submit"]').click();
      await expect(page.getByText(error)).toBeVisible({ timeout: 5000 });
    });
  }

  for (const [what, current, password, confirmation, error] of [
    [
      "a wrong current password",
      "wrongpassword",
      "newpassword1234",
      "newpassword1234",
      /Current password is incorrect/i,
    ],
    ["new passwords that differ", undefined, "newpassword1234", "differentpassword", /Passwords do not match/i],
    ["a short new password", undefined, "short", "short", /Password must be at least 12 characters/i],
  ] as const) {
    test(`refuses ${what}`, async ({ page, user }) => {
      await page.goto("/profile");
      await page.fill('input[name="currentPassword"]', current ?? user.password);
      await page.fill('input[name="newPassword"]', password);
      await page.fill('input[name="newPasswordConfirmation"]', confirmation);
      await page.locator("form").filter({ hasText: "Current Password" }).locator('button[type="submit"]').click();
      await expect(page.getByText(error)).toBeVisible({ timeout: 5000 });
    });
  }

  test("changes the email, verified with the code sent to the new address", async ({ page, user }) => {
    await page.goto("/profile");
    const newEmail = `changed-${Date.now()}-${user.email}`;
    await page.fill('input[name="emailAddress"]', newEmail);
    await page.locator("form").filter({ hasText: "Email Address" }).locator('button[type="submit"]').click();

    // The change waits for the code: the form shows it pending, and a dialog asks for it.
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog.getByText("Verify New Email")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/Pending email change/i")).toBeVisible();
    // Read from the test database, keyed by the user, whose email is still the old one
    await fillOtp(dialog, await getEmailVerificationCode(user.email));
    await dialog.getByRole("button", { name: /^Verify$/ }).click();

    await expect(page.locator("text=/Email address updated/i")).toBeVisible({ timeout: 5000 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('input[name="emailAddress"]')).toHaveValue(newEmail);
    await expect(page.locator("text=/Pending email change/i")).toHaveCount(0);
  });

  test("changes the password, which then signs the user in", async ({ page, user }) => {
    await page.goto("/profile");
    const newPassword = `newpass_${Date.now()}_xx`;
    await page.fill('input[name="currentPassword"]', user.password);
    await page.fill('input[name="newPassword"]', newPassword);
    await page.fill('input[name="newPasswordConfirmation"]', newPassword);
    await page.locator("form").filter({ hasText: "Current Password" }).locator('button[type="submit"]').click();
    await expect(page.locator("text=/Password updated/i")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await page.waitForURL("/sign-in");
    // A fresh sign-in page, with nothing left of the session: a late auth check can't re-render the form mid-fill
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await submitSignIn(page, user.email, newPassword);
    await page.waitForURL("/dashboard");
  });
});
