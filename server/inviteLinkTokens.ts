/**
 * An invite link's token: what its link carries (`/sign-up?invite=arki_…`), and what the database keeps of it, its
 * SHA-256 digest (`hashApiKeyToken`), as an API key's.
 */

import { hashApiKeyToken } from "./apiKeyTokens.ts";

/** What every invite link's token starts with, so a leaked one is recognized as Arkyvree's. */
const TOKEN_START = "arki_";

/** A new link's token, shown once, with its digest, which the database keeps. */
export function generateInviteLinkToken() {
  const token = TOKEN_START + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { digest: hashApiKeyToken(token), token };
}

/** A token's digest, which its link is looked up by. */
export function hashInviteLinkToken(token: string) {
  return hashApiKeyToken(token);
}
