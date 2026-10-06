import { describe, expect, test } from "bun:test";

import MemoryCache, { MAX_ENTRIES } from "@/server/cache/MemoryCache.ts";

/** Sets `count` entries, `fill0`…, each expiring after `ttl` and a millisecond later than the one before. */
function fill(cache: MemoryCache<string>, count: number, ttl: number) {
  for (let i = 0; i < count; i++) cache.set(`fill${i}`, String(i), ttl + i);
}

describe("MemoryCache", () => {
  test("returns undefined for missing keys", () => {
    const cache = new MemoryCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  test("stores and retrieves a value", () => {
    const cache = new MemoryCache<string>();
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  test("stores complex objects", () => {
    const cache = new MemoryCache<{ items: number[]; flag: boolean }>();
    const data = { items: [1, 2, 3], flag: true };
    cache.set("obj", data);
    expect(cache.get("obj")).toBe(data); // same reference
  });

  test("invalidateWhere removes the matching entries", () => {
    const cache = new MemoryCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");

    cache.invalidateWhere((value) => value === "1");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
  });

  test("invalidateAll clears everything", () => {
    const cache = new MemoryCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    cache.invalidateAll();

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
  });

  test("expired entries return undefined", () => {
    const cache = new MemoryCache<string>();
    // Set with a negative TTL (already expired)
    cache.set("expired", "value", -1);
    expect(cache.get("expired")).toBeUndefined();
  });

  test("entries within TTL are returned", () => {
    const cache = new MemoryCache<string>();
    cache.set("fresh", "value", 60_000); // 60 seconds
    expect(cache.get("fresh")).toBe("value");
  });

  test("overwriting a key updates the value", () => {
    const cache = new MemoryCache<string>();
    cache.set("key", "old");
    cache.set("key", "new");
    expect(cache.get("key")).toBe("new");
  });

  test("evicts the entry that expires first once full", () => {
    const cache = new MemoryCache<string>();
    cache.set("first", "1", 10_000);
    fill(cache, MAX_ENTRIES - 1, 20_000);

    cache.set("last", "2", 40_000);

    expect(cache.get("first")).toBeUndefined(); // evicted
    expect(cache.get("fill0")).toBe("0");
    expect(cache.get("last")).toBe("2");
  });

  test("overwriting an existing key does not trigger eviction", () => {
    const cache = new MemoryCache<string>();
    fill(cache, MAX_ENTRIES, 10_000);

    cache.set("fill0", "updated");

    expect(cache.get("fill0")).toBe("updated");
    expect(cache.get("fill1")).toBe("1");
  });

  test("pinned entries survive TTL expiry", () => {
    const cache = new MemoryCache<string>();
    cache.set("pinned", "value", -1); // already expired
    cache.pin("pinned");
    expect(cache.get("pinned")).toBe("value");
  });

  test("pinned entries are not evicted once full", () => {
    const cache = new MemoryCache<string>();
    cache.set("pinned", "p", 10_000);
    cache.pin("pinned");
    fill(cache, MAX_ENTRIES - 1, 20_000);
    // Adding one more would evict "pinned" (earliest expiry), but it's pinned
    cache.set("last", "4", 40_000);

    expect(cache.get("pinned")).toBe("p");
    expect(cache.get("fill0")).toBeUndefined(); // evicted instead
    expect(cache.get("fill1")).toBe("1");
    expect(cache.get("last")).toBe("4");
  });

  test("invalidateWhere removes pin state so re-setting does not stay pinned", () => {
    const cache = new MemoryCache<string>();
    cache.set("a", "1", 10_000);
    cache.pin("a");
    cache.invalidateWhere((value) => value === "1");
    // Re-set without pinning
    cache.set("a", "1", 10_000);
    fill(cache, MAX_ENTRIES - 1, 20_000);
    cache.set("last", "2", 40_000); // evicts "a", no longer pinned
    expect(cache.get("a")).toBeUndefined();
  });

  test("invalidateAll clears pinned entries", () => {
    const cache = new MemoryCache<string>();
    cache.set("pinned", "value", -1);
    cache.pin("pinned");
    cache.invalidateAll();
    expect(cache.get("pinned")).toBeUndefined();
  });
});
