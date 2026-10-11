import { describe, expect, test } from "bun:test";

import { reloadForStaleChunks } from "@/client/src/lib/chunkReload.ts";
import { readStored, removeStored, writeStored } from "@/client/src/stores/browserStorage.ts";
import { isDemoExpired, markDemoExpired } from "@/client/src/stores/demoExpiredFlag.ts";
import { readThemeMode, saveThemeMode } from "@/client/src/stores/themeModeStorage.ts";

// Bun has no browser storage: reading `localStorage` throws, as a browser that blocks site data does
describe("a blocked browser storage", () => {
  test("keeps nothing, and never throws", () => {
    expect([readStored("local", "x"), writeStored("session", "x", "1")]).toEqual([null, false]);
    expect(() => removeStored("local", "x")).not.toThrow();
  });

  test("leaves the stores their defaults", () => {
    expect(() => saveThemeMode("dark")).not.toThrow();
    expect(readThemeMode()).toBe("system");
    expect(() => markDemoExpired()).not.toThrow();
    expect(isDemoExpired()).toBe(false);
  });

  // It can't tell a second reload from the first, which would loop on a chunk that's really gone
  test("never reloads the page for stale chunks", () => {
    expect(reloadForStaleChunks()).toBe(false);
  });
});
