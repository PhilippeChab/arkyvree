import { test, expect } from '@/tests/fixtures/auth.fixture';
import { TEST_USERS } from '@/tests/fixtures/auth.fixture';

// A successful sign-up is the start of the new-account journeys (journeys/accounts.e2e.ts).
test.describe('Sign Up', () => {
  for (const [what, email, password, confirmation, errors] of [
    ['nothing', '', '', '', ['Email is required', 'Password is required']],
    ['an invalid email', 'not-an-email', 'password1234', 'password1234', ['Please enter a valid email address']],
    ['a short password', 'newuser@example.com', '12345', '12345', ['Password must be at least 12 characters']],
    ['passwords that differ', 'newuser@example.com', 'password1234', 'different123', ['Passwords do not match']],
    ['an email already in use', TEST_USERS.user1.email, 'password1234', 'password1234', [/email already in use/i]],
  ] as const) {
    test(`refuses ${what}`, async ({ page }) => {
      await page.goto('/sign-up');
      await page.fill('input[name="emailAddress"]', email);
      await page.fill('input[name="password"]', password);
      await page.fill('input[name="passwordConfirmation"]', confirmation);
      await page.click('button[type="submit"]');
      for (const error of errors) await expect(page.getByText(error)).toBeVisible();
      await expect(page).toHaveURL('/sign-up');
    });
  }

  test('links to sign-in, which links back', async ({ page }) => {
    await page.goto('/sign-up');
    await page.click('text=Sign in');
    await expect(page).toHaveURL('/sign-in');
    await page.click('text=Sign up');
    await expect(page).toHaveURL('/sign-up');
  });
});
