import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { fixRepo, lines, lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("test rules", () => {
  test("every test runs, without mocks; an e2e test selects by role and takes test and expect from the fixtures", async () => {
    expect(
      await lintRepo(
        {
          "tests/services/a.test.ts": 'test("runs", async () => {});\n',
          "tests/services/b.test.ts": 'test.skip("skipped", () => {});\n',
          "tests/services/c.test.ts": 'describe.only("focused", () => {});\n',
          "tests/services/d.test.ts": 'import { mock } from "bun:test";\nexport const d = mock;\n',
          "tests/e2e/journeys/e.e2e.ts": 'import { test } from "@playwright/test";\nexport const e = test;\n',
          "tests/e2e/journeys/f.e2e.ts":
            'import type { Page } from "@playwright/test";\nexport const f = (page: Page) => page.getByTestId("save");\n',
          "tests/e2e/journeys/h.e2e.ts": 'test.describe.only("focused", () => {});\ntest.fixme("broken", () => {});\n',
          "tests/e2e/journeys/i.e2e.ts": 'export const i = (page, id) => page.locator(`[data-testid="${id}"]`);\n',
          "tests/services/j.test.ts": 'import * as bt from "bun:test";\nexport const j = bt.mock;\n',
          "tests/e2e/journeys/g.e2e.ts":
            'import { expect, test } from "../fixtures.ts";\nexport const g = [expect, test];\n',
        },
        ["test-conventions"],
      ),
    ).toEqual([
      "test-conventions tests/e2e/journeys/e.e2e.ts",
      "test-conventions tests/e2e/journeys/f.e2e.ts",
      "test-conventions tests/e2e/journeys/h.e2e.ts",
      "test-conventions tests/e2e/journeys/h.e2e.ts",
      "test-conventions tests/e2e/journeys/i.e2e.ts",
      "test-conventions tests/services/b.test.ts",
      "test-conventions tests/services/c.test.ts",
      "test-conventions tests/services/d.test.ts",
      "test-conventions tests/services/j.test.ts",
    ]);
  });

  test("an awaited bun:test expect, a .resolves / .rejects chain too, loses its await with --fix; Playwright's keeps it", async () => {
    const files = {
      "tests/services/a.test.ts": lines(
        'import { expect as check, test } from "bun:test";',
        "",
        'test("a", async () => {',
        "  await check(1).toBe(1);",
        "  await check(2).not.toEqual(3);",
        "  await (check(4).toBe(4));",
        "  await check(Promise.resolve(5)).resolves.toBe(5);",
        '  await check(Promise.reject(new Error("x")))',
        '    .rejects.toThrow("x");',
        "});",
      ),
      "tests/e2e/journeys/b.e2e.ts": lines(
        'import { expect } from "@playwright/test";',
        "",
        'import { test } from "../fixtures.ts";',
        "",
        'test("b", async ({ page }) => {',
        '  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();',
        "});",
      ),
    };
    expect(await lintRepo(files, ["sync-expects"])).toEqual(Array(5).fill("sync-expects tests/services/a.test.ts"));
    const out = await fixRepo(files, ["sync-expects"]);
    expect(out["tests/services/a.test.ts"]).toBe(
      lines(
        'import { expect as check, test } from "bun:test";',
        "",
        'test("a", async () => {',
        "  check(1).toBe(1);",
        "  check(2).not.toEqual(3);",
        "  (check(4).toBe(4));",
        "  check(Promise.resolve(5)).resolves.toBe(5);",
        '  check(Promise.reject(new Error("x")))',
        '    .rejects.toThrow("x");',
        "});",
      ),
    );
    expect(out["tests/e2e/journeys/b.e2e.ts"]).toBe(files["tests/e2e/journeys/b.e2e.ts"]);
  });
});
