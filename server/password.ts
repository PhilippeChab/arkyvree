import { timingSafeEqual } from "node:crypto";

import { isTest } from "@/server/environment.ts";

/** A text's SHA-256 digest in hex: how passwords were stored before argon2id. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Whether two digests are the same, compared in constant time. */
function sameDigest(a: string, b: string): boolean {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A password's digest: argon2id, with its cheapest cost in tests. */
export function hashPassword(password: string) {
  return Bun.password.hash(password, { algorithm: "argon2id", ...(isTest() && { timeCost: 1, memoryCost: 1024 }) });
}

/** Whether `password` matches `digest`; a legacy SHA-256 digest that matches is to be rehashed with argon2id. */
export async function verifyPassword(
  password: string,
  digest: string,
): Promise<{ verified: boolean; needsRehash: boolean }> {
  if (digest.startsWith("$argon2"))
    return { verified: await Bun.password.verify(password, digest), needsRehash: false };
  const verified = sameDigest(await sha256(password), digest);
  return { verified, needsRehash: verified };
}
