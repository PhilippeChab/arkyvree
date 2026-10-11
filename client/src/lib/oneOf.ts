import { isOneOf } from "@/shared/isOneOf.ts";

/** `value` when it is one of `allowed`, else `fallback` (or undefined) — for untrusted values such as URL params. */
export function oneOf<T extends string | number>(value: unknown, allowed: readonly T[]): T | undefined;
export function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T;
export function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined {
  return isOneOf(value, allowed) ? value : fallback;
}
