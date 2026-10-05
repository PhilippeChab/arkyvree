import {
  clearRequestCache,
  getCowContext,
  db as globalDb,
  type IdResolveMap,
  memoizeRequest,
} from "@/server/database/index.ts";

import { mapArgIds, mapResultIds } from "./copyOnWriteIds.ts";
import methodVerbs from "./methodVerbs.json";

/** A call to a repository method, with the arguments it runs with. */
type Call = (args: unknown[]) => unknown;

const READS = new Set(methodVerbs.read);
const WRITES = new Set(methodVerbs.write);

// A short id per copy-on-write state, so that a request's reads in two of them (a character's ruleset and another's)
// never share a cached result.
const stateIds = new WeakMap<IdResolveMap, string>();
let lastStateId = 0;

/** A method's verb, its first camelCase word: what `methodVerbs.json` classifies it by (lint holds every public one). */
function verbOf(method: string) {
  return /^[a-z]+/.exec(method)?.[0] ?? "";
}

function getStateId(map: IdResolveMap): string {
  let id = stateIds.get(map);
  if (!id) {
    id = String(++lastStateId);
    stateIds.set(map, id);
  }
  return id;
}

/**
 * What a read is cached under for the request: its repository, method and arguments but the database handle, and the
 * copy-on-write state it runs in. None when its arguments don't serialize: it isn't cached.
 */
function getReadKey(repository: string, method: string, args: unknown[]): string | undefined {
  let key: string;
  try {
    key = `${repository}.${method}:${JSON.stringify(args.slice(1))}`;
  } catch {
    return undefined;
  }
  const map = getCowContext()?.idResolveMap;
  return map && map.size > 0 ? `${key}|cow:${getStateId(map)}` : key;
}

/**
 * A read through the request cache: the same read in the same request shares one query. A transaction's reads never
 * do: its uncommitted rows mustn't reach the request's other reads.
 */
function readThrough(repository: string, method: string, mapsIds: boolean, call: Call, args: unknown[]) {
  const effectiveArgs = mapsIds ? mapArgIds(args) : args;
  const query = () => {
    const result = call(effectiveArgs) as Promise<unknown>;
    return mapsIds ? result.then(mapResultIds) : result;
  };
  if (args[0] !== globalDb) return query();
  const key = getReadKey(repository, method, effectiveArgs);
  return key === undefined ? query() : memoizeRequest(key, query);
}

/** A write through the request cache, which it clears: before, so reads in flight finish on what was, and after. */
function writeThrough(mapsIds: boolean, call: Call, args: unknown[]) {
  clearRequestCache();
  const result = call(mapsIds ? mapArgIds(args) : args);
  if (result && typeof (result as Promise<unknown>).then === "function") {
    return (result as Promise<unknown>).finally(() => clearRequestCache());
  }
  return result;
}

/**
 * A repository behind the request cache, as every caller uses it (`repositories/index.ts`). Each call goes through
 * by its method's verb (`methodVerbs.json`): a read is cached for the request (`readThrough`), a write clears it
 * (`writeThrough`). Both map copy-on-write ids, the ones a call is given and a read's rows' (`copyOnWriteIds.ts`),
 * but in the repositories that read stored ids on purpose (`skipCow`): `EntitySnapshots`, the copy-on-write state
 * itself, and `RulesetEntities`. A method calling another of its repository's (`this.findOne`) calls it directly,
 * uncached.
 */
export function withRequestCache<T extends object>(name: string, repo: T, opts?: { skipCow?: boolean }): T {
  const mapsIds = !opts?.skipCow;
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const method: unknown = Reflect.get(target, prop, receiver);
      if (typeof method !== "function" || typeof prop !== "string") return method;
      const call: Call = (args) => method.apply(target, args);
      if (READS.has(verbOf(prop))) return (...args: unknown[]) => readThrough(name, prop, mapsIds, call, args);
      if (WRITES.has(verbOf(prop))) return (...args: unknown[]) => writeThrough(mapsIds, call, args);
      return method;
    },
  });
}
