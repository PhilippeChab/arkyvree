import { Hono } from "hono";

import { NotFoundError } from "@/server/errors/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";

/** The disk storage, which these routes are for: with S3, its bucket serves and takes the files, and they're not found. */
function getDisk() {
  const disk = ObjectStorage.findDisk();
  if (!disk) throw new NotFoundError("File not found");
  return disk;
}

/** A stored file's key, from its path under the files' route (`/files/<key>`). */
function keyOf(path: string) {
  return path.replace(/^\/files\//, "");
}

/**
 * The files an instance without S3 keeps on its disk: a file, to whoever has its key, as a public bucket serves it (its
 * key holds its blob's random id), never changing, so kept as long as a cache will; and a browser's upload, to the link
 * the server signed for it (`presignPut`), which no session signs.
 */
export default new Hono()
  .get("/*", async (c) => {
    const file = await getDisk().serve(keyOf(c.req.path));
    return c.body(file.stream, 200, {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      // Opened on its own, a file runs nothing on the app's origin; a PDF's viewer, which a sandbox would stop, runs none
      ...(file.contentType !== "application/pdf" && { "Content-Security-Policy": "sandbox" }),
    });
  })
  .put("/*", async (c) => {
    await AttachmentsService.createDiskUpload(keyOf(c.req.path), c.req.query(), c.req.raw);
    return c.body(null, 200);
  });
