import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { db } from "@/server/database/index.ts";
import { EmailVerifications, Users } from "@/server/repositories/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("campaigns invites", () => {
  const api = testClient<Application>(application);

  let seedCtx: SeedContext;

  async function getCtx(): Promise<SeedContext> {
    if (!seedCtx) {
      seedCtx = await getSeedContext(db);
    }
    return seedCtx;
  }

  // Helper to create test campaign with invite
  async function createTestCampaignWithInvite(email: string) {
    const ctx = await getCtx();
    const rulesetId = ctx.rulesetId;

    // Create campaign
    const campaignResponse = await api.api.campaigns.$post(
      {
        json: {
          name: `Test Campaign ${Math.random().toString(36).substr(2, 9)}`,
          description: "A test campaign",
          rulesetId,
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      }
    );

    if (!campaignResponse.ok) {
      const error = await campaignResponse.json();
      throw new Error(`Failed to create test campaign: ${error.message}`);
    }

    const { campaign } = await campaignResponse.json();

    // Create player/invite
    const playerResponse = await api.api.campaigns[":id"].players.$post(
      {
        param: { id: campaign.id },
        json: {
          email,
          role: "Player Character" as const,
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      }
    );

    if (!playerResponse.ok) {
      const error = await playerResponse.json();
      throw new Error(`Failed to create player/invite: ${error.message}`);
    }

    const result = await playerResponse.json();
    if (!("invite" in result)) {
      throw new Error("Invite was not created as expected");
    }

    return {
      campaignId: campaign.id,
      inviteId: result.invite!.id,
    };
  }

  test("should get list of campaign invites", async () => {
    const { campaignId } = await createTestCampaignWithInvite("testuser1@example.com");

    const response = await api.api.campaigns[":id"].invites.$get(
      {
        param: { id: campaignId },
        query: { limit: "10", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get campaign invites: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.page).toBe(1);
  });

  test("should get user invites", async () => {
    const response = await api.api.campaigns.invites.me.$get(
      {},
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get user invites: ${error.message}`);
    }

    const invites = await response.json();
    expect(invites).toBeDefined();
    expect(Array.isArray(invites)).toBe(true);
  });

  test("should accept a campaign invite", async () => {
    const { inviteId } = await createTestCampaignWithInvite("testuser1@example.com");

    const response = await api.api.campaigns.invites[":inviteId"].accept.$post(
      {
        param: { inviteId },
      },
      {
        headers: {
          cookie: "session-id=10000000-0000-4000-8000-000000000789",
        },
      });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to accept campaign invite: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.status).toBe("Accepted");
  });

  test("should reject a campaign invite", async () => {
    const { inviteId } = await createTestCampaignWithInvite("testuser2@example.com");

    const response = await api.api.campaigns.invites[":inviteId"].reject.$post(
      {
        param: { inviteId },
      },
      {
        headers: {
          cookie: "session-id=10000000-0000-4000-8000-000000000999",
        },
      });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to reject campaign invite: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.status).toBe("Rejected");
  });

  test("should revoke a campaign invite", async () => {
    const { inviteId } = await createTestCampaignWithInvite("testuser3@example.com");

    const response = await api.api.campaigns.invites[":inviteId"].revoke.$post(
      {
        param: { inviteId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to revoke campaign invite: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.status).toBe("Revoked");
  });

  test("should reject unauthenticated requests", async () => {
    const { campaignId } = await createTestCampaignWithInvite("testuser1@example.com");

    const response = await api.api.campaigns[":id"].invites.$get({
      param: { id: campaignId },
      query: { limit: "10", page: "1" },
    });
    expect(response.status).toBe(401);
  });

  test("should handle non-existent campaign", async () => {
    const response = await api.api.campaigns[":id"].invites.$get(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
        query: { limit: "10", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    expect(response.status).toBe(404);
  });

  test("should create email-only invite and accept after backfill via sign-up", async () => {
    const uniqueEmail = `email-only-${Math.random().toString(36).substr(2, 9)}@example.com`;

    // Create campaign + email-only invite (email doesn't match any user)
    const { inviteId } = await createTestCampaignWithInvite(uniqueEmail);

    // Sign up with that email
    const signUpResponse = await api.auth["sign-up"].$post({
      json: {
        emailAddress: uniqueEmail,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    if (!signUpResponse.ok) {
      const error = await signUpResponse.json();
      throw new Error(`Failed to sign up: ${error.message}`);
    }

    // Verify email — this triggers backfill
    const user = await Users.findOne(db, { emailAddress: uniqueEmail });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });

    const verifyResponse = await api.auth["verify-email"].$post({
      json: {
        emailAddress: uniqueEmail,
        code: verification!.code,
      },
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(`Failed to verify email: ${error.message}`);
    }

    const setCookie = verifyResponse.headers.get("set-cookie");
    const sessionMatch = setCookie?.match(/session-id=([^;]+)/);
    if (!sessionMatch) throw new Error("No session cookie returned from verify-email");
    const sessionCookie = `session-id=${sessionMatch[1]}`;

    // Now accept the invite as the new user
    const acceptResponse = await api.api.campaigns.invites[":inviteId"].accept.$post(
      {
        param: { inviteId },
      },
      {
        headers: {
          cookie: sessionCookie,
        },
      }
    );

    if (!acceptResponse.ok) {
      const error = await acceptResponse.json();
      throw new Error(`Failed to accept invite after backfill: ${error.message}`);
    }

    const result = await acceptResponse.json();
    expect(result.status).toBe("Accepted");
  });

  test("should show email-only invite in user invites after sign-up backfill", async () => {
    const uniqueEmail = `visible-${Math.random().toString(36).substr(2, 9)}@example.com`;

    // Create email-only invite
    await createTestCampaignWithInvite(uniqueEmail);

    // Sign up
    const signUpResponse = await api.auth["sign-up"].$post({
      json: {
        emailAddress: uniqueEmail,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    if (!signUpResponse.ok) {
      const error = await signUpResponse.json();
      throw new Error(`Failed to sign up: ${error.message}`);
    }

    // Verify email — this triggers backfill
    const user = await Users.findOne(db, { emailAddress: uniqueEmail });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });

    const verifyResponse = await api.auth["verify-email"].$post({
      json: {
        emailAddress: uniqueEmail,
        code: verification!.code,
      },
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(`Failed to verify email: ${error.message}`);
    }

    const setCookie = verifyResponse.headers.get("set-cookie");
    const sessionMatch = setCookie?.match(/session-id=([^;]+)/);
    if (!sessionMatch) throw new Error("No session cookie returned from verify-email");
    const sessionCookie = `session-id=${sessionMatch[1]}`;

    // Fetch user invites — should include the backfilled invite
    const invitesResponse = await api.api.campaigns.invites.me.$get(
      {},
      {
        headers: {
          cookie: sessionCookie,
        },
      }
    );

    if (!invitesResponse.ok) {
      const error = await invitesResponse.json();
      throw new Error(`Failed to get user invites: ${error.message}`);
    }

    const invites = await invitesResponse.json();
    expect(invites.length).toBeGreaterThanOrEqual(1);
    expect(invites.some((inv: { status: string }) => inv.status === "Pending")).toBe(true);
  });

  test("should handle non-existent invite actions", async () => {
    const fakeInviteId = "00000000-0000-0000-0000-000000000000";

    const acceptResponse = await api.api.campaigns.invites[":inviteId"].accept.$post(
      {
        param: { inviteId: fakeInviteId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    expect(acceptResponse.status >= 400).toBe(true);

    const rejectResponse = await api.api.campaigns.invites[":inviteId"].reject.$post(
      {
        param: { inviteId: fakeInviteId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    expect(rejectResponse.status >= 400).toBe(true);

    const revokeResponse = await api.api.campaigns.invites[":inviteId"].revoke.$post(
      {
        param: { inviteId: fakeInviteId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      });

    expect(revokeResponse.status >= 400).toBe(true);
  });
});
