import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { sweepPendingBlobs } from "@/server/jobs/sweepPendingBlobs.ts";
import { Blobs } from "@/server/repositories/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { DOCUMENT_FILE_SLOT } from "@/shared/attachments.ts";
import { diskStorage } from "@/tests/support/storage.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A signed upload's link's key. */
function keyOf(link: string) {
  return new URL(link, "https://app.example.com").pathname.replace(/^\/files\//, "");
}

/** A PNG's first bytes, which name its type, then `size` bytes in all. */
function png(size = 64) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

/** The query a signed upload's link carries. */
function queryOf(link: string) {
  return Object.fromEntries(new URL(link, "https://app.example.com").searchParams);
}

/** A browser's upload of `bytes`, with the headers its link was signed for. */
function upload(bytes: Uint8Array<ArrayBuffer>, headers: Record<string, string>) {
  return new Request("https://app.example.com", { method: "PUT", body: bytes, headers });
}

/** What a stored stream holds, read whole. */
async function readAll(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("attachments on the server's disk", () => {
  let disk: ReturnType<typeof diskStorage>;

  beforeEach(() => {
    disk = diskStorage();
    ObjectStorage.setForTest(disk.storage);
  });

  afterEach(() => disk.remove());

  test("an avatar uploaded to its signed link attaches, reads back from the app's URL, and leaves with its removal", async () => {
    const { session } = await createTestUser();
    const slot = { recordType: "User", recordId: session.userId, name: "avatar" };
    const direct = await AttachmentsService.createDirectUpload(session, {
      ...slot,
      filename: "me.png",
      contentType: "image/png",
      byteSize: 64,
    });
    const key = keyOf(direct.presignedUrl);
    await AttachmentsService.createDiskUpload(key, queryOf(direct.presignedUrl), upload(png(64), direct.headers));

    const { attachment } = await AttachmentsService.attach(session, direct.signedId);
    const read = await AttachmentsService.getAttachment(slot);
    expect(read).toEqual({ id: attachment.id, url: `https://app.example.com/files/${key}` });
    expect(await readAll((await disk.storage.serve(key)).stream)).toEqual(png(64));

    // Its link, replayed once its blob is attached, stores nothing
    expect(
      AttachmentsService.createDiskUpload(key, queryOf(direct.presignedUrl), upload(png(64), direct.headers)),
    ).rejects.toBeInstanceOf(ConflictError);

    await AttachmentsService.detach(session, attachment.id);
    expect(await disk.storage.objectStats(key)).toBeNull();
    // Nor once its blob is gone with its file
    expect(
      AttachmentsService.createDiskUpload(key, queryOf(direct.presignedUrl), upload(png(64), direct.headers)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await disk.storage.objectStats(key)).toBeNull();
  });

  test("a file named with dots alone is stored as `file`", async () => {
    const { session } = await createTestUser();
    const direct = await AttachmentsService.createDirectUpload(session, {
      recordType: "User",
      recordId: session.userId,
      name: "avatar",
      filename: "...",
      contentType: "image/png",
      byteSize: 64,
    });
    expect(keyOf(direct.presignedUrl)).toEndWith("/file");
  });

  test("an avatar whose upload never arrived isn't attached", async () => {
    const { session } = await createTestUser();
    const direct = await AttachmentsService.createDirectUpload(session, {
      recordType: "User",
      recordId: session.userId,
      name: "avatar",
      filename: "me.png",
      contentType: "image/png",
      byteSize: 64,
    });
    expect(AttachmentsService.attach(session, direct.signedId)).rejects.toThrow(/Upload not found/);
  });

  test("a private file the server stores reads back through it, as it was stored", async () => {
    const pending = await AttachmentsService.createPendingFile(
      DOCUMENT_FILE_SLOT.recordType,
      new File([new TextEncoder().encode("%PDF-1.7 map")], "map.pdf", { type: "application/pdf" }),
    );
    expect(await readAll((await disk.storage.streamObject(pending.key))!.stream)).toEqual(
      new TextEncoder().encode("%PDF-1.7 map"),
    );

    await AttachmentsService.removePendingFile(pending);
    expect(await disk.storage.objectStats(pending.key)).toBeNull();
  });

  test("the sweep deletes a pending upload's file and row once it's old enough, and an upload cut short", async () => {
    const key = `blobs/${crypto.randomUUID()}/old.png`;
    await disk.storage.putObject(key, png(100));
    const [blob] = await Blobs.create(db, { key, filename: "old.png", contentType: "image/png", byteSize: 100 });
    await Blobs.update(db, { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }, { id: blob!.id });

    const partial = path.join(disk.root, ".uploading", "cut-short");
    mkdirSync(path.dirname(partial), { recursive: true });
    writeFileSync(partial, "partial");
    utimesSync(partial, new Date(Date.now() - 2 * 60 * 60 * 1000), new Date(Date.now() - 2 * 60 * 60 * 1000));

    expect(await sweepPendingBlobs()).toMatchObject({ swept: 1, failed: 0 });
    expect(existsSync(partial)).toBe(false);
    expect(await disk.storage.objectStats(key)).toBeNull();
    expect(await Blobs.findOne(db, { id: blob!.id })).toBeUndefined();
  });
});
