/**
 * Copy-on-write ids at a repository's edges. A ruleset's scope (`withRulesetScope`) maps every stale id (a copied
 * entity's source, a book's copy that lost to another's) to the one that wins there (`CowData.resolve`): a query gets
 * the winners' ids it's given, and a row it reads refers to winners, so no caller maps an id itself. Outside a scope,
 * or in one without copies, nothing changes. Read here rather than through the cache (`cache/rulesetCache/`), which imports the
 * repositories: a cycle at load.
 */

import type { CowData } from "@/engine/index.ts";
import { getCowContext } from "@/server/database/index.ts";

/** The scope's copy-on-write data, when it resolves any id. */
function getActiveCow(): CowData | undefined {
  const cow = getCowContext();
  return cow && !cow.isEmpty() ? cow : undefined;
}

/**
 * A where's or values' entity ids (`id`, `…Id`, `ids`, `…Ids`) mapped to their winners: the same object when none
 * moves. An exclusion (`exclude…`) keeps the losers' ids it names, on purpose.
 */
function mapFields(fields: Record<string, unknown>, cow: CowData): Record<string, unknown> {
  let mapped: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("exclude")) continue;
    let next: unknown = value;
    if (typeof value === "string" && (key === "id" || key.endsWith("Id"))) {
      next = cow.resolve(value);
    } else if (Array.isArray(value) && (key === "ids" || key.endsWith("Ids"))) {
      const ids = value.map((id: unknown) => (typeof id === "string" ? cow.resolve(id) : id));
      if (ids.some((id, i) => id !== value[i])) next = ids;
    }
    if (next !== value) (mapped ??= { ...fields })[key] = next;
  }
  return mapped ?? fields;
}

/**
 * A read's elements with their stale ids mapped: a row's references (not its own id: a row stays the row it is), or an
 * id itself, when the read returns ids (`findIds`). Anything else passes through.
 */
function mapRows(rows: unknown[], cow: CowData): unknown[] {
  return rows.map((row) => {
    if (typeof row === "string") return cow.resolve(row);
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const mapped = { ...row } as Record<string, unknown>;
    for (const [key, value] of Object.entries(mapped))
      if (key !== "id" && typeof value === "string") mapped[key] = cow.resolve(value);

    return mapped;
  });
}

/** A repository call's arguments with their ids mapped: each plain object after the database handle. */
export function mapArgIds(args: unknown[]): unknown[] {
  const cow = getActiveCow();
  if (!cow) return args;
  let mapped: unknown[] | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg || typeof arg !== "object" || Array.isArray(arg)) continue;
    const next = mapFields(arg as Record<string, unknown>, cow);
    if (next !== arg) (mapped ??= args.slice())[i] = next;
  }
  return mapped ?? args;
}

/** A read's result with its rows' ids mapped: rows, a page of them, or one. */
export function mapResultIds(result: unknown): unknown {
  const cow = getActiveCow();
  if (!cow) return result;
  if (Array.isArray(result)) return mapRows(result, cow);
  if (!result || typeof result !== "object") return result;
  const fields = result as Record<string, unknown>;
  if (Array.isArray(fields.items)) return { ...fields, items: mapRows(fields.items, cow) };
  // Only a row: a set, a map or a count passes through, which spreading would lose
  if (typeof fields.id === "string" && fields.constructor === Object) return mapRows([fields], cow)[0];
  return result;
}
