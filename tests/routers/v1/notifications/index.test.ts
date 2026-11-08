import { describe, expect, test } from "bun:test";

import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createBaseCharacter, createFork, findSeededBase } from "@/tests/support/v1.ts";

/**
 * A new user invited to contribute to a ruleset, who accepted, and whose role its owner then changed: an invite's
 * notification, read once answered, and the change's, unread. Their key's client.
 */
async function setup() {
  const owner = await createTestUser("owner");
  const { user, session } = await createTestUser("contributor");
  const ruleset = await createFork(owner.user.id, (await findSeededBase()).id);
  const contributor = await ContributorsService.inviteContributor(
    owner.session,
    ruleset.id,
    user.emailAddress,
    "Editor",
  );
  await ContributorsService.acceptInvite(session, contributor.id);
  await ContributorsService.updateContributorRole(owner.session, ruleset.id, contributor.id, "Viewer");
  const { api } = await createKeyedApi(user.id);
  return { api, contributor, user };
}

describe("v1 notifications", () => {
  test("lists what the key's user is told of, each's target named by its kind, or only the unread ones", async () => {
    const { api, contributor } = await setup();
    const { items, nextPage, page } = await expectOk(api.v1.notifications.$get({ query: {} }));
    expect({ nextPage, page }).toEqual({ nextPage: null, page: 1 });
    const target = { id: contributor.id, kind: "contributors" };
    expect(items.find(({ type }) => type === "inviteContributor")).toMatchObject({ read: true, target });
    const changed = items.find(({ type }) => type === "updateContributorRole");
    expect(changed).toEqual({
      createdAt: expect.any(String),
      data: expect.objectContaining({ role: "Viewer" }),
      id: expect.any(String),
      read: false,
      target,
      type: "updateContributorRole",
    });
    expect((await expectOk(api.v1.notifications.$get({ query: { unreadOnly: "true" } }))).items).toEqual([changed!]);
  });

  test("marks an unread one read, which can't be marked again", async () => {
    const { api } = await setup();
    const unread = () => api.v1.notifications.$get({ query: { unreadOnly: "true" } });
    const { items } = await expectOk(unread());
    expect(items).toEqual([expect.objectContaining({ read: false, type: "updateContributorRole" })]);

    const param = { id: items[0]!.id };
    expect(await expectOk(api.v1.notifications[":id"].read.$post({ param }))).toMatchObject({ ...param, read: true });
    expect((await expectOk(unread())).items).toEqual([]);
    await expectStatus(api.v1.notifications[":id"].read.$post({ param }), 404);
  });

  test("marks them all read but invites they may still answer, which stay unread until they're answered", async () => {
    const { api, user } = await setup();
    const owner = await createTestUser("owner");
    const pending = await CharacterContributorsService.inviteContributor(
      owner.session,
      (await createBaseCharacter(owner.session.userId)).id,
      user.emailAddress,
    );
    const revokedCharacter = await createBaseCharacter(owner.session.userId);
    const revoked = await CharacterContributorsService.inviteContributor(
      owner.session,
      revokedCharacter.id,
      user.emailAddress,
    );
    await CharacterContributorsService.revokeContributor(owner.session, revokedCharacter.id, revoked.id);
    const unread = async () =>
      (await expectOk(api.v1.notifications.$get({ query: { unreadOnly: "true" } }))).items.map(
        ({ target }) => target.id,
      );
    expect(await unread()).toEqual(expect.arrayContaining([pending.id, revoked.id]));

    await expectStatus(api.v1.notifications["read-all"].$post(), 204);
    // A revoked invite can't be answered: it's read with the rest
    expect(await unread()).toEqual([pending.id]);
    const { items } = await expectOk(api.v1.notifications.$get({ query: {} }));
    expect(items.find(({ target }) => target.id === revoked.id)).toMatchObject({ read: true });
  });
});
