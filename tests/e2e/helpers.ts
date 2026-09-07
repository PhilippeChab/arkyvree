import { type Page, type Locator, expect } from '@playwright/test';

export async function selectOption(page: Page, label: string, optionText?: string) {
  // MUI dialog has aria-modal="true"; featurebase chat iframes also use role=dialog
  const modalDialog = page.locator('[role="dialog"][aria-modal="true"]');
  const scope = (await modalDialog.first().isVisible().catch(() => false)) ? modalDialog : page;
  await scope.locator(`text="${label}"`).first().locator('..').locator('[role="combobox"]').click();
  await page.locator('[role="listbox"]').waitFor({ state: 'visible' });
  if (optionText) {
    await page.locator(`[role="option"]:has-text("${optionText}")`).click();
  } else {
    await page.locator('[role="option"]').first().click();
  }
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.fill('input[name="emailAddress"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

/**
 * Create a basic D&D 3.5 character. Leaves the user on the character sheet
 * with the Level Up wizard already cancelled.
 */
export async function createCharacter(page: Page, name: string) {
  await page.goto('/characters');
  await page.getByRole('button', { name: 'Create Character' }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.locator('input[name="name"]').waitFor({ state: 'visible' });
  await dialog.locator('input[name="name"]').fill(name);
  // Arm the races-API listener BEFORE picking the ruleset so we don't
  // race the response. The Race Select is disabled until the ruleset
  // is chosen and the available-races query settles.
  const racesResponse = page.waitForResponse(
    (r) => r.url().includes('/api/characters/available-races') && r.status() === 200,
    { timeout: 10_000 },
  );
  await selectOption(page, 'Ruleset', 'Core SRD 3.5');
  await racesResponse;
  await selectOption(page, 'Race');
  await dialog.locator('input[name="height"]').fill('5 feet 8 inches');
  await dialog.locator('input[name="weight"]').fill('150 lbs');
  await expect(dialog.getByText('Strength', { exact: true })).toBeVisible({ timeout: 10000 });
  // Default ability score method is 4d6 Drop Lowest; click Roll to populate valid scores.
  await dialog.getByRole('button', { name: /Roll all ability scores/i }).click();
  await selectOption(page, 'Alignment');
  await selectOption(page, 'Gender');
  await dialog.locator('input[name="name"]').press('Enter');
  await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 10_000 });
  await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
  // App auto-opens the Add Level wizard after creation. Click Cancel to
  // dismiss it so the test starts from a clean sheet.
  const wizard = page.getByRole('dialog', { name: 'Add Level' });
  await wizard.getByRole('button', { name: 'Cancel' }).click();
  await expect(wizard).toBeHidden({ timeout: 10_000 });
}

export const TEST_USERS = {
  user1: { email: 'testuser1@example.com', password: 'LocalTest123!' },
  user2: { email: 'testuser2@example.com', password: 'LocalTest123!' },
  user3: { email: 'testuser3@example.com', password: 'LocalTest123!' },
} as const;

/**
 * Type the 8-digit OTP into the verify-email form. Each input is React-controlled
 * with auto-advance focus on change; the cleanest reliable approach is to call
 * onChange on each input directly via the React-tracker setter, one at a time
 * with a microtask yield so React commits between dispatches.
 *
 * Pass a `Locator` (e.g. the dialog) as `scope` when the page has other forms
 * outside the OTP form — otherwise `form input` matches too broadly.
 */
export async function fillOtp(scope: Page | Locator, code: string): Promise<void> {
  const inputs = scope.locator('form input');
  await expect(inputs).toHaveCount(code.length);
  for (let i = 0; i < code.length; i++) {
    await inputs.nth(i).evaluate((el, ch) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, ch);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, code[i]);
  }
  await expect(scope.getByRole('button', { name: /^Verify$/ })).toBeEnabled({ timeout: 5000 });
}

/**
 * Read the latest active email verification OTP for a user from the test DB.
 * Used by sign-up + onboarding and forgot-password journeys to bypass the
 * email channel without an integration with the real mailer.
 */
export async function getEmailVerificationCode(email: string): Promise<string> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT ev.code
         FROM account.email_verifications ev
         JOIN account.users u ON u.id = ev.user_id
        WHERE u.email_address = $1
          AND ev.deleted_at IS NULL
          AND ev.expires_at > NOW()
        ORDER BY ev.created_at DESC
        LIMIT 1`,
      [email],
    );
    const code = r.rows[0]?.code;
    if (!code) throw new Error(`No active verification code for ${email}`);
    return code;
  } finally {
    await pool.end();
  }
}

/**
 * Read the latest active password-reset OTP for a user from the test DB.
 * Forgot-password flow stores the code in `account.password_resets` (separate
 * table from email_verifications). Used by the forgot-password e2e journey.
 */
export async function getPasswordResetCode(email: string): Promise<string> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT pr.code
         FROM account.password_resets pr
         JOIN account.users u ON u.id = pr.user_id
        WHERE u.email_address = $1
          AND pr.deleted_at IS NULL
          AND pr.expires_at > NOW()
        ORDER BY pr.created_at DESC
        LIMIT 1`,
      [email],
    );
    const code = r.rows[0]?.code;
    if (!code) throw new Error(`No active password-reset code for ${email}`);
    return code;
  } finally {
    await pool.end();
  }
}
