/** An API key's token: what a caller sends (`Authorization: Bearer ark_…`), and what the database keeps of it. */

/** What every token starts with, so a leaked one is recognized as Arkyvree's. */
const TOKEN_START = "ark_";

/** How much of a token names its key on the settings page: its start and 8 characters of its random part. */
const PREFIX_LENGTH = TOKEN_START.length + 8;

/** A new key's token, shown once, with what the database keeps of it: its start and its digest. */
export function generateApiKeyToken() {
  const token = TOKEN_START + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { digest: hashApiKeyToken(token), prefix: token.slice(0, PREFIX_LENGTH), token };
}

/**
 * A token's SHA-256 digest, hex: what its key is looked up by. A token is 32 random bytes, which a fast digest keeps
 * as safe as a slow one would.
 */
export function hashApiKeyToken(token: string) {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/** The token a request sends, `Authorization: Bearer <token>`, if it sends one. */
export function readApiKeyToken(authorization: string | undefined) {
  return authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
}
