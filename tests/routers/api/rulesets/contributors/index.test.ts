import { db } from "@/server/database/index.ts";
import { Rulesets, Users } from "@/server/repositories/index.ts";
import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { describe, expect, test } from "bun:test";

describe("rulesets contributors", () => {
  const api = testClient<Application>(application);

  // Session IDs from test seed data (database/seeds/users.ts)
  const ownerSessionId = "00000000-0000-4000-8000-000000000123";
  const ownerUserId = "00000000-0000-4000-8000-000000000456";
  const otherSessionId = "10000000-0000-4000-8000-000000000789";
  const otherUserId = "10000000-0000-4000-8000-000000000789";

  async function createTestRuleset(userId: string = ownerUserId) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const rulesets = await Rulesets.create(db, {
      name: `Contrib Test ${uniqueId}`,
      description: "Test ruleset for contributor tests",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId,
      status: "Draft",
    });
    return rulesets[0];
  }

  function ownerHeaders() {
    return { headers: { cookie: `session-id=${ownerSessionId}` } };
  }

  function otherHeaders() {
    return { headers: { cookie: `session-id=${otherSessionId}` } };
  }

  async function getOtherUserEmail(): Promise<string> {
    const user = await Users.findOne(db, { id: otherUserId });
    return user!.emailAddress;
  }

  test("should invite, list, accept, update role, and revoke a contributor", async () => {
    const ruleset = await createTestRuleset();
    const otherEmail = await getOtherUserEmail();

    // Invite
    const inviteResponse = await api.api.rulesets[":id"].contributors.$post(
      { param: { id: ruleset.id }, json: { email: otherEmail, role: "Editor" } },
      ownerHeaders(),
    );
    expect(inviteResponse.status).toBe(201);
    const invite = await inviteResponse.json() as { id: string; role: string; status: string };
    expect(invite.role).toBe("Editor");
    expect(invite.status).toBe("Pending");

    // List contributors
    const listResponse = await api.api.rulesets[":id"].contributors.$get(
      { param: { id: ruleset.id }, query: { limit: "10", page: "1" } },
      ownerHeaders(),
    );
    expect(listResponse.ok).toBe(true);
    const list = await listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.length).toBe(1);

    // Accept invite
    const acceptResponse = await api.api.rulesets.contributors.invites[":id"].accept.$post(
      { param: { id: invite.id } },
      otherHeaders(),
    );
    expect(acceptResponse.ok).toBe(true);
    const accepted = await acceptResponse.json() as { status: string };
    expect(accepted.status).toBe("Active");

    // Update role
    const updateResponse = await api.api.rulesets[":id"].contributors[":contributorId"].$put(
      { param: { id: ruleset.id, contributorId: invite.id }, json: { role: "Viewer" } },
      ownerHeaders(),
    );
    expect(updateResponse.ok).toBe(true);
    const updated = await updateResponse.json() as { role: string };
    expect(updated.role).toBe("Viewer");

    // Revoke
    const revokeResponse = await api.api.rulesets[":id"].contributors[":contributorId"].$delete(
      { param: { id: ruleset.id, contributorId: invite.id } },
      ownerHeaders(),
    );
    expect(revokeResponse.ok).toBe(true);
    const revoked = await revokeResponse.json() as { status: string };
    expect(revoked.status).toBe("Revoked");
  });

  test("should reject an invite", async () => {
    const ruleset = await createTestRuleset();
    const otherEmail = await getOtherUserEmail();

    const inviteResponse = await api.api.rulesets[":id"].contributors.$post(
      { param: { id: ruleset.id }, json: { email: otherEmail, role: "Editor" } },
      ownerHeaders(),
    );
    const invite = await inviteResponse.json() as { id: string };

    const rejectResponse = await api.api.rulesets.contributors.invites[":id"].reject.$post(
      { param: { id: invite.id } },
      otherHeaders(),
    );
    expect(rejectResponse.ok).toBe(true);
    const rejected = await rejectResponse.json() as { status: string };
    expect(rejected.status).toBe("Rejected");
  });

  test("should return 403 when non-owner invites", async () => {
    const ruleset = await createTestRuleset();

    const response = await api.api.rulesets[":id"].contributors.$post(
      { param: { id: ruleset.id }, json: { email: "someone@example.com", role: "Editor" } },
      otherHeaders(),
    );
    expect(response.status).toBe(403);
  });

  test("should return 403 when non-owner/contributor lists", async () => {
    const ruleset = await createTestRuleset();

    const response = await api.api.rulesets[":id"].contributors.$get(
      { param: { id: ruleset.id }, query: { limit: "10", page: "1" } },
      otherHeaders(),
    );
    expect(response.status).toBe(403);
  });

  test("should allow contributor to leave", async () => {
    const ruleset = await createTestRuleset();
    const otherEmail = await getOtherUserEmail();

    // Invite and accept
    const inviteResponse = await api.api.rulesets[":id"].contributors.$post(
      { param: { id: ruleset.id }, json: { email: otherEmail, role: "Editor" } },
      ownerHeaders(),
    );
    const invite = await inviteResponse.json() as { id: string };
    await api.api.rulesets.contributors.invites[":id"].accept.$post(
      { param: { id: invite.id } },
      otherHeaders(),
    );

    // Leave
    const leaveResponse = await api.api.rulesets[":id"].contributors.leave.$post(
      { param: { id: ruleset.id } },
      otherHeaders(),
    );
    expect(leaveResponse.ok).toBe(true);
  });

  test("should return user's pending contributor invites", async () => {
    const ruleset = await createTestRuleset();
    const otherEmail = await getOtherUserEmail();

    await api.api.rulesets[":id"].contributors.$post(
      { param: { id: ruleset.id }, json: { email: otherEmail, role: "Editor" } },
      ownerHeaders(),
    );

    const invitesResponse = await api.api.rulesets.contributors.invites.me.$get(
      {},
      otherHeaders(),
    );
    expect(invitesResponse.ok).toBe(true);
    const invites = await invitesResponse.json() as Array<{ rulesetId: string }>;
    expect(invites.length).toBeGreaterThanOrEqual(1);
    const found = invites.find((i) => i.rulesetId === ruleset.id);
    expect(found).toBeDefined();
  });

  test("should return 401 for unauthenticated requests", async () => {
    const ruleset = await createTestRuleset();

    const response = await api.api.rulesets[":id"].contributors.$get(
      { param: { id: ruleset.id }, query: { limit: "10", page: "1" } },
      { headers: {} },
    );
    expect(response.status).toBe(401);
  });
});
