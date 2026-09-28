import { describe, expect, test } from "bun:test";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createTestUser, NIL_UUID } from "@/tests/helpers.ts";

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
    expect(await expectOk(attachments.$get({ query: avatar }))).toMatchObject({ id: attached.attachment.id, url: expect.stringContaining("me.png") });

    await expectOk(attachments[":id"].$delete({ param: { id: attached.attachment.id } }));
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();
  });

  test("refuses to attach to another user's record", async () => {
    const { user } = await createTestUser();
    const response = await attachments["direct-uploads"].$post({ json: { ...upload, recordId: user.id } });
    expect(response.status).toBe(403);
  });

  test("requires a session", async () => {
    expect((await guestApi.api.attachments.$get({ query: avatar })).status).toBe(401);
  });

  test("rejects a record id that isn't a UUID", async () => {
    expect((await attachments.$get({ query: { ...avatar, recordId: "not-a-uuid" } })).status).toBe(400);
  });

  test("returns 404 for a missing attachment", async () => {
    expect((await attachments[":id"].$delete({ param: { id: NIL_UUID } })).status).toBe(404);
  });
});
