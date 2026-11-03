/**
 * The MCP server's OAuth tokens: what an app sends (`Authorization: Bearer arka_…`), and what the database keeps of
 * them, their SHA-256 digest (`hashApiKeyToken`), as an API key's.
 */

import { hashApiKeyToken } from "./apiKeyTokens.ts";

/** How each kind of token starts: an access token, the refresh token that replaces it, an authorization's code. */
export const OAUTH_TOKEN_STARTS = { access: "arka_", code: "arkc_", refresh: "arkr_" } as const;

/** A new token of a kind, shown once, with its digest, which the database keeps. */
export function generateOAuthToken(kind: keyof typeof OAUTH_TOKEN_STARTS) {
  const token =
    OAUTH_TOKEN_STARTS[kind] + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { digest: hashApiKeyToken(token), token };
}
