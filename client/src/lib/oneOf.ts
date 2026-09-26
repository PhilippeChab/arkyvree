/** `value` when it is one of `allowed`, else `fallback` — for untrusted URL params. */
export function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
