import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/api.ts";
import { createTestRuleset } from "@/tests/helpers.ts";

/** A ruleset owned by the seeded user, and another user invited to contribute to it. */
async function setup() {
  const ruleset = await createTestRuleset(SEED_USER_ID);
  const other = await createSignedInUser("contributor");
  const invite = await expectOk(
    api.api.rulesets[":id"].contributors.$post({
      param: { id: ruleset.id },
      json: { email: other.user.emailAddress, role: "Editor" },
    }),
  );
  return { id: ruleset.id, other, invite };
}

describe("rulesets contributors", () => {
  test("invites, lists, accepts, changes the role of and revokes a contributor", async () => {
    const { id, other, invite } = await setup();
    expect(invite).toMatchObject({ role: "Editor", status: "Pending" });

    const list = await expectOk(api.api.rulesets[":id"].contributors.$get({ param: { id }, query: {} }));
    expect(list.items.map((c) => c.id)).toEqual([invite.id]);

    const invites = other.api.api.rulesets.contributors.invites;
    expect((await expectOk(invites.me.$get())).map((i) => i.rulesetId)).toEqual([id]);
    expect(await expectOk(invites[":id"].$get({ param: { id: invite.id } }))).toMatchObject({
      id: invite.id,
      rulesetId: id,
    });
    expect(await expectOk(invites[":id"].accept.$post({ param: { id: invite.id } }))).toMatchObject({
      status: "Active",
    });

    const contributor = api.api.rulesets[":id"].contributors[":contributorId"];
    const param = { id, contributorId: invite.id };
    expect(await expectOk(contributor.$put({ param, json: { role: "Viewer" } }))).toMatchObject({ role: "Viewer" });
    expect(await expectOk(contributor.$delete({ param }))).toMatchObject({ status: "Revoked" });
  });

  test("rejects an invite", async () => {
    const { other, invite } = await setup();
    const rejected = await expectOk(
      other.api.api.rulesets.contributors.invites[":id"].reject.$post({ param: { id: invite.id } }),
    );
    expect(rejected.status).toBe("Rejected");
  });

  test("lets a contributor leave", async () => {
    const { id, other, invite } = await setup();
    await expectOk(other.api.api.rulesets.contributors.invites[":id"].accept.$post({ param: { id: invite.id } }));
    await expectOk(other.api.api.rulesets[":id"].contributors.leave.$post({ param: { id } }));
    const list = await expectOk(api.api.rulesets[":id"].contributors.$get({ param: { id }, query: {} }));
    expect(list.items.filter((c) => c.status === "Active")).toEqual([]);
  });

  test("refuses invites and the contributor list to someone who isn't a contributor", async () => {
    const { id } = await setup();
    const { api: outsider } = await createSignedInUser("outsider");
    const contributors = outsider.api.rulesets[":id"].contributors;
    await expectStatus(
      contributors.$post({ param: { id }, json: { email: "someone@example.com", role: "Editor" } }),
      403,
    );
    await expectStatus(contributors.$get({ param: { id }, query: {} }), 403);
  });

  test("requires a session", async () => {
    const { id } = await setup();
    await expectStatus(guestApi.api.rulesets[":id"].contributors.$get({ param: { id }, query: {} }), 401);
  });
});
