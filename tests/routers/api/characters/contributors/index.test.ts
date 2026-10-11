import { describe, expect, test } from "bun:test";

import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** A character of the seeded user's, and a new user invited to contribute to it. */
async function setup() {
  const ctx = await getSeedCtx();
  const character = await expectOk(
    api.api.characters.$post({
      json: {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Shared Character",
        xp: 0,
        alignment: "True Neutral",
        abilities: {},
        age: 25,
        gender: "Other",
        height: "5'10\"",
        weight: "160 lbs",
      },
    }),
  );
  const invitee = await createSignedInUser("invitee");
  const invite = await expectOk(
    api.api.characters[":id"].contributors.$post({
      param: { id: character.id },
      json: { email: invitee.user.emailAddress },
    }),
  );
  return { id: character.id, invitee, invite };
}

describe("character contributors", () => {
  test("invites a user by email and lists the invite", async () => {
    const { id, invitee, invite } = await setup();
    expect(invite).toMatchObject({ status: "Pending", email: invitee.user.emailAddress, userId: invitee.user.id });
    const list = await expectOk(api.api.characters[":id"].contributors.$get({ param: { id }, query: {} }));
    expect(list.items.map((c) => c.id)).toEqual([invite.id]);
  });

  test("matches an invite's email to the account whatever its case", async () => {
    const { id } = await setup();
    const other = await createSignedInUser("mixedcase");
    const invite = await expectOk(
      api.api.characters[":id"].contributors.$post({
        param: { id },
        json: { email: other.user.emailAddress.toUpperCase() },
      }),
    );
    expect(invite).toMatchObject({ email: other.user.emailAddress, userId: other.user.id });
  });

  test("shows the invitee their invite, and lets them accept it and see the contributors", async () => {
    const { id, invitee, invite } = await setup();
    const invites = invitee.api.api.characters.contributors.invites;
    expect((await expectOk(invites.me.$get())).map((i) => i.id)).toEqual([invite.id]);
    expect(await expectOk(invites[":id"].$get({ param: { id: invite.id } }))).toMatchObject({
      id: invite.id,
      status: "Pending",
    });

    // Before accepting, the invitee isn't a contributor yet.
    const contributors = invitee.api.api.characters[":id"].contributors;
    await expectStatus(contributors.$get({ param: { id }, query: {} }), 403);
    expect(await expectOk(invites[":id"].accept.$post({ param: { id: invite.id } }))).toMatchObject({
      status: "Active",
    });
    expect((await expectOk(contributors.$get({ param: { id }, query: {} }))).items).toHaveLength(1);
  });

  test("lets the invitee reject the invite", async () => {
    const { invitee, invite } = await setup();
    const rejected = await expectOk(
      invitee.api.api.characters.contributors.invites[":id"].reject.$post({ param: { id: invite.id } }),
    );
    expect(rejected.status).toBe("Rejected");
  });

  test("lets a contributor leave, and the owner remove one", async () => {
    const { id, invitee, invite } = await setup();
    await expectOk(invitee.api.api.characters.contributors.invites[":id"].accept.$post({ param: { id: invite.id } }));
    await expectOk(invitee.api.api.characters[":id"].contributors.leave.$post({ param: { id } }));
    await expectStatus(invitee.api.api.characters[":id"].contributors.$get({ param: { id }, query: {} }), 403);

    const other = await createSignedInUser("removed");
    const second = await expectOk(
      api.api.characters[":id"].contributors.$post({ param: { id }, json: { email: other.user.emailAddress } }),
    );
    await expectOk(
      api.api.characters[":id"].contributors[":contributorId"].$delete({ param: { id, contributorId: second.id } }),
    );
    // A removed invite can no longer be accepted.
    await expectStatus(
      other.api.api.characters.contributors.invites[":id"].accept.$post({ param: { id: second.id } }),
      409,
    );
  });

  test("requires a session", async () => {
    const { id } = await setup();
    await expectStatus(guestApi.api.characters[":id"].contributors.$get({ param: { id }, query: {} }), 401);
  });
});
