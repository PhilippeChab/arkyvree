import { application } from "@/server/routers/application.ts";
import { setStorageForTest, type StorageBackend } from "@/server/storage/s3.ts";
import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

describe("attachments router", () => {
  const api = testClient(application);
  const sessionCookie = "session-id=00000000-0000-4000-8000-000000000123";
  const seedUserId = "00000000-0000-4000-8000-000000000456";

  beforeEach(() => {
    const fake: StorageBackend = {
      presignPut: () => "https://fake.example.com/key?sig=fake",
      publicUrl: (k) => `https://fake.example.com/${k}`,
      async deleteObject() {},
      async objectExists() {
        return true;
      },
      async objectStats() {
        return { size: 1024, etag: "fake" };
      },
    };
    setStorageForTest(fake);
  });

  afterEach(() => setStorageForTest(null));

  test("rejects unauthenticated requests", async () => {
    const response = await api.api.attachments.$get({
      query: { recordType: "User", recordId: seedUserId, name: "avatar" },
    });
    expect(response.status).toBe(401);
  });

  test("GET returns null when no attachment exists", async () => {
    const response = await api.api.attachments.$get(
      { query: { recordType: "User", recordId: seedUserId, name: "avatar" } },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result).toBeNull();
  });

  test("GET rejects malformed UUID with 400", async () => {
    const response = await api.api.attachments.$get(
      { query: { recordType: "User", recordId: "not-a-uuid", name: "avatar" } },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.status).toBe(400);
  });

  test("POST direct-uploads returns signedId + presignedUrl for the owner", async () => {
    const response = await api.api.attachments["direct-uploads"].$post(
      {
        json: {
          recordType: "User",
          recordId: seedUserId,
          name: "avatar",
          filename: "me.png",
          contentType: "image/png",
          byteSize: 1024,
        },
      },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.ok).toBe(true);
    const result = await response.json() as {
      signedId: string;
      presignedUrl: string;
      headers: Record<string, string>;
    };
    expect(result.signedId).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(result.presignedUrl).toContain("https://fake.example.com");
    expect(result.headers["Content-Type"]).toBe("image/png");
  });

  test("POST direct-uploads is forbidden for non-owners", async () => {
    const otherUserId = "10000000-0000-4000-8000-000000000789";
    const response = await api.api.attachments["direct-uploads"].$post(
      {
        json: {
          recordType: "User",
          recordId: otherUserId,
          name: "avatar",
          filename: "me.png",
          contentType: "image/png",
          byteSize: 1024,
        },
      },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.status).toBe(403);
  });

  test("POST attach round-trip: presign → attach yields the same blob", async () => {
    const presign = await api.api.attachments["direct-uploads"].$post(
      {
        json: {
          recordType: "User",
          recordId: seedUserId,
          name: "avatar",
          filename: "me.png",
          contentType: "image/png",
          byteSize: 1024,
        },
      },
      { headers: { cookie: sessionCookie } },
    );
    const { signedId } = await presign.json() as { signedId: string };

    const attached = await api.api.attachments[":signedId"].attach.$post(
      { param: { signedId } },
      { headers: { cookie: sessionCookie } },
    );
    expect(attached.ok).toBe(true);
    const result = await attached.json() as {
      attachment: { id: string; name: string };
      blob: { filename: string };
    };
    expect(result.attachment.name).toBe("avatar");
    expect(result.blob.filename).toBe("me.png");
  });

  test("DELETE returns 404 for unknown attachment id", async () => {
    const response = await api.api.attachments[":id"].$delete(
      { param: { id: "00000000-0000-4000-8000-000000000999" } },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.status).toBe(404);
  });
});
