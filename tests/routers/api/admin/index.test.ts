import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A response, as `expectStatus` reads it. */
interface Answered {
  clone(): { text(): Promise<string> };
  status: number;
}

/** Every admin route, as `client` sends it, about an account (`id`): each sent when it's called, one at a time. */
function adminRoutes(client: typeof api, id: string): (() => Promise<Answered>)[] {
  const admin = client.api.admin;
  const param = { id };
  return [
    () => admin.accounts.$get({ query: {} }),
    () => admin.settings.$get(),
    () => admin.accounts[":id"]["verify-email"].$post({ param }),
    () => admin.accounts[":id"].admin.$put({ param, json: { isAdmin: true } }),
    () => admin.accounts[":id"].deactivated.$put({ param, json: { deactivated: true } }),
    () => admin.settings.$put({ json: { signUpPolicy: "Closed" } }),
    () => admin["invite-links"].$get({ query: {} }),
    () => admin["invite-links"].$post({ json: { expiresInDays: 7 } }),
    () => admin["invite-links"][":id"].revoke.$post({ param }),
  ];
}

test("an account that isn't an admin is refused on every admin route, and a guest asked to sign in", async () => {
  const { user } = await createTestUser("target");
  const { api: member } = await createSignedInUser("member");
  for (const send of adminRoutes(member, user.id)) await expectStatus(send(), 403);
  for (const send of adminRoutes(guestApi, user.id)) await expectStatus(send(), 401);
  // An id no row has, an invite link's among them: refused alike, so a member learns nothing of what exists
  for (const send of adminRoutes(member, NIL_UUID)) await expectStatus(send(), 403);
});

test("an admin makes an invite link, lists it and revokes it; a visitor reads what its token lets them do", async () => {
  const link = await expectOk(api.api.admin["invite-links"].$post({ json: { expiresInDays: 30 } }));
  expect(link.token).toStartWith("arki_");
  await expectStatus(api.api.admin["invite-links"].$post({ json: { expiresInDays: 2 as 1 } }), 400);

  const { items } = await expectOk(api.api.admin["invite-links"].$get({ query: {} }));
  expect(items.map((item) => item.id)).toEqual([link.id]);
  expect(await expectOk(guestApi.auth["invite-links"].state.$post({ json: { token: link.token } }))).toEqual({
    state: "Valid",
  });

  await expectOk(api.api.admin["invite-links"][":id"].revoke.$post({ param: { id: link.id } }));
  expect(await expectOk(guestApi.auth["invite-links"].state.$post({ json: { token: link.token } }))).toEqual({
    state: "Revoked",
  });
});

test("a visitor signs up with an invite link while the instance takes invites alone", async () => {
  await expectOk(api.api.admin.settings.$put({ json: { signUpPolicy: "Invite Only" } }));
  const link = await expectOk(api.api.admin["invite-links"].$post({ json: { expiresInDays: 1 } }));
  const emailAddress = `link-${uniqueId()}@example.com`;
  const body = { emailAddress, password: "password1234", passwordConfirmation: "password1234" };
  await expectStatus(guestApi.auth["sign-up"].$post({ json: { ...body, emailAddress: `x${emailAddress}` } }), 403);
  await expectStatus(guestApi.auth["sign-up"].$post({ json: { ...body, inviteToken: link.token } }), 201);
});

test("an admin runs the instance: its accounts and its sign-up setting", async () => {
  const { user } = await createTestUser("target");
  const { items } = await expectOk(api.api.admin.accounts.$get({ query: { search: user.emailAddress } }));
  expect(items.map((account) => account.id)).toEqual([user.id]);

  const param = { id: user.id };
  expect((await expectOk(api.api.admin.accounts[":id"].admin.$put({ param, json: { isAdmin: true } }))).isAdmin).toBe(
    true,
  );
  const deactivated = await expectOk(
    api.api.admin.accounts[":id"].deactivated.$put({ param, json: { deactivated: true } }),
  );
  expect(deactivated.deactivatedAt).not.toBeNull();
  expect(
    (await expectOk(api.api.admin.accounts[":id"]["verify-email"].$post({ param }))).emailVerifiedAt,
  ).not.toBeNull();
  await expectStatus(
    api.api.admin.accounts[":id"].deactivated.$put({ param: { id: SEED_USER_ID }, json: { deactivated: true } }),
    409,
  );

  expect(await expectOk(api.api.admin.settings.$put({ json: { signUpPolicy: "Invite Only" } }))).toEqual({
    signUpPolicy: "Invite Only",
  });
  expect(await expectOk(api.api.admin.settings.$get())).toEqual({ signUpPolicy: "Invite Only" });
});

test("a signed-out visitor reads who may sign up, which the sign-up page shows", async () => {
  expect(await expectOk(guestApi.auth["sign-up-policy"].$get())).toEqual({ hasAdmin: true, signUpPolicy: "Open" });
  await expectOk(api.api.admin.settings.$put({ json: { signUpPolicy: "Closed" } }));
  expect(await expectOk(guestApi.auth["sign-up-policy"].$get())).toEqual({ hasAdmin: true, signUpPolicy: "Closed" });
});
