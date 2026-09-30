import { test, expect } from '@/tests/e2e/fixtures.ts';
import { answerInvite, apiResponse, forkCoreRuleset, inviteContributor, openContributors, openRace, renameEntity, signedInPage, uniqueName } from '@/tests/e2e/helpers.ts';

test.describe('Ruleset contributors', () => {
  test('an Editor who accepts edits the fork, and the owner sees the change', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const forkName = uniqueName('Contrib Fork');
    const renamedRace = `Editor Touched ${Date.now()}`;
    const owner = await signedInPage(browser, ownerUser);
    const forkId = await forkCoreRuleset(owner, forkName);
    await inviteContributor(owner, inviteeUser.email);

    const editor = await signedInPage(browser, inviteeUser);
    await answerInvite(editor, forkName, 'Accept');
    await editor.goto(`/rulesets/${forkId}`);
    await openRace(editor, 'Human');
    await renameEntity(editor, renamedRace);

    await owner.goto(`/rulesets/${forkId}/races`);
    await expect(owner.locator(`text="${renamedRace}"`).first()).toBeVisible({ timeout: 10_000 });

    await owner.context().close();
    await editor.context().close();
  });

  test('an invitee who rejects never gets the fork', async ({ browser, ownerUser, inviteeUser }) => {
    const forkName = uniqueName('Contrib Reject Fork');
    const owner = await signedInPage(browser, ownerUser);
    await forkCoreRuleset(owner, forkName);
    await inviteContributor(owner, inviteeUser.email);

    const invitee = await signedInPage(browser, inviteeUser);
    await answerInvite(invitee, forkName, 'Reject');
    await expect(invitee.locator('tr', { hasText: forkName }).filter({ has: invitee.getByRole('button', { name: 'Reject' }) })).toHaveCount(0, { timeout: 10_000 });
    await invitee.goto('/rulesets');
    await expect(invitee.locator(`h6:has-text("${forkName}")`)).toHaveCount(0);

    await owner.context().close();
    await invitee.context().close();
  });

  test('a contributor who leaves loses the fork', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const forkName = uniqueName('Leave Fork');
    const owner = await signedInPage(browser, ownerUser);
    const forkId = await forkCoreRuleset(owner, forkName);
    await inviteContributor(owner, inviteeUser.email);

    const contributor = await signedInPage(browser, inviteeUser);
    await answerInvite(contributor, forkName, 'Accept');
    await contributor.goto(`/rulesets/${forkId}`);
    await (await openContributors(contributor)).getByRole('button', { name: /^Leave$/ }).click();
    const left = apiResponse(contributor, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/contributors\/leave/);
    await contributor.getByRole('dialog', { name: 'Leave Ruleset' }).getByRole('button', { name: /^Leave$/ }).click();
    await left;

    await expect(contributor).toHaveURL(/\/rulesets(\?|$)/, { timeout: 15_000 });
    await expect(contributor.locator(`h6:has-text("${forkName}")`)).toHaveCount(0);
    await contributor.goto(`/rulesets/${forkId}`);
    await expect(contributor.getByRole('heading', { name: forkName })).toHaveCount(0, { timeout: 5000 });

    await owner.context().close();
    await contributor.context().close();
  });
});
