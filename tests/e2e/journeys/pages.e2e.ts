import { test, expect } from '@/tests/e2e/fixtures.ts';
import type { Page } from '@playwright/test';
import { parseResponse } from 'hono/client';
import { apiOf } from '@/tests/e2e/api.ts';
import { createCampaign, createCharacter, forkCoreRuleset, openContext, signIn } from '@/tests/e2e/helpers.ts';

/*
 * Every page loads, with what it shows: each opened with seeded or API-made data, showing its content, with no
 * uncaught error, console error or failed API call. The journeys test what the pages do; this catches the pages none
 * of them opens, and a page that breaks as it renders.
 */

/** What goes wrong on `page` from now on: uncaught errors, console errors, and API calls answered with an error. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (/\/(api|auth)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return errors;
}

/** Opens `path` and waits for `content` and for the calls the page makes, then checks nothing went wrong. */
async function visit(page: Page, errors: string[], path: string, content: string | RegExp) {
  await page.goto(path);
  await expect(page.getByText(content).first(), path).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  expect(errors, path).toEqual([]);
}

/** The first of a ruleset's entities of a list, by the list's name in the API. */
async function firstOf(page: Page, rulesetId: string, list: 'languages' | 'skills' | 'saves' | 'mechanics' | 'aptitudes' | 'abilities' | 'classes' | 'races' | 'feats' | 'items' | 'powers') {
  const response = await apiOf(page).api.rulesets[':id'][list].$get({ param: { id: rulesetId }, query: {} });
  const { items } = await parseResponse(response);
  if (!items[0]) throw new Error(`The ruleset has no ${list}`);
  return items[0];
}

test.describe('Every page', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
  });

  test('of the app loads', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [path, content] of [
      ['/dashboard', /Dashboard|Welcome/],
      ['/rulesets', 'Core SRD 3.5'],
      ['/campaigns', 'Campaigns'],
      ['/characters', 'Characters'],
      ['/activities', /Activit/],
      ['/notifications', 'Notifications'],
      ['/profile', 'Profile'],
      ['/settings', 'Settings'],
      ['/legal', /Open Game License/i],
    ] as const) await visit(page, errors, path, content);
  });

  test('of a ruleset loads: its sections', async ({ page }) => {
    const rulesetId = await forkCoreRuleset(page, `Pages Fork ${Date.now()}`);
    const errors = watchErrors(page);
    for (const section of ['races', 'languages', 'skills', 'feats', 'powers', 'items', 'aptitudes', 'classes', 'saves', 'abilities', 'mechanics']) {
      await visit(page, errors, `/rulesets/${rulesetId}/${section}`, 'Pages Fork');
    }
  });

  test('of a ruleset\'s entity loads, for each kind with a page of its own', async ({ page }) => {
    const rulesetId = await forkCoreRuleset(page, `Entity Pages Fork ${Date.now()}`);
    // The core rules have no mechanics
    await parseResponse(apiOf(page).api.rulesets[':id'].mechanics.$post({ param: { id: rulesetId }, json: { name: 'Grapple' } }));
    const errors = watchErrors(page);
    for (const list of ['languages', 'skills', 'saves', 'mechanics', 'aptitudes', 'abilities'] as const) {
      const entity = await firstOf(page, rulesetId, list);
      await visit(page, errors, `/rulesets/${rulesetId}/${list}/${entity.id}`, entity.name);
    }
  });

  test('of a class loads, each of its sections', async ({ page }) => {
    const rulesetId = await forkCoreRuleset(page, `Class Pages Fork ${Date.now()}`);
    const { items } = await parseResponse(apiOf(page).api.rulesets[':id'].classes.$get({ param: { id: rulesetId }, query: { search: 'Wizard' } }));
    const wizard = items.find((klass) => klass.name === 'Wizard')!;
    const errors = watchErrors(page);
    for (const section of ['levels', 'skills', 'feat-pools', 'spells-known', 'spells', 'spell-list']) {
      await visit(page, errors, `/rulesets/${rulesetId}/classes/${wizard.id}/${section}`, 'Wizard');
    }
  });

  for (const list of ['races', 'feats', 'items', 'powers'] as const) {
    test(`of the customization of ${list} loads, each of its sections`, async ({ page }) => {
      const rulesetId = await forkCoreRuleset(page, `Customization Pages Fork ${Date.now()}`);
      const entity = await firstOf(page, rulesetId, list);
      const errors = watchErrors(page);
      for (const section of ['', '/properties', '/modifiers', '/requirements']) {
        await visit(page, errors, `/rulesets/${rulesetId}/${list}/${entity.id}/customization${section}`, entity.name);
      }
    });
  }

  test('of a campaign and a character loads, and the character shared', async ({ page, browser }) => {
    const characterName = `Pages Hero ${Date.now()}`;
    const characterId = await createCharacter(page, characterName);
    const campaignId = await createCampaign(page, `Pages Campaign ${Date.now()}`);
    await parseResponse(apiOf(page).api.campaigns[':id'].characters.$post({ param: { id: campaignId }, json: { characterId, visibility: 'Public' } }));
    const { shareToken } = await parseResponse(apiOf(page).api.characters[':id'].share.$post({ param: { id: characterId } }));

    const errors = watchErrors(page);
    await visit(page, errors, `/characters/${characterId}`, characterName);
    for (const section of ['characters', 'players']) await visit(page, errors, `/campaigns/${campaignId}/${section}`, 'Pages Campaign');
    await visit(page, errors, `/campaigns/${campaignId}/characters/${characterId}`, characterName);

    // Signed out
    const guest = await (await openContext(browser)).newPage();
    try {
      await visit(guest, watchErrors(guest), `/share/${shareToken}`, characterName);
    } finally {
      await guest.context().close();
    }
  });
});
