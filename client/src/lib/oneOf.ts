import { isOneOf } from "@/shared/isOneOf.ts";

/** `value` when it is one of `allowed`, else `fallback` (or undefined) — for untrusted strings such as URL params. */
export function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined;
export function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T;
export function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  return isOneOf(value, allowed) ? value : fallback;
}
