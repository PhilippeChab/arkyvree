import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's ruleset, their key's client, and another user to invite. */
async function setup() {
  const { user: owner } = await createTestUser("owner");
  const { user: invitee } = await createTestUser("invitee");
  const ruleset = await createTestRuleset(owner.id);
  const { api } = await createKeyedApi(owner.id);
  return { contributors: api.v1.rulesets[":id"].contributors, invitee, owner, ruleset };
}

describe("v1 ruleset contributors", () => {
  test("invites an address to contribute in a role, and lists the invite with the ruleset's owner", async () => {
    const { contributors, invitee, owner, ruleset } = await setup();
    const param = { id: ruleset.id };
    const invite = await expectOk(contributors.$post({ param, json: { email: invitee.emailAddress, role: "Viewer" } }));
    expect(invite).toEqual({
      email: invitee.emailAddress,
      id: expect.any(String),
      role: "Viewer",
      status: "Pending",
      userId: invitee.id,
    });
    expect(await expectOk(contributors.$get({ param, query: {} }))).toEqual({
      items: [invite],
      nextPage: null,
      owner: { id: owner.id, username: owner.username },
      page: 1,
    });
    expect(await expectOk(contributors.$post({ param, json: { email: "editor@example.com" } }))).toMatchObject({
      role: "Editor",
      userId: null,
    });
  });

  test("changes an active contributor's role, and removes them, through their own ruleset alone", async () => {
    const { contributors, invitee, owner, ruleset } = await setup();
    const { id: contributorId } = await addRulesetContributor(ruleset.id, invitee, owner.id);
    const other = await createTestRuleset(owner.id);
    const elsewhere = { contributorId, id: other.id };
    await expectStatus(contributors[":contributorId"].$put({ param: elsewhere, json: { role: "Admin" } }), 404);
    await expectStatus(contributors[":contributorId"].$delete({ param: elsewhere }), 404);

    const param = { contributorId, id: ruleset.id };
    expect(await expectOk(contributors[":contributorId"].$put({ param, json: { role: "Admin" } }))).toMatchObject({
      id: contributorId,
      role: "Admin",
      status: "Active",
    });
    await expectStatus(contributors[":contributorId"].$delete({ param }), 204);
    expect((await expectOk(contributors.$get({ param: { id: ruleset.id }, query: {} }))).items).toEqual([]);
  });

  test("lets a contributor read the others, and leave", async () => {
    const { invitee, owner, ruleset } = await setup();
    await addRulesetContributor(ruleset.id, invitee, owner.id);
    const { api } = await createKeyedApi(invitee.id);
    const contributors = api.v1.rulesets[":id"].contributors;
    const param = { id: ruleset.id };
    expect((await expectOk(contributors.$get({ param, query: {} }))).items).toMatchObject([{ status: "Active" }]);
    await expectStatus(contributors.$post({ param, json: { email: "friend@example.com" } }), 403);

    await expectStatus(contributors.leave.$post({ param }), 204);
    await expectStatus(contributors.leave.$post({ param }), 404);
  });

  test("refuses a stranger, and a ruleset that doesn't exist", async () => {
    const { ruleset } = await setup();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    const contributors = api.v1.rulesets[":id"].contributors;
    await expectStatus(contributors.$get({ param: { id: ruleset.id }, query: {} }), 403);
    await expectStatus(contributors.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
