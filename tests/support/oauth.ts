import { oauthClientsInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { application } from "@/server/routers/application.ts";

import { expectStatus } from "./api.ts";
import { uniqueId } from "./seed.ts";

/** A test app's redirect URIs: a site's, and a loopback one whose port the app picks (Claude Code's). */
export const TEST_REDIRECTS = { device: "http://localhost/callback", site: "https://app.example/callback" };

/** A PKCE verifier and its S256 challenge, as an app makes them. */
export function createPkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
  return { challenge, verifier };
}

/**
 * A test app, as the server keeps a fetched Client ID Metadata Document: its id the document's URL, kept as fetched now,
 * so no test fetches it.
 */
export async function createOAuthClient(name = "Test App") {
  const id = `https://app-${uniqueId()}.example/oauth/client.json`;
  const values = { fetchedAt: new Date().toISOString(), id, name, redirectUris: Object.values(TEST_REDIRECTS) };
  await db.insert(oauthClientsInAccount).values(values);
  return values;
}

/** An app's form posted to an OAuth endpoint (`/oauth/token`, `/oauth/revoke`), as its server posts it. */
export async function postOAuthForm(path: string, form: Record<string, string>) {
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  return await application.request(path, { body: new URLSearchParams(form).toString(), headers, method: "POST" });
}

/** An app's sign-in started (`/oauth/authorize`), answered with the address it sends the browser to. */
export async function startSignIn(parameters: Record<string, string>) {
  const response = await expectStatus(application.request(`/oauth/authorize?${new URLSearchParams(parameters)}`), 302);
  return new URL(response.headers.get("location") ?? "", "http://localhost");
}
