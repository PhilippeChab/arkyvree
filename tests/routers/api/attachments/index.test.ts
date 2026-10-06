import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const attachments = api.api.attachments;
const avatar = { recordType: "User", recordId: SEED_USER_ID, name: "avatar" };
const upload = { ...avatar, filename: "me.png", contentType: "image/png", byteSize: 1024 };

describe("attachments", () => {
  test("presigns an upload, attaches it, reads it and deletes it", async () => {
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();

    const presigned = await expectOk(attachments["direct-uploads"].$post({ json: upload }));
    expect(presigned.signedId).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(presigned.presignedUrl).toContain("https://fake.example.com");
    expect(presigned.headers["Content-Type"]).toBe("image/png");

    const attached = await expectOk(attachments[":signedId"].attach.$post({ param: { signedId: presigned.signedId } }));
    expect(attached).toMatchObject({ attachment: { name: "avatar" }, blob: { filename: "me.png" } });
    expect(await expectOk(attachments.$get({ query: avatar }))).toMatchObject({
      id: attached.attachment.id,
      url: expect.stringContaining("me.png"),
    });

    await expectOk(attachments[":id"].$delete({ param: { id: attached.attachment.id } }));
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();
  });

  test("refuses to attach to another user's record", async () => {
    const { user } = await createTestUser();
    const response = await attachments["direct-uploads"].$post({ json: { ...upload, recordId: user.id } });
    await expectStatus(response, 403);
  });

  test("requires a session", async () => {
    await expectStatus(guestApi.api.attachments.$get({ query: avatar }), 401);
  });

  test("rejects a record id that isn't a UUID", async () => {
    await expectStatus(attachments.$get({ query: { ...avatar, recordId: "not-a-uuid" } }), 400);
  });

  test("returns 404 for a missing attachment", async () => {
    await expectStatus(attachments[":id"].$delete({ param: { id: NIL_UUID } }), 404);
  });
});
