import { describe, expect, test } from "bun:test";

import { createSignedInUser, expectStatus, guestApi } from "@/tests/api.ts";
import { createExport } from "@/tests/helpers.ts";

describe("exports", () => {
  test("downloads the user's export as an attachment", async () => {
    const { user, api } = await createSignedInUser("exporter");
    const { id } = await createExport(user.id);

    const response = await api.api.exports[":id"].download.$get({ param: { id } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="test-sheet.pdf"');
    expect(await response.text()).toBe("fake pdf content");
  });

  test("returns 404 for another user's export", async () => {
    const { user } = await createSignedInUser("owner");
    const { id } = await createExport(user.id);
    const { api: other } = await createSignedInUser("other");
    await expectStatus(other.api.exports[":id"].download.$get({ param: { id } }), 404);
  });

  test("requires a session", async () => {
    const { user } = await createSignedInUser("owner");
    const { id } = await createExport(user.id);
    await expectStatus(guestApi.api.exports[":id"].download.$get({ param: { id } }), 401);
  });
});
