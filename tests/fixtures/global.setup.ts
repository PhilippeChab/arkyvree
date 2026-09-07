import { chromium, type FullConfig } from '@playwright/test';
import resetDatabase from '@/scripts/db/reset.ts';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function globalSetup(config: FullConfig) {
  console.log('🔄 Resetting test database...');
  await resetDatabase(true);
  console.log('✅ Database reset complete');

  console.log('🔐 Creating authenticated session...');

  // Ensure the auth directory exists
  const authDir = join(process.cwd(), 'tests/fixtures/.auth');
  await mkdir(authDir, { recursive: true });

  // Get the base URL from config
  const baseURL = config.projects[0].use?.baseURL || 'http://localhost:5173';

  // Launch browser and create authenticated state
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to sign-in page with longer timeout
    await page.goto(`${baseURL}/sign-in`, { timeout: 60000, waitUntil: 'domcontentloaded' });

    // Wait for the sign-in form to be ready
    await page.waitForSelector('input[name="emailAddress"]', { timeout: 10000 });

    // Fill in credentials for testuser1
    await page.fill('input[name="emailAddress"]', 'testuser1@example.com');
    await page.fill('input[name="password"]', 'LocalTest123!');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for successful redirect to dashboard
    await page.waitForURL(`${baseURL}/dashboard`, { timeout: 10000 });

    // Save signed-in state
    await page.context().storageState({ path: 'tests/fixtures/.auth/user.json' });
    console.log('✅ Authenticated session created');
  } catch (error) {
    console.error('❌ Failed to create authenticated session:', error);
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/setup-error.png' });
    console.error('Screenshot saved to test-results/setup-error.png');
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
