import type { Holder } from "@/server/rulesets/engine/types.ts";

/**
 * What a holder's method `name` returns, called on the holder (its getter read): the target paths call a holder's getters by name, from
 * their tables. Undefined when it has no such method.
 */
export function readHolder(holder: Holder, name: string): unknown {
  const method: unknown = Reflect.get(holder, name);
  return typeof method === "function" ? method.call(holder) : undefined;
}
