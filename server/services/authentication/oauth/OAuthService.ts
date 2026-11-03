import type { Db } from "@/drizzle/database.ts";
import { hashApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { readIssuer, readResource, toScope } from "@/server/oauthIssuer.ts";
import { generateOAuthToken } from "@/server/oauthTokens.ts";
import { OAuthAuthorizations, OAuthGrants, OAuthTokens } from "@/server/repositories/index.ts";
import { withAccountWrite, withSignInWrite } from "@/server/services/writes/index.ts";
import type { Session } from "@/shared/relations.ts";

import { findClient, isRedirectAllowed } from "./clientMetadata.ts";
import { OAuthError } from "./OAuthError.ts";

/** What an app asks `/oauth/authorize` for, each as it sends it: the endpoint checks them here. */
export interface AuthorizeQuery {
  client_id?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  redirect_uri?: string;
  resource?: string;
  response_type?: string;
  scope?: string;
  state?: string;
}

/** What an app sends `/oauth/token`, each as it sends it: an authorization's code, or a refresh token. */
export interface TokenForm {
  client_id?: string;
  code?: string;
  code_verifier?: string;
  grant_type?: string;
  redirect_uri?: string;
  refresh_token?: string;
  resource?: string;
}

/** How long an access token signs in: an app refreshes it before then. */
const ACCESS_LIFETIME_MS = 60 * 60 * 1000;

/** How long a sign-in waits for its user's answer on the consent page. */
const AUTHORIZATION_LIFETIME_MS = 10 * 60 * 1000;

/** How long an answered sign-in's code waits for its app's exchange. */
const CODE_LIFETIME_MS = 5 * 60 * 1000;

/** The host names a redirect URI to the user's own device names (a native app's, Claude Code's). */
const DEVICE_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** What a sign-in that can't be answered (expired, answered, another's) is refused with. */
const GONE_MESSAGE = "This sign-in expired or was answered: start it again from the app";

/** How long a refresh token waits for its use: an app used once a month stays connected. */
const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long after a refresh token's use another use of it is a retry, refused but harmless: past it, the token was
 * stolen or replayed, and its use disconnects the app.
 */
const REUSE_GRACE_MS = 30 * 1000;

/**
 * The consent page, showing why a sign-in can't start (an app the server can't name, or a redirect URI its document
 * doesn't list), by a code the page words: never text of the app's own.
 */
function toConsentError(error: "unknown_app" | "unlisted_redirect") {
  return `/oauth/consent?error=${error}`;
}

/** An app's redirect URI with the answer's parameters, and the issuer's (`iss`), which the app checks it by. */
function toRedirect(redirectUri: string, parameters: Record<string, string | null | undefined>) {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(parameters)) if (value) url.searchParams.set(name, value);
  url.searchParams.set("iss", readIssuer());
  return url.href;
}

/** Whether a PKCE verifier is the one a challenge was made of: its SHA-256, base64url (S256). */
function verifiesChallenge(verifier: string, challenge: string) {
  return new Bun.CryptoHasher("sha256").update(verifier).digest("base64url") === challenge;
}

/**
 * OAuth sign-in to the MCP server: an app (Claude, ChatGPT) asks, its user allows it on the consent page, and it gets
 * tokens that act as the user on `/mcp` alone, reading alone when the user chose so. What Settings lists as the user's
 * connected apps, and disconnects. A sign-in's writes before its user answers lock no account (`withSignInWrite`);
 * every one after is its user's account's (`withAccountWrite`).
 */
class OAuthService {
  /** An authorization's code exchanged, once, for a new grant's tokens: the PKCE verifier proving it's the app's. */
  private async exchangeCode({ client_id, code, code_verifier, redirect_uri }: TokenForm) {
    if (!code || !code_verifier || !client_id || !redirect_uri)
      throw new OAuthError("invalid_request", "code, code_verifier, client_id and redirect_uri are required");
    const refused = new OAuthError("invalid_grant", "The code is wrong, expired or used");
    const authorization = await OAuthAuthorizations.findOne(db, { codeDigest: hashApiKeyToken(code) });
    if (!authorization?.userId || authorization.readOnly === null) throw refused;
    const matches = authorization.clientId === client_id && authorization.redirectUri === redirect_uri;
    if (!matches || !verifiesChallenge(code_verifier, authorization.codeChallenge)) throw refused;
    const { readOnly, userId } = authorization;
    return await withAccountWrite(userId, async (tx) => {
      // Exchanged once: a second exchange finds it gone
      const [exchanged] = await OAuthAuthorizations.delete(tx, { id: authorization.id });
      if (!exchanged) throw refused;
      const grant = await OAuthGrants.create(tx, { clientId: client_id, readOnly, userId });
      if (!grant) throw new Error("Failed to connect the app");
      return await this.issueTokens(tx, grant.id, readOnly);
    });
  }

  /** A sign-in not expired nor answered yet, refused (404) otherwise. */
  private async findUnanswered(authorizationId: string) {
    const authorization = await OAuthAuthorizations.findOne(db, { id: authorizationId });
    if (!authorization || authorization.codeDigest) throw new NotFoundError(GONE_MESSAGE);
    return authorization;
  }

  /** A grant's new access token and refresh token, as the token endpoint answers them. */
  private async issueTokens(tx: Db, grantId: string, readOnly: boolean) {
    const access = generateOAuthToken("access");
    const refresh = generateOAuthToken("refresh");
    await OAuthTokens.create(tx, {
      accessDigest: access.digest,
      accessExpiresAt: new Date(Date.now() + ACCESS_LIFETIME_MS).toISOString(),
      grantId,
      refreshDigest: refresh.digest,
      refreshExpiresAt: new Date(Date.now() + REFRESH_LIFETIME_MS).toISOString(),
    });
    return {
      access_token: access.token,
      expires_in: ACCESS_LIFETIME_MS / 1000,
      refresh_token: refresh.token,
      scope: toScope(readOnly),
      token_type: "Bearer",
    };
  }

  /**
   * A refresh token exchanged, once, for its grant's new pair. Used a second time, it was stolen or replayed: the app is
   * disconnected, its every token with it.
   */
  private async refreshTokens({ client_id, refresh_token }: TokenForm) {
    if (!refresh_token || !client_id)
      throw new OAuthError("invalid_request", "refresh_token and client_id are required");
    const tokens = await OAuthTokens.findOne(db, { refreshDigest: hashApiKeyToken(refresh_token) });
    const refused = new OAuthError("invalid_grant", "The refresh token is wrong, expired or used");
    if (!tokens || tokens.clientId !== client_id || tokens.userExpiresAt) throw refused;
    if (new Date(tokens.refreshExpiresAt).getTime() <= Date.now()) throw refused;
    // Used again just now: a retry that lost its answer, or two refreshes at once. Refused, the app kept on its new pair
    const usedAt = tokens.refreshedAt && new Date(tokens.refreshedAt).getTime();
    if (usedAt && Date.now() - usedAt < REUSE_GRACE_MS) throw refused;
    // Answered, not thrown, when it's used again: the transaction keeps the app's disconnection, which a throw undoes
    const issued = await withAccountWrite(tokens.userId, async (tx) => {
      if (usedAt) {
        await OAuthGrants.delete(tx, { id: tokens.grantId });
        return undefined;
      }
      // Of two refreshes at once, the first to mark it gets the new pair; the other waits on it, then marks nothing
      if (!(await OAuthTokens.markRefreshed(tx, { id: tokens.id }))) return undefined;
      return await this.issueTokens(tx, tokens.grantId, tokens.readOnly);
    });
    if (!issued) throw refused;
    return issued;
  }

  /** Allows a sign-in, reading alone or not: its code, sent back to the app with its state. */
  async acceptAuthorization(session: Session, authorizationId: string, readOnly: boolean) {
    const { digest, token } = generateOAuthToken("code");
    const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS).toISOString();
    const values = { codeDigest: digest, expiresAt, readOnly, userId: session.userId };
    const authorization = await withAccountWrite(
      session.userId,
      async (tx) => await OAuthAuthorizations.update(tx, values, { id: authorizationId }),
    );
    if (!authorization) throw new NotFoundError(GONE_MESSAGE);
    return { redirectTo: toRedirect(authorization.redirectUri, { code: token, state: authorization.state }) };
  }

  /**
   * What the token endpoint answers: an access token, its refresh token and its scope, for an authorization's code
   * (`authorization_code`) or a refresh token (`refresh_token`), which each work once.
   */
  async createTokens(form: TokenForm) {
    if (form.resource && form.resource !== readResource())
      throw new OAuthError("invalid_target", `The resource is ${readResource()}`);
    if (form.grant_type === "authorization_code") return await this.exchangeCode(form);
    if (form.grant_type === "refresh_token") return await this.refreshTokens(form);
    throw new OAuthError("unsupported_grant_type", "The grant is an authorization code or a refresh token");
  }

  /** Disconnects one of the user's apps: its tokens sign in nothing from then on. */
  async deleteConnectedApp(session: Session, grantId: string) {
    const [grant] = await withAccountWrite(
      session.userId,
      async (tx) => await OAuthGrants.delete(tx, { id: grantId, userId: session.userId }),
    );
    if (!grant) throw new NotFoundError("Connected app not found");
    return grant;
  }

  /** A sign-in its user answers on the consent page: which app asks, where it sends them back, what it asks for. */
  async getAuthorization(_session: Session, authorizationId: string) {
    const authorization = await this.findUnanswered(authorizationId);
    const redirect = new URL(authorization.redirectUri);
    return {
      client: { name: authorization.clientName, url: authorization.clientId },
      id: authorization.id,
      readOnlyAsked: authorization.readOnlyAsked,
      redirectHost: redirect.host,
      redirectsToDevice: DEVICE_HOSTS.has(redirect.hostname),
    };
  }

  /** The apps the user connected, the newest first, each with its app's name and its site's host. */
  async getConnectedApps(session: Session) {
    const grants = await OAuthGrants.findMany(db, { userId: session.userId });
    return grants.map(({ clientId, ...grant }) => ({ ...grant, clientHost: new URL(clientId).host }));
  }

  /** Turns a sign-in down: the app is told so (`access_denied`). */
  async rejectAuthorization(session: Session, authorizationId: string) {
    const authorization = await this.findUnanswered(authorizationId);
    await withAccountWrite(session.userId, async (tx) => await OAuthAuthorizations.delete(tx, { id: authorizationId }));
    return {
      redirectTo: toRedirect(authorization.redirectUri, { error: "access_denied", state: authorization.state }),
    };
  }

  /** Revokes a token, either of a pair: the app it was given to is disconnected (RFC 7009 answers nothing either way). */
  async revokeToken(token: string | undefined, clientId: string | undefined) {
    if (!token) return;
    const digest = hashApiKeyToken(token);
    const tokens =
      (await OAuthTokens.findOne(db, { refreshDigest: digest })) ??
      (await OAuthTokens.findOne(db, { accessDigest: digest }));
    if (!tokens || tokens.clientId !== clientId) return;
    await withAccountWrite(tokens.userId, async (tx) => await OAuthGrants.delete(tx, { id: tokens.grantId }));
  }

  /**
   * Starts a sign-in an app asks for: the consent page's address, or the app's own with its refusal when what it asks
   * is wrong. An app the server can't name, or a redirect URI its document doesn't list, sends the user nowhere but the
   * consent page, which says why.
   */
  async startAuthorization(query: AuthorizeQuery) {
    const client = query.client_id ? await findClient(query.client_id) : undefined;
    if (!client) return toConsentError("unknown_app");
    const redirectUri = query.redirect_uri;
    if (!redirectUri || !isRedirectAllowed(client.redirectUris, redirectUri))
      return toConsentError("unlisted_redirect");
    const refuse = (error: string, description: string) =>
      toRedirect(redirectUri, { error, error_description: description, state: query.state });
    if (query.response_type !== "code") return refuse("unsupported_response_type", "Only the code flow is supported");
    const codeChallenge = query.code_challenge;
    if (!codeChallenge || query.code_challenge_method !== "S256")
      return refuse("invalid_request", "PKCE with S256 is required");
    if (query.resource && query.resource !== readResource())
      return refuse("invalid_target", `The resource is ${readResource()}`);
    const scopes = query.scope?.split(" ") ?? [];
    const readOnlyAsked = scopes.includes("read") && !scopes.includes("write");
    const expiresAt = new Date(Date.now() + AUTHORIZATION_LIFETIME_MS).toISOString();
    const values = {
      clientId: client.id,
      codeChallenge,
      expiresAt,
      readOnlyAsked,
      redirectUri,
      state: query.state ?? null,
    };
    const authorization = await withSignInWrite(async (tx) => await OAuthAuthorizations.create(tx, values));
    if (!authorization) throw new Error("Failed to start the sign-in");
    return `/oauth/consent?authorization=${authorization.id}`;
  }
}

export default new OAuthService();
