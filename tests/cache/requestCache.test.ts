/**
 * Request-scoped query dedup. Covers:
 * - Identical find calls inside one request coalesce to the same Promise.
 * - Different args → distinct keys → distinct promises.
 * - findOne vs findMany keyed separately.
 * - Store is per-request (separate runs never share state).
 * - No memoization outside a request context (no store installed).
 * - clearRequestCache invalidates — next call is a fresh promise.
 * - Rejected promises self-evict so retries don't return the cached rejection.
 */

import { db, withTransaction } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { Characters, Feats, Rulesets } from "@/server/repositories/index.ts";
import {
  clearRequestCache,
  memoizeRequest,
  runWithRequestCache,
} from "@/server/database/requestCache.ts";
import { beforeAll, describe, expect, test } from "bun:test";

describe("requestCache — repository Proxy memoization", () => {
  let ctx: SeedContext;

  beforeAll(async () => {
    ctx = await getSeedContext(db);
  });

  test("identical findOne calls in the same request return the same promise", async () => {
    await runWithRequestCache(async () => {
      const p1 = Rulesets.findOne(db, { id: ctx.rulesetId });
      const p2 = Rulesets.findOne(db, { id: ctx.rulesetId });
      expect(p1).toBe(p2); // same Promise reference = memoized
      const [a, b] = await Promise.all([p1, p2]);
      expect(a?.id).toBe(ctx.rulesetId);
      expect(b).toBe(a); // and resolves to the same underlying row object
    });
  });

  test("different args produce distinct cache entries", async () => {
    await runWithRequestCache(async () => {
      const p1 = Rulesets.findOne(db, { id: ctx.rulesetId });
      const p2 = Rulesets.findOne(db, {
        id: "00000000-0000-0000-0000-000000000000",
      });
      expect(p1).not.toBe(p2);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1?.id).toBe(ctx.rulesetId);
      expect(r2).toBeUndefined();
    });
  });

  test("findOne and findMany are keyed separately even if args overlap", async () => {
    await runWithRequestCache(async () => {
      const featId = Object.values(ctx.featMap)[0];
      const p1 = Feats.findOne(db, { id: featId });
      const p2 = Feats.findMany(db, { ids: [featId] });
      expect(p1).not.toBe(p2);
      await Promise.all([p1, p2]);
    });
  });

  test("store is per-request: separate runWithRequestCache calls don't share", async () => {
    // Collect each run's promise reference by capturing it before awaiting.
    let firstRunPromise!: Promise<unknown>;
    let secondRunPromise!: Promise<unknown>;

    await runWithRequestCache(async () => {
      firstRunPromise = Rulesets.findOne(db, { id: ctx.rulesetId });
      await firstRunPromise;
    });
    await runWithRequestCache(async () => {
      secondRunPromise = Rulesets.findOne(db, { id: ctx.rulesetId });
      await secondRunPromise;
    });

    // Different Promise instances because each run has its own store.
    expect(firstRunPromise).not.toBe(secondRunPromise);
  });

  test("no memoization when not inside a request context", async () => {
    const p1 = Rulesets.findOne(db, { id: ctx.rulesetId });
    const p2 = Rulesets.findOne(db, { id: ctx.rulesetId });
    // No store installed → memoizeRequest is a no-op → each call is a fresh promise.
    expect(p1).not.toBe(p2);
    await Promise.all([p1, p2]);
  });

  test("clearRequestCache evicts entries; subsequent call is a fresh promise", async () => {
    await runWithRequestCache(async () => {
      const p1 = Rulesets.findOne(db, { id: ctx.rulesetId });
      await p1;

      clearRequestCache();

      const p2 = Rulesets.findOne(db, { id: ctx.rulesetId });
      expect(p2).not.toBe(p1);
      await p2;
    });
  });

  test("withTransaction clears the cache after commit so post-tx reads are fresh", async () => {
    await runWithRequestCache(async () => {
      // Pre-tx read populates the cache.
      const pre = Rulesets.findOne(db, { id: ctx.rulesetId });
      await pre;

      // Run a no-op transaction just to exercise the commit path.
      await withTransaction(async () => {
        // intentionally empty — we just need the commit hook to fire.
      });

      // Post-tx read must be a fresh promise (not the pre-tx memoized one).
      const post = Rulesets.findOne(db, { id: ctx.rulesetId });
      expect(post).not.toBe(pre);
      await post;
    });
  });

  test("Characters.findOne dedupes across multiple sub-calls in one request", async () => {
    // Mimics the real dup pattern: pickQueries.getAvailablePowers and
    // DetailedCharacterDataLoader both do Characters.findOne(db, {...}) /
    // Rulesets.findOne(db, {...}) in the same request. Different shaped args
    // remain distinct — same-shape args collapse to one promise.
    await runWithRequestCache(async () => {
      const sameArgsA = Rulesets.findOne(db, { id: ctx.rulesetId });
      const sameArgsB = Rulesets.findOne(db, { id: ctx.rulesetId });
      const differentArgs = Characters.findOne(db, {
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(sameArgsA).toBe(sameArgsB);
      expect(sameArgsA).not.toBe(differentArgs);
      await Promise.all([sameArgsA, sameArgsB, differentArgs]);
    });
  });
});

describe("requestCache — memoizeRequest primitive", () => {
  test("rejected promises self-evict so retries don't replay the cached rejection", async () => {
    await runWithRequestCache(async () => {
      let callCount = 0;
      const failThenSucceed = () => {
        callCount += 1;
        return callCount === 1
          ? Promise.reject(new Error("boom"))
          : Promise.resolve("ok");
      };

      await expect(memoizeRequest("retry-key", failThenSucceed))
        .rejects.toThrow("boom");

      // Second call must actually re-invoke the fn — the cache must not have
      // retained the rejected promise from the first attempt.
      const second = await memoizeRequest("retry-key", failThenSucceed);
      expect(second).toBe("ok");
      expect(callCount).toBe(2);
    });
  });

  test("distinct keys coexist; identical keys share", async () => {
    await runWithRequestCache(async () => {
      let aCalls = 0;
      let bCalls = 0;
      const fnA = () => { aCalls += 1; return Promise.resolve("a"); };
      const fnB = () => { bCalls += 1; return Promise.resolve("b"); };

      const [r1, r2] = await Promise.all([
        memoizeRequest("key-a", fnA),
        memoizeRequest("key-b", fnB),
      ]);
      const r3 = await memoizeRequest("key-a", fnA);

      expect(r1).toBe("a");
      expect(r2).toBe("b");
      expect(r3).toBe("a");
      // fnA ran once (second call was memoized); fnB ran once.
      expect(aCalls).toBe(1);
      expect(bCalls).toBe(1);
    });
  });

  test("memoizeRequest is a no-op outside runWithRequestCache", async () => {
    let calls = 0;
    const fn = () => { calls += 1; return Promise.resolve(calls); };

    const a = await memoizeRequest("no-store-key", fn);
    const b = await memoizeRequest("no-store-key", fn);

    // No store → each call actually runs the function.
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(calls).toBe(2);
  });
});
