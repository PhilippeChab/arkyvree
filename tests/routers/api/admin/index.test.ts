import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
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
  ];
}

test("an account that isn't an admin is refused on every admin route, and a guest asked to sign in", async () => {
  const { user } = await createTestUser("target");
  const { api: member } = await createSignedInUser("member");
  for (const send of adminRoutes(member, user.id)) await expectStatus(send(), 403);
  for (const send of adminRoutes(guestApi, user.id)) await expectStatus(send(), 401);
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
