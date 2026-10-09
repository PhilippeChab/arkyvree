import { expect, test } from "bun:test";

import DependentCache from "@/server/cache/DependentCache.ts";

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
