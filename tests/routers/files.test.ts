import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { diskStorage, fakeStorage } from "@/tests/support/storage.ts";

/** A PNG's first bytes, which name its type, then `size` bytes in all. */
function png(size = 64) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

describe("/files", () => {
  let disk: ReturnType<typeof diskStorage>;

  beforeEach(() => {
    disk = diskStorage();
    ObjectStorage.setForTest(disk.storage);
  });

  afterEach(() => disk.remove());

  test("takes an image at its signed link, then serves it to whoever has its key, cached for good", async () => {
    const key = `blobs/${crypto.randomUUID()}/avatar.png`;
    const link = disk.storage.presignPut(key, { byteSize: 64, contentType: "image/png" });

    const upload = await application.request(link, {
      method: "PUT",
      body: png(64),
      headers: { "Content-Type": "image/png" },
    });
    expect(upload.status).toBe(200);

    const read = await application.request(`/files/${key}`);
    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toBe("image/png");
    expect(read.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(read.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(png(64));
  });

  test("refuses an upload without its link's signature, and answers an unknown or outside key as not found", async () => {
    const key = `blobs/${crypto.randomUUID()}/avatar.png`;
    const unsigned = await application.request(`/files/${key}?size=64&type=image%2Fpng&expires=9999999999`, {
      method: "PUT",
      body: png(64),
      headers: { "Content-Type": "image/png" },
    });
    expect(unsigned.status).toBe(400);

    expect((await application.request(`/files/${key}`)).status).toBe(404);
    expect((await application.request("/files/blobs/%2e%2e/%2e%2e/package.json")).status).toBe(404);
    expect((await application.request("/files/../package.json")).status).not.toBe(200);
  });

  test("answers nothing with S3, whose bucket serves and takes the files", async () => {
    ObjectStorage.setForTest(fakeStorage());
    expect((await application.request(`/files/blobs/${crypto.randomUUID()}/avatar.png`)).status).toBe(404);
  });
});
