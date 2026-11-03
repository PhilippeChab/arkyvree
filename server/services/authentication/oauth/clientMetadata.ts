/**
 * The apps that sign in to the MCP server, as their Client ID Metadata Documents describe them: a document at the URL
 * that is the app's client id (Claude's, ChatGPT's), fetched once a day at most and kept (`OAuthClients`).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { z } from "zod";

import { db } from "@/server/database/index.ts";
import { OAuthClients } from "@/server/repositories/index.ts";
import { withSignInWrite } from "@/server/services/writes/index.ts";

/**
 * A document as an app publishes it: what the server reads of it. Its authentication at the token endpoint isn't read:
 * the server takes none (`token_endpoint_auth_methods_supported`), so an app that offers more (ChatGPT's
 * `private_key_jwt`) signs in as a public client, its PKCE verifier its proof.
 */
const clientDocument = z.object({
  client_id: z.string(),
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string()).min(1),
});

/** The most a document takes: a client's name and its redirect URIs are a few hundred bytes. */
const DOCUMENT_MAX_BYTES = 5 * 1024;

/** How long a fetch of a document waits: the app waits on the sign-in, which waits on it. */
const FETCH_TIMEOUT_MS = 5000;

/** The host names a loopback redirect URI names, whose port a native app (Claude Code) picks as it signs in. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** The longest name a consent page shows an app by. */
const NAME_MAX_LENGTH = 100;

/**
 * The ranges an address of an app's host must not be in: private, loopback, link-local, shared (CGNAT), multicast and
 * reserved.
 */
const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^(22[4-9]|2[3-5]\d)\./,
];

/** The IPv6 ranges an address must not be in: unspecified, loopback, unique-local, link- and site-local, multicast, NAT64. */
const PRIVATE_V6 = [/^::1?$/, /^f[cd]/, /^fe[89a-f]/, /^ff/, /^64:ff9b:/];

/** How long a fetched document is kept before it's fetched again. */
const REFETCH_AFTER_MS = 24 * 60 * 60 * 1000;

/** Whether a redirect URI is one a sign-in may answer at: an https URL, or an http one to the user's device. */
function isRedirectUri(uri: string) {
  if (!URL.canParse(uri)) return false;
  const url = new URL(uri);
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
}

/**
 * An app's document, fetched from its URL: none when its host isn't public, or it doesn't answer one in time and in
 * `DOCUMENT_MAX_BYTES`. Its host's addresses are checked, then fetched by its name: a host that answers a public address
 * to the check and a private one to the fetch (DNS rebinding) reaches a private address over https alone, whose
 * certificate isn't the host's.
 */
async function fetchClientDocument(url: URL) {
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) return undefined;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok || !response.body) return undefined;
    const text = await readLimited(response.body, DOCUMENT_MAX_BYTES);
    return text === undefined ? undefined : readClientDocument(url, JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** Whether an address is public: none of the private, loopback or link-local ranges, which a fetch must never reach. */
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) return !PRIVATE_V4.some((range) => range.test(address));
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPublicAddress(lower.slice("::ffff:".length));
  return !PRIVATE_V6.some((range) => range.test(lower));
}

/**
 * Whether an app's redirect URI is one its document lists: the same, or, for a loopback one (`http://localhost/callback`,
 * Claude Code's), the same but for its port, which the app picks as it signs in.
 */
export function isRedirectAllowed(registered: string[], requested: string) {
  if (!isRedirectUri(requested)) return false;
  const asked = new URL(requested);
  return registered.some((uri) => {
    if (uri === requested) return true;
    const listed = new URL(uri);
    const loopback = asked.protocol === "http:" && LOOPBACK_HOSTS.has(asked.hostname);
    const same = (url: URL) => `${url.protocol}//${url.hostname}${url.pathname}${url.search}`;
    return loopback && listed.protocol === "http:" && same(listed) === same(asked);
  });
}

/** An app's client id as a URL: an https URL with a path, no credentials and no fragment, as the specification asks. */
export function parseClientId(clientId: string) {
  if (!URL.canParse(clientId)) return undefined;
  const url = new URL(clientId);
  const valid = url.protocol === "https:" && url.pathname !== "/" && !url.username && !url.password && !url.hash;
  return valid ? url : undefined;
}

/**
 * A document's app, refused (none) unless it names itself by its URL and lists its redirect URIs, each a web address:
 * its name, at most
 * `NAME_MAX_LENGTH` long, or its host's when it gives none.
 */
export function readClientDocument(url: URL, document: unknown) {
  const parsed = clientDocument.safeParse(document);
  if (!parsed.success || parsed.data.client_id !== url.href) return undefined;
  // An https URI, or an http one to the user's device: never a script's (`javascript:`), which the consent page would run
  if (!parsed.data.redirect_uris.every((uri) => isRedirectUri(uri))) return undefined;
  const name = parsed.data.client_name?.trim().slice(0, NAME_MAX_LENGTH) || url.host;
  return { name, redirectUris: parsed.data.redirect_uris };
}

/**
 * The app a client id names: as it was kept, while it's under a day old, or fetched again (kept as it's fetched; the
 * last one kept when its fetch fails). None when the id isn't an app's URL, or nothing was ever fetched of it.
 */
export async function findClient(clientId: string) {
  const url = parseClientId(clientId);
  if (!url) return undefined;
  const kept = await OAuthClients.findOne(db, { id: url.href });
  if (kept && Date.now() - new Date(kept.fetchedAt).getTime() < REFETCH_AFTER_MS) return kept;
  const fetched = await fetchClientDocument(url);
  if (!fetched) return kept;
  const fetchedAt = new Date().toISOString();
  return await withSignInWrite(async (tx) => await OAuthClients.upsert(tx, { ...fetched, fetchedAt, id: url.href }));
}

/**
 * A body's text, read until it's past `maxBytes` at most: none when it's longer, which a server that sends no length
 * (or a false one) would otherwise have read whole.
 */
export async function readLimited(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    length += read.value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
