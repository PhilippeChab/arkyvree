import { randomUUID } from "node:crypto";

import { type Browser, type BrowserContextOptions, expect, type Locator, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "@/tests/e2e/api.ts";
import { recordContext } from "@/tests/e2e/coverage.ts";
import { queryDatabase } from "@/tests/e2e/fixtures.ts";

export async function selectOption(page: Page, label: string, optionText?: string) {
  // Scope to the open MUI dialog (aria-modal="true") when one is showing
  const modalDialog = page.locator('[role="dialog"][aria-modal="true"]');
  const scope = (await modalDialog
    .first()
    .isVisible()
    .catch(() => false))
    ? modalDialog
    : page;
  await scope.locator(`text="${label}"`).first().locator("..").locator('[role="combobox"]').click();
  await page.locator('[role="listbox"]').waitFor({ state: "visible" });
  if (optionText) {
    await page.locator(`[role="option"]:has-text("${optionText}")`).click();
  } else {
    await page.locator('[role="option"]').first().click();
  }
}

/** Keep Core SRD reachable when forks push it beyond the first results page. */
export async function visitCoreRulesetList(page: Page) {
  await page.goto("/rulesets?search=Core%20SRD%203.5");
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

/** The core rules' id. */
async function coreRulesetId(page: Page) {
  const { items } = await parseResponse(
    apiOf(page).api.rulesets.$get({ query: { scope: "base", search: "Core SRD 3.5" } }),
  );
  const core = items.find((ruleset) => ruleset.name === "Core SRD 3.5");
  if (!core) throw new Error("Core SRD 3.5 isn't seeded");
  return core.id;
}

/** Waits for a successful `method` request to a URL matching `url`. Start it before the action that sends it. */
export function apiResponse(page: Page, method: string, url: RegExp) {
  return page.waitForResponse((r) => url.test(r.url()) && r.request().method() === method && r.ok(), {
    timeout: 15_000,
  });
}

/** Creates a campaign on the core rules through the API, and opens its page. Returns its id. */
export async function createCampaign(page: Page, name: string) {
  const { campaign } = await parseResponse(
    apiOf(page).api.campaigns.$post({ json: { name, rulesetId: await coreRulesetId(page) } }),
  );
  await page.goto(`/campaigns/${campaign.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 10_000 });
  return campaign.id;
}

/** Invites `email` as a player of the open campaign. */
export async function invitePlayer(page: Page, email: string) {
  await page.getByRole("tab", { name: /Players/i }).click();
  await page.getByRole("button", { name: "Add Player" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Player" });
  await dialog.locator('input[name="email"]').fill(email);
  const invited = apiResponse(page, "POST", /\/api\/campaigns\/[a-f0-9-]+\/players/);
  await dialog.getByRole("button", { name: /Add Player|Send|Invite/ }).click();
  await invited;
  await expect(page.locator('text="Invite Pending"').first()).toBeVisible({ timeout: 15_000 });
}

/** A name no other test uses: ruleset names are unique across users, and parallel tests can start in the same millisecond. */
export const uniqueName = (prefix: string) => `${prefix} ${randomUUID().slice(0, 8)}`;

/** Forks the core rules through the API, and opens the fork's page. Returns the fork's id. */
export async function forkCoreRuleset(page: Page, name: string) {
  const fork = await parseResponse(
    apiOf(page).api.rulesets[":id"].fork.$post({
      param: { id: await coreRulesetId(page) },
      json: { name, description: "", private: false },
    }),
  );
  await page.goto(`/rulesets/${fork.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 10_000 });
  return fork.id;
}

/** Picks `item` in the actions menu of the ruleset, character or campaign on the page. */
export async function openActionsMenu(page: Page, item: string | RegExp) {
  await page.getByRole("button", { name: "More actions" }).first().click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: item }).click();
}

/** Opens, from the fork on the page, the customization page of its race named `name`. */
export async function openRace(page: Page, name: string) {
  await page.getByRole("tab", { name: "Races" }).click();
  // A cell, exactly: other races' descriptions mention humans.
  await page.getByRole("cell", { name, exact: true }).first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);
}

/** Opens, from the fork on the page, the customization page of its feat named `name`. */
export async function openFeat(page: Page, name: string) {
  await page.getByRole("tab", { name: "Feats" }).click();
  await page.getByPlaceholder("Search feats...").fill(name);
  await page.getByRole("cell", { name, exact: true }).first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/feats\/[a-f0-9-]+\/customization/);
}

/** Opens, from the fork on the page, the customization page of Fighter's first level. */
export async function openFighterLevel1(page: Page) {
  await page.getByRole("tab", { name: "Classes" }).click();
  await page.getByRole("cell", { name: "Fighter", exact: true }).first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/classes\/[a-f0-9-]+\/levels/);
  // A level's first cell is its number.
  await page
    .locator("table tbody tr")
    .filter({ has: page.locator("td").first().getByText("1", { exact: true }) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/class-levels\/[a-f0-9-]+\/customization/);
  // The title is styled as a heading but renders as a paragraph.
  await expect(page.getByText(/Customize\s+Fighter\s+Level 1/)).toBeVisible();
}

/** Renames the race or feat whose customization page is open, and waits for the save. */
export async function renameEntity(page: Page, name: string) {
  await page.getByLabel("Name", { exact: true }).first().fill(name);
  const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/(races|feats)\/[a-f0-9-]+/);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Name") })
    .first()
    .getByRole("button", { name: /^Save$/ })
    .click();
  await saved;
}

/** Shows the list page's items under the Filter menu's `item`, such as Archived or Shared. */
export async function filterList(page: Page, item: RegExp) {
  await page.getByRole("button", { name: "Filter" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: item }).click();
}

/** Fills a modifier dialog: `value` added to Strength. */
export async function fillStrengthModifier(dialog: Locator, value: number) {
  await dialog.locator('input[placeholder="Search..."]').fill("strength");
  const strength = dialog.getByText("Abilities › Strength › Misc").first();
  await expect(strength).toBeVisible({ timeout: 10_000 });
  await strength.click();
  // Picking the path seeds the value with 0: select it before typing.
  const input = dialog.locator('input[type="number"]');
  await input.click();
  await input.press("Control+a");
  await input.fill(String(value));
}

/** Opens the contributors of the ruleset or character on the page, from its actions menu. */
export async function openContributors(page: Page) {
  await openActionsMenu(page, "Contributors");
  const manager = page.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: "Contributors" }).first();
  await expect(manager).toBeVisible();
  return manager;
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

/** The notification bell, whose name says how many notifications are unread. */
export const notificationBell = (page: Page) => page.locator('button[aria-label*=" unread notification"]');

/** How many notifications the bell says are unread. */
export async function unreadCount(page: Page) {
  const match = (await notificationBell(page).getAttribute("aria-label"))?.match(/^(\d+) unread notifications?$/);
  return match ? Number(match[1]) : -1;
}

/** Opens a character shared with the user, from the Shared view of their characters. */
export async function openSharedCharacter(page: Page, name: string) {
  await page.goto("/characters");
  await filterList(page, /^Shared$/);
  await page.locator(`text="${name}"`).first().click();
  await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
}

/** Opens the Create Character dialog and fills it for a D&D 3.5 character named `name`, without submitting it. */
export async function fillNewCharacter(page: Page, name: string) {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Create Character" }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.locator('input[name="name"]').fill(name);
  // The race select waits for the ruleset's races: listen before picking the ruleset.
  const races = page.waitForResponse((r) => r.url().includes("/api/characters/available-races") && r.ok(), {
    timeout: 10_000,
  });
  await selectOption(page, "Ruleset", "Core SRD 3.5");
  await races;
  await selectOption(page, "Race");
  await dialog.locator('input[name="height"]').fill("5 feet 8 inches");
  await dialog.locator('input[name="weight"]').fill("150 lbs");
  await expect(dialog.getByText("Strength", { exact: true })).toBeVisible({ timeout: 10_000 });
  // Scores start empty under 4d6 Drop Lowest.
  await dialog.getByRole("button", { name: /Roll all ability scores/i }).click();
  await selectOption(page, "Alignment");
  await selectOption(page, "Gender");
  return dialog;
}

/** Creates a human D&D 3.5 character with 10 in each ability through the API, and opens its sheet. Returns its id. */
export async function createCharacter(page: Page, name: string) {
  const api = apiOf(page);
  const rulesetId = await coreRulesetId(page);
  const races = await parseResponse(
    api.api.characters["available-races"].$get({ query: { rulesetId, search: "Human" } }),
  );
  const human = races.items.find((race) => race.name === "Human");
  if (!human) throw new Error("The core rules have no Human");
  const abilities = await parseResponse(
    api.api.rulesets[":id"].abilities.$get({ param: { id: rulesetId }, query: {} }),
  );
  const character = await parseResponse(
    api.api.characters.$post({
      json: {
        rulesetId,
        raceId: human.id,
        name,
        xp: 0,
        alignment: "True Neutral",
        gender: "Other",
        abilities: Object.fromEntries(abilities.items.map((ability) => [ability.id, 10])),
      },
    }),
  );
  await page.goto(`/characters/${character.id}`);
  await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
  return character.id;
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

/** The code that verifies a user's email address. */
export const getEmailVerificationCode = (email: string) => latestCode("email_verifications", email);

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
export const getPasswordResetCode = (email: string) => latestCode("password_resets", email);
