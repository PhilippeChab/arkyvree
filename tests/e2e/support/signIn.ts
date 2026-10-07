import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { recordContext } from "@/tests/e2e/coverage.ts";

import { apiOf } from "./api.ts";

/** A new browser context, for another user or a guest: the run's coverage records its pages. Close it when done. */
export async function openContext(browser: Browser, options?: BrowserContextOptions) {
  return recordContext(await browser.newContext(options));
}

/** A page of a new browser context signed in as `user`. Close it with `page.context().close()`. */
export async function signedInPage(browser: Browser, user: { email: string; password: string }) {
  const page = await (await openContext(browser)).newPage();
  await signIn(page, user.email, user.password);
  return page;
}

/** Signs the page's browser context in, through the API (the sign-in form has tests of its own), and opens the dashboard. */
export async function signIn(page: Page, email: string, password: string) {
  await parseResponse(apiOf(page).auth["sign-in"].$post({ json: { emailAddress: email, password } }));
  await page.goto("/dashboard");
}

/** Signs in through the sign-in form, which the page shows: for the tests of what the form does after. */
export async function submitSignIn(page: Page, email: string, password: string) {
  await page.fill('input[name="emailAddress"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}
