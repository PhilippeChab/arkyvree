import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BadRequestError, ConflictError, NotFoundError } from "@/server/errors/index.ts";
import type { DiskStorageBackend } from "@/server/storage/DiskStorageBackend.ts";
import { WORD_DOCUMENT_TYPE } from "@/shared/attachments.ts";
import { diskStorage } from "@/tests/support/storage.ts";

const HOUR = 60 * 60 * 1000;

/** A JPEG's first bytes, which name its type, then `size` bytes in all. */
function jpeg(size = 64) {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

/** A key as the app makes one: `blobs/<a blob's id>/<a file's name>`. */
function keyFor(filename: string) {
  return `blobs/${crypto.randomUUID()}/${filename}`;
}

/** A PNG's first bytes, which name its type, then `size` bytes in all. */
function png(size = 64) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

/** The query a signed upload's link carries, read back as the files' route reads it. */
function queryOf(link: string) {
  return Object.fromEntries(new URL(link, "https://app.example.com").searchParams);
}

/** A browser's upload of `bytes` to a signed link, as the files' route hands it on. */
function uploadOf(bytes: Uint8Array<ArrayBuffer>, contentType = "image/png") {
  return new Request("https://app.example.com/upload", {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": contentType },
  });
}

/** What a stored stream holds, read whole. */
async function readAll(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("DiskStorageBackend", () => {
  let disk: ReturnType<typeof diskStorage>;
  let storage: DiskStorageBackend;

  beforeEach(() => {
    disk = diskStorage();
    storage = disk.storage;
  });

  afterEach(() => disk.remove());

  test("keeps a file the server holds, reads it back, serves it with its type, and deletes it with its folder", async () => {
    const key = keyFor("portrait.png");
    await storage.putObject(key, png(100));

    expect(await storage.objectStats(key)).toEqual({ size: 100, etag: expect.any(String) });
    expect(await storage.objectExists(key)).toBe(true);
    const served = await storage.serve(key);
    expect(served.contentType).toBe("image/png");
    expect(await readAll(served.stream)).toEqual(png(100));
    expect(storage.publicUrl(key)).toBe(`https://app.example.com/files/${key}`);

    await storage.deleteObject(key);
    expect(await storage.objectStats(key)).toBeNull();
    expect(existsSync(path.join(disk.root, path.dirname(key)))).toBe(false);
  });

  test("serves a PDF, a Word document and a text file as what their bytes (and a Word file's name) are", async () => {
    const pdf = keyFor("map.pdf");
    await storage.putObject(pdf, new TextEncoder().encode("%PDF-1.7 rest"));
    const word = keyFor("Prep.docx");
    await storage.putObject(word, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
    const text = keyFor("notes.txt");
    await storage.putObject(text, new TextEncoder().encode("The party rests."));

    expect((await storage.serve(pdf)).contentType).toBe("application/pdf");
    expect((await storage.serve(word)).contentType).toBe(WORD_DOCUMENT_TYPE);
    expect((await storage.serve(text)).contentType).toBe("text/plain; charset=utf-8");
  });

  test("answers an unknown key as none, and refuses a key the app doesn't make or one leading out of its folder", async () => {
    expect(await storage.objectStats(keyFor("missing.png"))).toBeNull();
    expect(await storage.streamObject(keyFor("missing.png"))).toBeNull();
    expect(storage.serve(keyFor("missing.png"))).rejects.toBeInstanceOf(NotFoundError);
    for (const key of [
      "../outside.png",
      `blobs/${crypto.randomUUID()}/..`,
      `blobs/${crypto.randomUUID()}/../../outside.png`,
      "blobs/not-an-id/file.png",
      `.uploading/${crypto.randomUUID()}`,
    ]) {
      expect(storage.serve(key)).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.putObject(key, png())).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  test("takes an image uploaded to the link it signed, whole, once", async () => {
    const key = keyFor("avatar.png");
    const link = storage.presignPut(key, { byteSize: 64, contentType: "image/png" });
    expect(link).toStartWith(`/files/${key}?`);
    const grant = storage.verifyGrant(key, queryOf(link));

    await storage.receiveUpload(key, grant, uploadOf(png(64)));
    expect(await storage.objectStats(key)).toMatchObject({ size: 64 });
    expect(storage.receiveUpload(key, grant, uploadOf(jpeg(64)))).rejects.toBeInstanceOf(ConflictError);
    expect(await readAll((await storage.serve(key)).stream)).toEqual(png(64));
  });

  test("takes any image the app takes, whatever type the browser named it", async () => {
    const key = keyFor("avatar.png");
    const grant = storage.verifyGrant(
      key,
      queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png" })),
    );

    await storage.receiveUpload(key, grant, uploadOf(jpeg(64)));
    expect((await storage.serve(key)).contentType).toBe("image/jpeg");
  });

  test("refuses a link that was changed, has expired, or isn't for its key", () => {
    const key = keyFor("avatar.png");
    const query = queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png" }));

    for (const [forKey, changed] of [
      [key, { ...query, size: "10000000" }],
      [key, { ...query, type: "text/plain" }],
      [key, { ...query, signature: "forged" }],
      [keyFor("other.png"), query],
    ] as const)
      expect(() => storage.verifyGrant(forKey, changed)).toThrow(BadRequestError);

    const expired = queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png", expiresIn: -1 }));
    expect(() => storage.verifyGrant(key, expired)).toThrow("The upload link has expired");
  });

  test("refuses an upload larger than it was signed for, of another type, or that isn't an image, keeping none", async () => {
    const key = keyFor("avatar.png");
    const grant = storage.verifyGrant(
      key,
      queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png" })),
    );

    expect(storage.receiveUpload(key, grant, uploadOf(png(65)))).rejects.toThrow(/larger than the 64 bytes/);
    expect(storage.receiveUpload(key, grant, uploadOf(png(64), "image/jpeg"))).rejects.toThrow(/type isn't/);
    expect(storage.receiveUpload(key, grant, uploadOf(new Uint8Array(64)))).rejects.toThrow(/isn't a PNG/);

    expect(await storage.objectStats(key)).toBeNull();
    expect(readdirSync(path.join(disk.root, ".uploading"))).toEqual([]);
  });

  test("deletes nothing for a key it would refuse, and removes what uploads cut short left once it's old", async () => {
    await storage.deleteObject("../outside.png");
    await storage.deleteObject(`blobs/${crypto.randomUUID()}/..`);

    const uploading = path.join(disk.root, ".uploading");
    mkdirSync(uploading, { recursive: true });
    writeFileSync(path.join(uploading, "old"), "partial");
    utimesSync(path.join(uploading, "old"), new Date(Date.now() - 2 * HOUR), new Date(Date.now() - 2 * HOUR));
    writeFileSync(path.join(uploading, "recent"), "partial");

    await storage.removeStaleUploads(HOUR);
    expect(readdirSync(uploading)).toEqual(["recent"]);
  });
});
