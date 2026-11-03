import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Blobs } from "@/server/repositories/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { fakeStorage } from "@/tests/support/storage.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The blob a stored object's key names (`blobs/<id>/<file>`). */
function blobIdOf(key: string) {
  return key.split("/")[1]!;
}

/** A PNG's first bytes, which name its type, then `size` bytes in all. */
function png(name: string, size = 64) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: "image/png" });
}

/** A new user's key, and their avatar's slot. */
async function setup() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  return { attachments: api.v1.attachments, avatar: { name: "avatar", recordId: user.id, recordType: "User" } };
}

describe("v1 attachments", () => {
  test("uploads an image into a slot in one request, replaces it, reads it, and removes it", async () => {
    const { attachments, avatar } = await setup();
    const deleted: string[] = [];
    ObjectStorage.setForTest(fakeStorage({ deleteObject: async (key) => void deleted.push(key) }));
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();

    const first = await expectOk(attachments.$post({ form: { ...avatar, file: png("me.png") } }));
    expect(first).toEqual({ id: expect.any(String), url: expect.stringContaining("me.png") });
    expect(await expectOk(attachments.$get({ query: avatar }))).toEqual(first);

    // The image it replaces is deleted with its blob, nothing else holding it
    const second = await expectOk(attachments.$post({ form: { ...avatar, file: png("me-too.png") } }));
    expect(await expectOk(attachments.$get({ query: avatar }))).toEqual(second);
    expect(deleted).toEqual([expect.stringContaining("me.png")]);
    expect(await Blobs.findOne(db, { id: blobIdOf(deleted[0]!) })).toBeUndefined();

    await expectStatus(attachments[":id"].$delete({ param: { id: second.id } }), 204);
    expect(await expectOk(attachments.$get({ query: avatar }))).toBeNull();
  });

  test("reads an image's type from its bytes, whatever its part declares", async () => {
    const { attachments, avatar } = await setup();
    const stored: string[] = [];
    ObjectStorage.setForTest(
      fakeStorage({ putObject: async (_key, _data, { contentType }) => void stored.push(contentType) }),
    );
    const bytes = await png("me.png").arrayBuffer();
    await expectOk(
      attachments.$post({ form: { ...avatar, file: new File([bytes], "me.bin", { type: "text/plain" }) } }),
    );
    expect(stored).toEqual(["image/png"]);
  });

  test("refuses another user's slot, a file that isn't an image, and one past what a slot takes, storing none", async () => {
    const { attachments, avatar } = await setup();
    const stored: string[] = [];
    ObjectStorage.setForTest(fakeStorage({ putObject: async (key) => void stored.push(key) }));
    const { user: other } = await createTestUser();

    await expectStatus(attachments.$post({ form: { ...avatar, recordId: other.id, file: png("me.png") } }), 403);
    const text = new File(["not an image"], "me.png", { type: "image/png" });
    await expectStatus(attachments.$post({ form: { ...avatar, file: text } }), 400);
    // Past the slot's 5 MB, and past what the route reads at all
    await expectStatus(attachments.$post({ form: { ...avatar, file: png("big.png", 5 * 1024 * 1024 + 1) } }), 400);
    await expectStatus(attachments.$post({ form: { ...avatar, file: png("huge.png", 6 * 1024 * 1024) } }), 400);
    expect(stored).toEqual([]);

    await expectStatus(attachments[":id"].$delete({ param: { id: NIL_UUID } }), 404);
  });

  test("leaves no blob behind, nor changes the slot, when storing the file fails", async () => {
    const { attachments, avatar } = await setup();
    const kept = await expectOk(attachments.$post({ form: { ...avatar, file: png("me.png") } }));
    const tried: string[] = [];
    ObjectStorage.setForTest(
      fakeStorage({
        putObject: async (key) => {
          tried.push(key);
          throw new Error("storage unavailable");
        },
      }),
    );

    await expectStatus(attachments.$post({ form: { ...avatar, file: png("lost.png") } }), 500);
    expect(tried).toHaveLength(1);
    expect(await Blobs.findOne(db, { id: blobIdOf(tried[0]!) })).toBeUndefined();
    expect(await expectOk(attachments.$get({ query: avatar }))).toEqual(kept);
  });
});
