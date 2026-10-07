/** JSON written the same way each time: its keys sorted, as the reference files store it. */

import { isRecord } from "@/shared/isRecord.ts";

/** A value with every object's keys sorted, deeply. */
export function sortKeysDeep(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortKeysDeep);
  if (isRecord(val)) {
    return Object.fromEntries(
      Object.keys(val)
        .sort()
        .map((key) => [key, sortKeysDeep(val[key])]),
    );
  }
  return val;
}

/** A value as JSON, its keys sorted (`sortKeysDeep`), indented, with a final newline. */
export function stringifyStably(val: unknown): string {
  return JSON.stringify(sortKeysDeep(val), null, 2) + "\n";
}
