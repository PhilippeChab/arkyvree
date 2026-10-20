import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and their avatar's slot. */
async function setup() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  return { attachments: api.v1.attachments, avatar: { name: "avatar", recordId: user.id, recordType: "User" } };
}

describe("v1 attachments", () => {
  test("uploads an image to a slot in two steps, reads it, and removes it", async () => {
    const { attachments, avatar } = await setup();
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();

    const upload = await expectOk(
      attachments["direct-uploads"].$post({
        json: { ...avatar, byteSize: 1024, contentType: "image/png", filename: "me.png" },
      }),
    );
    expect(upload).toEqual({
      headers: { "Content-Type": "image/png" },
      signedId: expect.stringMatching(/^[\w-]+\.[\w-]+$/),
      uploadUrl: expect.stringContaining("https://fake.example.com"),
    });

    const attached = await expectOk(attachments[":signedId"].attach.$post({ param: { signedId: upload.signedId } }));
    expect(attached).toEqual({ id: expect.any(String), url: expect.stringContaining("me.png") });
    expect(await expectOk(attachments.$get({ query: avatar }))).toEqual(attached);
    await expectStatus(attachments[":signedId"].attach.$post({ param: { signedId: upload.signedId } }), 409);

    await expectStatus(attachments[":id"].$delete({ param: { id: attached.id } }), 204);
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();
  });

  test("refuses another user's slot, a file past what a slot takes, and a forged signed id", async () => {
    const { attachments, avatar } = await setup();
    const { user: other } = await createTestUser();
    const upload = { ...avatar, byteSize: 1024, contentType: "image/png", filename: "me.png" };
    const directUploads = attachments["direct-uploads"];
    await expectStatus(directUploads.$post({ json: { ...upload, recordId: other.id } }), 403);
    await expectStatus(directUploads.$post({ json: { ...upload, contentType: "application/pdf" } }), 400);
    await expectStatus(directUploads.$post({ json: { ...upload, byteSize: 6 * 1024 * 1024 } }), 400);
    await expectStatus(attachments[":signedId"].attach.$post({ param: { signedId: "forged.signature" } }), 400);
    await expectStatus(attachments[":id"].$delete({ param: { id: NIL_UUID } }), 404);
  });
});
