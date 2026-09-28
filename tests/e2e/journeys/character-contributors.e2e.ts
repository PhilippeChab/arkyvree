import { test, expect } from '@/tests/e2e/fixtures.ts';
import { answerInvite, apiResponse, createCharacter, inviteContributor, openContributors, openSharedCharacter, signedInPage } from '@/tests/e2e/helpers.ts';

test.describe('Character contributors', () => {
  test('a contributor who accepts renames the character, without its owner\'s actions, and the owner sees the name', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const name = `Shared Hero ${Date.now()}`;
    const renamed = `${name} edited by contributor`;
    const owner = await signedInPage(browser, ownerUser);
    await createCharacter(owner, name);
    const characterUrl = owner.url();
    await inviteContributor(owner, inviteeUser.email);

    const contributor = await signedInPage(browser, inviteeUser);
    await answerInvite(contributor, name, 'Accept');
    await openSharedCharacter(contributor, name);
    // Sharing and archiving are the owner's.
    await contributor.locator('[data-testid="MoreVertIcon"]').first().click();
    const menu = contributor.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Share' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Archive' })).toHaveCount(0);
    await contributor.keyboard.press('Escape');

    // Clicking the heading edits the name in place.
    await contributor.locator(`h5:has-text("${name}")`).first().click();
    const field = contributor.locator('input:focus');
    await field.fill(renamed);
    const saved = apiResponse(contributor, 'PUT', /\/api\/characters\/[a-f0-9-]+(?:\?|$)/);
    await field.press('Enter');
    await saved;

    await owner.goto(characterUrl);
    await expect(owner.locator(`h5:has-text("${renamed}")`)).toBeVisible({ timeout: 10_000 });

    await owner.context().close();
    await contributor.context().close();
  });

  test('a contributor the owner removes loses the character', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const name = `Remove Hero ${Date.now()}`;
    const owner = await signedInPage(browser, ownerUser);
    await createCharacter(owner, name);
    await inviteContributor(owner, inviteeUser.email);

    const contributor = await signedInPage(browser, inviteeUser);
    await answerInvite(contributor, name, 'Accept');
    await openSharedCharacter(contributor, name);

    // Reloaded, the owner sees the accepted contributor rather than the pending invite.
    await owner.reload();
    const contributors = await openContributors(owner);
    await expect(contributors.locator(`text="${inviteeUser.email}"`).first()).toBeVisible({ timeout: 10_000 });
    await contributors.getByRole('button', { name: 'Remove' }).first().click();
    const removed = apiResponse(owner, 'DELETE', /\/api\/characters\/[a-f0-9-]+\/contributors\/[a-f0-9-]+/);
    await owner.getByRole('dialog', { name: 'Remove Contributor' }).getByRole('button', { name: /^Remove$/ }).click();
    await removed;

    await contributor.goto('/characters?view=shared');
    await expect(contributor.locator(`text="${name}"`)).toHaveCount(0, { timeout: 15_000 });

    await owner.context().close();
    await contributor.context().close();
  });
});
