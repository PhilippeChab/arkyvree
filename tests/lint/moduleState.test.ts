import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("module-state", () => {
  test("a module of the server or shared/ keeps no state: no top-level let, no top-level binding it changes", async () => {
    expect(
      await lintRepo(
        {
          "server/flag.ts": "let started = false;\nexport function start() {\n  started = true;\n}\n",
          "server/exportedLet.ts": "export let count = 0;\n",
          "server/map.ts": "const seen = new Map<string, number>();\nexport function see(k: string) {\n  seen.set(k, 1);\n}\n",
          "server/member.ts": "const state = { n: 0 };\nexport function bump() {\n  state.n += 1;\n}\n",
          "server/deleted.ts": "const cache: Record<string, number> = {};\nexport function drop(k: string) {\n  delete cache[k];\n}\n",
          "server/pushed.ts": "const log: string[] = [];\nexport function add(line: string) {\n  log.push(line);\n}\n",
          "server/updated.ts": "const counter = { n: 0 };\nexport function next() {\n  return counter.n++;\n}\n",
          "server/assigned.ts": "const target = {};\nexport function fill() {\n  Object.assign(target, { a: 1 });\n}\n",
          "shared/weak.ts": "const marked = new WeakSet<object>();\nexport function mark(o: object) {\n  marked.add(o);\n}\n",
        },
        ["module-state"],
      ),
    ).toEqual([
      "module-state server/assigned.ts",
      "module-state server/deleted.ts",
      "module-state server/exportedLet.ts",
      "module-state server/flag.ts",
      "module-state server/map.ts",
      "module-state server/member.ts",
      "module-state server/pushed.ts",
      "module-state server/updated.ts",
      "module-state shared/weak.ts",
    ]);
  });

  test("a value, a class's state, a shadowing local, a context's run and code outside the server pass", async () => {
    expect(
      await lintRepo(
        {
          "server/value.ts":
            "const READS = new Set(['find']);\nexport function isRead(v: string) {\n  return READS.has(v);\n}\n",
          "server/instance.ts":
            "class Counter {\n  private n = 0;\n  next() {\n    return ++this.n;\n  }\n}\n\nexport default new Counter();\n",
          "server/statics.ts":
            "export default class Flag {\n  private static on = true;\n  static set(on: boolean) {\n    Flag.on = on;\n  }\n}\n",
          "server/shadow.ts":
            "const seen = new Map<string, number>();\nexport function local() {\n  const seen = new Map<string, number>();\n  seen.set('a', 1);\n  return seen;\n}\nexport function read() {\n  return seen.size;\n}\n",
          "server/param.ts": "const list: string[] = [];\nexport function fill(list: string[]) {\n  list.push('a');\n}\nexport const size = list.length;\n",
          "server/context.ts":
            "import { AsyncLocalStorage } from 'node:async_hooks';\nconst storage = new AsyncLocalStorage<number>();\nexport function withValue<T>(v: number, fn: () => T) {\n  return storage.run(v, fn);\n}\n",
          "client/src/state.ts": "let n = 0;\nexport function next() {\n  return ++n;\n}\n",
          "lint/rules/cache.mjs": "const cache = new Map();\nexport function remember(k, v) {\n  cache.set(k, v);\n}\n",
        },
        ["module-state"],
      ),
    ).toEqual([]);
  });
});
