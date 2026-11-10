/**
 * A stand-in for the object storage, for the end-to-end run: it keeps what the server puts in memory, and answers its
 * reads and deletes, as S3 would, its signatures unchecked. The run's server stores a campaign document's file here
 * and hands its bytes on from here. Usage: `bun tests/fixtures/storageServer.ts <port>`.
 */

import process from "node:process";

/** What it holds: each object's bytes and type, by its path (its bucket, then its key). */
const objects = new Map<string, { body: Uint8Array<ArrayBuffer>; type: string }>();

const port = Number(process.argv[2]);

/** S3's answer for an object that isn't there. */
function answerMissing() {
  return new Response("<Error><Code>NoSuchKey</Code></Error>", {
    status: 404,
    headers: { "Content-Type": "application/xml" },
  });
}

Bun.serve({
  hostname: "::",
  port,
  maxRequestBodySize: 64 * 1024 * 1024,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return new Response("ok");
    const object = objects.get(pathname);
    switch (request.method) {
      case "PUT": {
        const type = request.headers.get("content-type") ?? "application/octet-stream";
        objects.set(pathname, { body: new Uint8Array(await request.arrayBuffer()), type });
        return new Response(null, { headers: { ETag: '"stored"' } });
      }
      case "GET":
        return object ? new Response(object.body, { headers: { "Content-Type": object.type } }) : answerMissing();
      case "HEAD":
        return object
          ? new Response(null, { headers: { "Content-Length": String(object.body.byteLength), ETag: '"stored"' } })
          : new Response(null, { status: 404 });
      case "DELETE":
        objects.delete(pathname);
        return new Response(null, { status: 204 });
      default:
        return new Response(null, { status: 405 });
    }
  },
});
