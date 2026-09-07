import MemoryCache from "@/server/cache/MemoryCache.ts";
import { describe, expect, test } from "bun:test";

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

  test("invalidate removes a specific key", () => {
    const cache = new MemoryCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");

    cache.invalidate("a");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
  });

  test("invalidateByPrefix removes matching keys", () => {
    const cache = new MemoryCache<string>();
    cache.set("ruleset:abc", "1");
    cache.set("ruleset:abc:camp1", "2");
    cache.set("ruleset:abc:camp2", "3");
    cache.set("ruleset:xyz", "4");

    cache.invalidateByPrefix("ruleset:abc:");

    expect(cache.get("ruleset:abc")).toBe("1"); // exact key, not a prefix match
    expect(cache.get("ruleset:abc:camp1")).toBeUndefined();
    expect(cache.get("ruleset:abc:camp2")).toBeUndefined();
    expect(cache.get("ruleset:xyz")).toBe("4");
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

  test("custom default TTL is respected", () => {
    const cache = new MemoryCache<string>(-1); // negative default TTL = already expired
    cache.set("key", "value"); // uses default TTL of -1
    expect(cache.get("key")).toBeUndefined(); // already expired
  });

  test("overwriting a key updates the value", () => {
    const cache = new MemoryCache<string>();
    cache.set("key", "old");
    cache.set("key", "new");
    expect(cache.get("key")).toBe("new");
  });

  test("evicts oldest entry when maxSize is exceeded", () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });

    cache.set("a", "1", 10_000); // expires at now+10s
    cache.set("b", "2", 20_000); // expires at now+20s
    cache.set("c", "3", 30_000); // expires at now+30s

    // Cache is full (3/3). Adding a 4th should evict "a" (earliest expiry).
    cache.set("d", "4", 40_000);

    expect(cache.get("a")).toBeUndefined(); // evicted
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
  });

  test("overwriting an existing key does not trigger eviction", () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });

    cache.set("a", "1");
    cache.set("b", "2");
    // Overwrite "a" — should NOT evict "b"
    cache.set("a", "updated");

    expect(cache.get("a")).toBe("updated");
    expect(cache.get("b")).toBe("2");
  });

  test("options object constructor works with custom defaults", () => {
    const cache = new MemoryCache<string>({ defaultTtl: -1, maxSize: 10 });
    cache.set("key", "value"); // uses default TTL of -1
    expect(cache.get("key")).toBeUndefined(); // already expired
  });

  test("pinned entries survive TTL expiry", () => {
    const cache = new MemoryCache<string>();
    cache.set("pinned", "value", -1); // already expired
    cache.pin("pinned");
    expect(cache.get("pinned")).toBe("value");
  });

  test("pinned entries are not evicted when maxSize is exceeded", () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set("pinned", "p", 10_000);
    cache.pin("pinned");
    cache.set("b", "2", 20_000);
    cache.set("c", "3", 30_000);
    // Adding a 4th would normally evict "pinned" (earliest expiry), but it's pinned.
    cache.set("d", "4", 40_000);

    expect(cache.get("pinned")).toBe("p");
    expect(cache.get("b")).toBeUndefined(); // evicted instead
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
  });

  test("unpin restores normal TTL expiry", () => {
    const cache = new MemoryCache<string>();
    cache.set("key", "value", -1);
    cache.pin("key");
    expect(cache.get("key")).toBe("value");
    cache.unpin("key");
    expect(cache.get("key")).toBeUndefined();
  });

  test("invalidate removes pin state so re-setting does not stay pinned", () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set("a", "1", 10_000);
    cache.pin("a");
    cache.invalidate("a");
    // Re-set without pinning
    cache.set("a", "1", 10_000);
    cache.set("b", "2", 20_000);
    cache.set("c", "3", 30_000); // should evict "a" since it's no longer pinned
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
