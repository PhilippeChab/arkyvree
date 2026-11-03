import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { oauthAuthorizationsInAccount, oauthTokensInAccount } from "@/drizzle/schema.ts";
import { hashApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db, withWrite } from "@/server/database/index.ts";
import { readIssuer, readResource } from "@/server/oauthIssuer.ts";
import { application } from "@/server/routers/application.ts";
import { signOutEverywhere } from "@/server/services/authentication/accounts.ts";
import { createSignedInUser, expectOk, expectStatus, signedInApi } from "@/tests/support/api.ts";
import { apiWithKey } from "@/tests/support/clients.ts";
import { connectMcp } from "@/tests/support/mcp.ts";
import { createOAuthClient, createPkce, postOAuthForm, startSignIn, TEST_REDIRECTS } from "@/tests/support/oauth.ts";
import { createSignedInUser as createDemoUser } from "@/tests/support/users.ts";

/** What the token endpoint answers a sign-in or a refresh. */
interface Tokens {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

/** A user's app connected, reading alone or not: its sign-in allowed on the consent page and its code exchanged. */
async function connectApp({ readOnly = false, redirectUri = TEST_REDIRECTS.site } = {}) {
  const started = await startAppSignIn({ redirectUri });
  const authorization = started.api.auth.oauth.authorizations[":id"];
  const { redirectTo } = await expectOk(authorization.approve.$post({ json: { readOnly }, param: { id: started.id } }));
  const code = new URL(redirectTo).searchParams.get("code") ?? "";
  const exchange = {
    client_id: started.client.id,
    code,
    code_verifier: started.pkce.verifier,
    redirect_uri: redirectUri,
  };
  const response = await expectStatus(
    postOAuthForm("/oauth/token", { ...exchange, grant_type: "authorization_code" }),
    200,
  );
  return { ...started, code, exchange, redirectTo, tokens: (await response.json()) as Tokens };
}

/** The tools an MCP client signed in with `token` is offered, by name. */
async function listToolNames(token: string) {
  const { tools } = await (await connectMcp(token)).listTools();
  return tools.map(({ name }) => name).sort();
}

/** A user's sign-in of a new test app started, its consent page's authorization, as Claude starts one. */
async function startAppSignIn({ redirectUri = TEST_REDIRECTS.site, scope = "read write" } = {}) {
  const { api, user } = await createSignedInUser();
  const client = await createOAuthClient();
  const pkce = createPkce();
  const consent = await startSignIn({
    client_id: client.id,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    resource: readResource(),
    response_type: "code",
    scope,
    state: "app-state",
  });
  expect(consent.pathname).toBe("/oauth/consent");
  const id = consent.searchParams.get("authorization") ?? "";
  return { api, client, id, pkce, redirectUri, user };
}

describe("oauth", () => {
  test("names where an app signs in: the MCP server's metadata, and its authorization server's", async () => {
    const resource = await (
      await expectStatus(application.request("/.well-known/oauth-protected-resource/mcp"), 200)
    ).json();
    expect(resource).toMatchObject({ authorization_servers: [readIssuer()], resource: readResource() });
    const server = await (
      await expectStatus(application.request("/.well-known/oauth-authorization-server"), 200)
    ).json();
    expect(server).toMatchObject({
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ["S256"],
      issuer: readIssuer(),
      token_endpoint: `${readIssuer()}/oauth/token`,
      token_endpoint_auth_methods_supported: ["none"],
    });
    const refused = await expectStatus(application.request("/mcp", { method: "POST" }), 401);
    expect(refused.headers.get("www-authenticate")).toContain(
      `resource_metadata="${readIssuer()}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  test("connects an app its user allows: its code sent back with its state, exchanged for tokens to /mcp alone", async () => {
    const { client, redirectTo, tokens } = await connectApp();
    const back = new URL(redirectTo);
    expect(`${back.origin}${back.pathname}`).toBe(TEST_REDIRECTS.site);
    expect(back.searchParams.get("state")).toBe("app-state");
    expect(back.searchParams.get("iss")).toBe(readIssuer());
    expect(tokens).toMatchObject({ expires_in: 3600, scope: "read write", token_type: "Bearer" });
    expect(await listToolNames(tokens.access_token)).toContain("write");
    // A token is the MCP server's: the public API refuses it
    await expectStatus(apiWithKey(tokens.access_token).v1.characters.$get({ query: {} }), 401);
    expect(client.name).toBe("Test App");
  });

  test("connects an app to read alone when its user chooses so: no tool that changes", async () => {
    const { tokens } = await connectApp({ readOnly: true });
    expect(tokens.scope).toBe("read");
    expect(await listToolNames(tokens.access_token)).toEqual(["describe_route", "read", "read_sheet", "search_routes"]);
  });

  test("shows the consent page the app and where it sends its user back, a device's port its own", async () => {
    const { api, client, id } = await startAppSignIn({ redirectUri: "http://localhost:43123/callback", scope: "read" });
    const authorization = await expectOk(api.auth.oauth.authorizations[":id"].$get({ param: { id } }));
    expect(authorization).toMatchObject({
      client: { name: client.name, url: client.id },
      readOnlyAsked: true,
      redirectHost: "localhost:43123",
      redirectsToDevice: true,
    });
  });

  test("exchanges a code once, with its verifier and its redirect URI alone", async () => {
    const started = await connectApp();
    const { exchange } = started;
    const again = await expectStatus(
      postOAuthForm("/oauth/token", { ...exchange, grant_type: "authorization_code" }),
      400,
    );
    expect(await again.json()).toMatchObject({ error: "invalid_grant" });

    const other = await startAppSignIn();
    const authorization = other.api.auth.oauth.authorizations[":id"];
    const { redirectTo } = await expectOk(
      authorization.approve.$post({ json: { readOnly: false }, param: { id: other.id } }),
    );
    const code = new URL(redirectTo).searchParams.get("code") ?? "";
    const form = {
      client_id: other.client.id,
      code,
      grant_type: "authorization_code",
      redirect_uri: other.redirectUri,
    };
    for (const wrong of [
      { code_verifier: createPkce().verifier },
      { code_verifier: other.pkce.verifier, redirect_uri: TEST_REDIRECTS.device },
    ]) {
      expect(await (await postOAuthForm("/oauth/token", { ...form, ...wrong })).json()).toMatchObject({
        error: "invalid_grant",
      });
    }
  });

  test("replaces a pair with its refresh token, once: used again just now, refused; later, the app disconnected", async () => {
    const { client, tokens } = await connectApp();
    const refresh = { client_id: client.id, grant_type: "refresh_token", refresh_token: tokens.refresh_token };
    const replaced = (await (await expectStatus(postOAuthForm("/oauth/token", refresh), 200)).json()) as Tokens;
    expect(replaced.refresh_token).not.toBe(tokens.refresh_token);
    expect(await listToolNames(replaced.access_token)).toContain("read");
    const signedIn = { headers: { authorization: `Bearer ${replaced.access_token}` }, method: "POST" };

    // A retry that lost its answer: refused, the app kept on its new pair
    const retried = await expectStatus(postOAuthForm("/oauth/token", refresh), 400);
    expect(await retried.json()).toMatchObject({ error: "invalid_grant" });
    expect(await listToolNames(replaced.access_token)).toContain("read");

    // Used again a minute later: stolen or replayed, the app is disconnected
    const aMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    await db
      .update(oauthTokensInAccount)
      .set({ refreshedAt: aMinuteAgo })
      .where(eq(oauthTokensInAccount.refreshDigest, hashApiKeyToken(tokens.refresh_token)));
    const replayed = await expectStatus(postOAuthForm("/oauth/token", refresh), 400);
    expect(await replayed.json()).toMatchObject({ error: "invalid_grant" });
    await expectStatus(application.request("/mcp", signedIn), 401);
  });

  test("allows no sign-in once it expired, and leaves no code a user signed out everywhere allowed", async () => {
    const expired = await startAppSignIn();
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await db
      .update(oauthAuthorizationsInAccount)
      .set({ expiresAt: anHourAgo })
      .where(eq(oauthAuthorizationsInAccount.id, expired.id));
    const late = expired.api.auth.oauth.authorizations[":id"].approve.$post({
      json: { readOnly: false },
      param: { id: expired.id },
    });
    await expectStatus(late, 404);

    const allowed = await startAppSignIn();
    const authorization = allowed.api.auth.oauth.authorizations[":id"];
    const { redirectTo } = await expectOk(
      authorization.approve.$post({ json: { readOnly: false }, param: { id: allowed.id } }),
    );
    await withWrite(async (tx) => await signOutEverywhere(tx, allowed.user.id));
    const form = {
      client_id: allowed.client.id,
      code: new URL(redirectTo).searchParams.get("code") ?? "",
      code_verifier: allowed.pkce.verifier,
      grant_type: "authorization_code",
      redirect_uri: allowed.redirectUri,
    };
    expect(await (await postOAuthForm("/oauth/token", form)).json()).toMatchObject({ error: "invalid_grant" });
  });

  test("revokes an app's token for its own app alone", async () => {
    const { api, tokens } = await connectApp();
    const other = await createOAuthClient("Other App");
    await expectStatus(postOAuthForm("/oauth/revoke", { client_id: other.id, token: tokens.refresh_token }), 200);
    expect(await expectOk(api.auth["connected-apps"].$get())).toHaveLength(1);
  });

  test("sends a user back to the consent page, never to an address the app doesn't list, and an app's error to it", async () => {
    const client = await createOAuthClient();
    const pkce = createPkce();
    const asked = {
      client_id: client.id,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      response_type: "code",
      state: "s",
    };
    const unlisted = await startSignIn({ ...asked, redirect_uri: "https://elsewhere.example/callback" });
    expect(unlisted.pathname).toBe("/oauth/consent");
    expect(unlisted.searchParams.get("error")).toBe("unlisted_redirect");
    const unknown = await startSignIn({
      ...asked,
      client_id: "https://unknown.invalid/client.json",
      redirect_uri: TEST_REDIRECTS.site,
    });
    expect(unknown.searchParams.get("error")).toBe("unknown_app");

    const noPkce = await startSignIn({ ...asked, code_challenge_method: "plain", redirect_uri: TEST_REDIRECTS.site });
    expect(`${noPkce.origin}${noPkce.pathname}`).toBe(TEST_REDIRECTS.site);
    expect(Object.fromEntries(noPkce.searchParams)).toMatchObject({
      error: "invalid_request",
      iss: readIssuer(),
      state: "s",
    });
  });

  test("tells the app its user turned it down, and the sign-in is gone", async () => {
    const { api, id } = await startAppSignIn();
    const authorization = api.auth.oauth.authorizations[":id"];
    const { redirectTo } = await expectOk(authorization.deny.$post({ param: { id } }));
    expect(new URL(redirectTo).searchParams.get("error")).toBe("access_denied");
    await expectStatus(authorization.$get({ param: { id } }), 404);
  });

  test("lists a user's connected apps, and disconnects one, a revoked token's, or all of them signed out everywhere", async () => {
    const { api, client, tokens } = await connectApp({ readOnly: true });
    const [app] = await expectOk(api.auth["connected-apps"].$get());
    expect(app).toMatchObject({ clientHost: new URL(client.id).host, clientName: client.name, readOnly: true });
    await expectOk(api.auth["connected-apps"][":id"].$delete({ param: { id: app?.id ?? "" } }));
    expect(await expectOk(api.auth["connected-apps"].$get())).toEqual([]);
    const signedOut = { headers: { authorization: `Bearer ${tokens.access_token}` }, method: "POST" };
    await expectStatus(application.request("/mcp", signedOut), 401);

    const revoked = await connectApp();
    await expectStatus(
      postOAuthForm("/oauth/revoke", { client_id: revoked.client.id, token: revoked.tokens.refresh_token }),
      200,
    );
    expect(await expectOk(revoked.api.auth["connected-apps"].$get())).toEqual([]);

    // Signed out everywhere, its sessions with it: a new one lists no app, and the app's token signs in nothing
    const everywhere = await connectApp();
    await withWrite(async (tx) => await signOutEverywhere(tx, everywhere.user.id));
    expect(await expectOk((await signedInApi(everywhere.user.id)).auth["connected-apps"].$get())).toEqual([]);
    const after = { headers: { authorization: `Bearer ${everywhere.tokens.access_token}` }, method: "POST" };
    await expectStatus(application.request("/mcp", after), 401);
  });

  test("refuses a demo account the consent page", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { user } = await createDemoUser({ expiresAt, prefix: "demo" });
    const api = await signedInApi(user.id);
    const { id } = await startAppSignIn();
    await expectStatus(api.auth.oauth.authorizations[":id"].$get({ param: { id } }), 403);
  });
});
