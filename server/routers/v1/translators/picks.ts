/**
 * The keys a v1 schema names, picked off an app's answer: a key the app adds later stays out of v1's answer, which the
 * document describes, and one it drops stops the translator compiling.
 */

import type { z } from "zod";

/** `value`'s keys that `schema` names, each as `value` holds it. */
export function pickShape<S extends z.ZodObject>(schema: S, value: { [K in keyof z.infer<S>]: z.infer<S>[K] }) {
  return Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, value[key as keyof z.infer<S>]]),
  ) as z.infer<S>;
}
