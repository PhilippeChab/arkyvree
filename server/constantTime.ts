import { timingSafeEqual } from "node:crypto";

/**
 * Whether two texts are the same, compared in constant time: how long it takes tells nothing of where they differ (a
 * code, a password's digest, a signature). Texts of different lengths differ at once: a length is no secret.
 */
export function compareInConstantTime(a: string, b: string): boolean {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}
