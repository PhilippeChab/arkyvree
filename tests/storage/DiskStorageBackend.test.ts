import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import type { DiskStorageBackend } from "@/server/storage/DiskStorageBackend.ts";
import { diskStorage } from "@/tests/support/storage.ts";

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

  test("serves a PDF and a text file as what their bytes are", async () => {
    const pdf = keyFor("map.pdf");
    await storage.putObject(pdf, new TextEncoder().encode("%PDF-1.7 rest"));
    const text = keyFor("notes.txt");
    await storage.putObject(text, new TextEncoder().encode("The party rests."));

    expect((await storage.serve(pdf)).contentType).toBe("application/pdf");
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

  test("takes an image uploaded to the link it signed, whole", async () => {
    const key = keyFor("avatar.png");
    const link = storage.presignPut(key, { byteSize: 64, contentType: "image/png" });
    expect(link).toStartWith(`/files/${key}?`);

    await storage.receiveUpload(key, queryOf(link), uploadOf(png(64)));
    expect(await storage.objectStats(key)).toMatchObject({ size: 64 });
  });

  test("refuses an upload whose link was changed, has expired, or isn't for its key", async () => {
    const key = keyFor("avatar.png");
    const query = queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png" }));

    const refusals = [
      storage.receiveUpload(key, { ...query, size: "10000000" }, uploadOf(png(64))),
      storage.receiveUpload(key, { ...query, type: "text/plain" }, uploadOf(png(64), "text/plain")),
      storage.receiveUpload(key, { ...query, signature: "forged" }, uploadOf(png(64))),
      storage.receiveUpload(keyFor("other.png"), query, uploadOf(png(64))),
    ];
    for (const refusal of refusals) expect(refusal).rejects.toBeInstanceOf(BadRequestError);

    const expired = queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png", expiresIn: -1 }));
    expect(storage.receiveUpload(key, expired, uploadOf(png(64)))).rejects.toThrow("The upload link has expired");
    expect(await storage.objectStats(key)).toBeNull();
  });

  test("refuses an upload larger than it was signed for, of another type, or whose bytes aren't that type, keeping none", async () => {
    const key = keyFor("avatar.png");
    const query = queryOf(storage.presignPut(key, { byteSize: 64, contentType: "image/png" }));

    expect(storage.receiveUpload(key, query, uploadOf(png(65)))).rejects.toThrow(/larger than the 64 bytes/);
    expect(storage.receiveUpload(key, query, uploadOf(png(64), "image/jpeg"))).rejects.toThrow(/type isn't/);
    expect(storage.receiveUpload(key, query, uploadOf(new Uint8Array(64)))).rejects.toThrow(/bytes aren't/);

    expect(await storage.objectStats(key)).toBeNull();
    expect(readdirSync(path.join(disk.root, ".uploading"))).toEqual([]);
  });
});
