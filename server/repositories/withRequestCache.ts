import { clearRequestCache, db as globalDb, memoizeRequest } from "@/server/database/index.ts";

import methodVerbs from "./methodVerbs.json";

/** A call to a repository method, with the arguments it runs with. */
type Call = (args: unknown[]) => unknown;

const READS = new Set(methodVerbs.read);
const WRITES = new Set(methodVerbs.write);

/**
 * What a read is cached under for the request: its repository, method and arguments but the database handle. None when
 * its arguments don't serialize: it isn't cached.
 */
function getReadKey(repository: string, method: string, args: unknown[]): string | undefined {
  try {
    return `${repository}.${method}:${JSON.stringify(args.slice(1))}`;
  } catch {
    return undefined;
  }
}

/**
 * A read through the request cache: the same read in the same request shares one query. A transaction's reads never
 * do: its uncommitted rows mustn't reach the request's other reads.
 */
function readThrough(repository: string, method: string, call: Call, args: unknown[]) {
  const query = () => call(args) as Promise<unknown>;
  if (args[0] !== globalDb) return query();
  const key = getReadKey(repository, method, args);
  return key === undefined ? query() : memoizeRequest(key, query);
}

/** A method's verb, its first camelCase word: what `methodVerbs.json` classifies it by (lint holds every public one). */
function verbOf(method: string) {
  return /^[a-z]+/.exec(method)?.[0] ?? "";
}

/** A write through the request cache, which it clears: before, so reads in flight finish on what was, and after. */
function writeThrough(call: Call, args: unknown[]) {
  clearRequestCache();
  const result = call(args);
  if (result && typeof (result as Promise<unknown>).then === "function")
    return (result as Promise<unknown>).finally(() => clearRequestCache());
  return result;
}

/**
 * A repository behind the request cache, as every caller uses it (`repositories/index.ts`). Each call goes through
 * by its method's verb (`methodVerbs.json`): a read is cached for the request (`readThrough`), a write clears it
 * (`writeThrough`). Ids pass as they're given and as stored: the engine resolves copy-on-write's, from the view. A
 * method calling another of its repository's (`this.findOne`) calls it directly, uncached.
 */
export function withRequestCache<T extends object>(name: string, repo: T): T {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const method: unknown = Reflect.get(target, prop, receiver);
      if (typeof method !== "function" || typeof prop !== "string") return method;
      const call: Call = (args) => method.apply(target, args);
      if (READS.has(verbOf(prop))) return (...args: unknown[]) => readThrough(name, prop, call, args);
      if (WRITES.has(verbOf(prop))) return (...args: unknown[]) => writeThrough(call, args);
      return method;
    },
  });
}
