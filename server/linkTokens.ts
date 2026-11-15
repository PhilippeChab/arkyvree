/**
 * A link's token, which an admin hands someone once: an invite link's (`/sign-up?invite=arki_…`) or a password reset
 * link's (`/reset-password-link?token=arkr_…`). The database keeps its SHA-256 digest alone (`hashApiKeyToken`), as an
 * API key's.
 */

import { hashApiKeyToken } from "./apiKeyTokens.ts";

/** What each kind of link's token starts with, so a leaked one is recognized as Arkyvree's, and as which. */
const TOKEN_STARTS = { invite: "arki_", passwordReset: "arkr_" } as const;

/** A new link's token (`kind`: an invite link's, a password reset link's), shown once, with its digest. */
export function generateLinkToken(kind: keyof typeof TOKEN_STARTS) {
  const token = TOKEN_STARTS[kind] + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { digest: hashApiKeyToken(token), token };
}

/** A token's digest, which its link is looked up by. */
export function hashLinkToken(token: string) {
  return hashApiKeyToken(token);
}
