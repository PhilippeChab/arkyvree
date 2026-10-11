import { timingSafeEqual } from "node:crypto";

import { VERIFICATION_CODE_LENGTH } from "@/shared/auth.ts";

/** The smallest code of its length: its first digit is never 0. */
const LOWEST_CODE = 10 ** (VERIFICATION_CODE_LENGTH - 1);

export function compareInConstantTime(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateVerificationCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (LOWEST_CODE + (buffer[0] % (9 * LOWEST_CODE))).toString();
}
