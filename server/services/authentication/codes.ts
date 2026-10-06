import { timingSafeEqual } from "node:crypto";

export function compareInConstantTime(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateVerificationCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (10000000 + (buffer[0] % 90000000)).toString();
}
