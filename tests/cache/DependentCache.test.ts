import { expect, test } from "bun:test";

import DependentCache from "@/server/cache/DependentCache.ts";
import { MAX_ENTRIES } from "@/server/cache/MemoryCache.ts";

for (const invalidation of ["dependency", "all"] as const) {
  test(`${invalidation} invalidation keeps a late fill from replacing a fresh one`, async () => {
    const cache = new DependentCache<string>();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const old = cache.getOrFetch("paths", ["fork"], async () => {
      started.resolve();
      await release.promise;
      return { data: "Before" };
    });
    await started.promise;
    try {
      if (invalidation === "dependency") cache.invalidate("fork");
      else cache.invalidateAll();
      expect(await cache.getOrFetch("paths", ["fork"], async () => ({ data: "After" }))).toBe("After");
    } finally {
      release.resolve();
      await old;
    }
    expect(await cache.getOrFetch("paths", ["fork"], async () => ({ data: "Refetched" }))).toBe("After");
  });
}

test("keeps a fill its fetcher pins, whatever it evicts once full", async () => {
  const cache = new DependentCache<string>();
  expect(await cache.getOrFetch("pinned", [], async () => ({ data: "Pinned", pinned: true }))).toBe("Pinned");
  expect(await cache.getOrFetch("unpinned", [], async () => ({ data: "Unpinned" }))).toBe("Unpinned");
  for (let index = 0; index < MAX_ENTRIES; index++)
    await cache.getOrFetch(`filler-${index}`, [], async () => ({ data: "" }));

  expect(await cache.getOrFetch("pinned", [], async () => ({ data: "Refetched" }))).toBe("Pinned");
  expect(await cache.getOrFetch("unpinned", [], async () => ({ data: "Refetched" }))).toBe("Refetched");
});
