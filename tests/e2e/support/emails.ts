import { expect, type Locator, type Page } from "@playwright/test";

import { queryDatabase } from "@/tests/e2e/fixtures.ts";

/**
 * The latest active code a user was sent, read from the test database: the e2e suite has no mailer.
 * `table` is where the flow keeps its codes.
 */
async function latestCode(table: "email_verifications" | "password_resets", email: string): Promise<string> {
  const [row] = await queryDatabase<{ code: string }>(
    `SELECT c.code
       FROM account.${table} c
       JOIN account.users u ON u.id = c.user_id
      WHERE u.email_address = $1
        AND c.deleted_at IS NULL
        AND c.expires_at > NOW()
      ORDER BY c.created_at DESC
      LIMIT 1`,
    [email],
  );
  if (!row) throw new Error(`No active code in ${table} for ${email}`);
  return row.code;
}

/**
 * Types the 8-digit `code` into the form's code inputs (the only unnamed ones), setting each through React's value
 * tracker as typing would. `scope` narrows the search to a dialog when the page has other forms.
 */
export async function fillOtp(scope: Page | Locator, code: string): Promise<void> {
  const inputs = scope.locator("form input:not([name])");
  await expect(inputs).toHaveCount(code.length);
  for (let i = 0; i < code.length; i++) {
    await inputs.nth(i).evaluate((el, ch) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, ch);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, code[i]);
  }
}

/** The code that verifies a user's email address. */
export function getEmailVerificationCode(email: string) {
  return latestCode("email_verifications", email);
}

/** Signs up a new user and verifies their email, leaving them on the dashboard with its onboarding open. */
export async function signUpAndVerify(page: Page, email: string, password: string) {
  await page.goto("/sign-up");
  await page.fill('input[name="emailAddress"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="passwordConfirmation"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/verify-email", { timeout: 10_000 });
  await fillOtp(page, await getEmailVerificationCode(email));
  await page.getByRole("button", { name: /^Verify$/ }).click();
  await page.waitForURL("/dashboard", { timeout: 10_000 });
}

/** The code that resets a user's password. */
export function getPasswordResetCode(email: string) {
  return latestCode("password_resets", email);
}
