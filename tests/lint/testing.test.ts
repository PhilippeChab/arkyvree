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

  test("an error given to a matcher that can't read it whole is refused, written there or held by a const", async () => {
    const refused = {
      toThrow: 'expect(() => check()).toThrow(new ConflictError("No"));',
      rejects: 'expect(call).rejects.toThrow(new ConflictError("No"));',
      not: 'expect(() => check()).not.toThrow(new ConflictError("No"));',
      alias: 'expect(() => check()).toThrowError(new ConflictError("No"));',
      plain: 'expect(() => check()).toThrow(new Error("No"));',
      namespaced: 'expect(() => check()).toThrow(new errors.ConflictError("No"));',
      block: 'const held = new ForbiddenError("No");\nexpect(() => check()).toThrow(held);',
      outerBlock:
        'const held = new ForbiddenError("No");\nfor (const check of checks) { expect(check).toThrow(held); }',
      fileConstant: "expect(() => check()).toThrow(HELD);",
      matchClass: 'expect(thrown).toMatchObject(new ConflictError("No"));',
      matchRejection: 'expect(call).rejects.toMatchObject(new ConflictError("No"));',
      matchPlain: 'expect(thrown).toMatchObject(new Error("No"));',
      matchHeld: 'const held = new ConflictError("No");\nexpect(thrown).toMatchObject(held);',
    };
    const fileOf = (body: string) =>
      lines(
        'import { expect, test } from "bun:test";',
        "",
        'const HELD = new ForbiddenError("No");',
        "",
        'test("a", () => {',
        body,
        "});",
      );
    const files = Object.fromEntries(
      Object.entries(refused).map(([name, body]) => [`tests/services/${name}.test.ts`, fileOf(body)]),
    );
    expect(await lintRepo(files, ["test-conventions"])).toEqual(
      Object.keys(files)
        .sort()
        .map((file) => `test-conventions ${file}`),
    );
    // Under another name too
    const renamed = lines(
      'import { expect as check, test } from "bun:test";',
      "",
      'test("a", () => check(() => run()).toThrow(new ConflictError("No")));',
    );
    expect(await lintRepo({ "tests/services/a.test.ts": renamed }, ["test-conventions"])).toEqual([
      "test-conventions tests/services/a.test.ts",
    ]);
  });

  test("what reads an error stays: its class, its words, toEqual, and toMatchObject of the fields it names", async () => {
    const source = lines(
      'import { expect, test } from "bun:test";',
      "",
      'test("a", () => {',
      "  expect(() => check()).toThrow();",
      "  expect(() => check()).toThrow(ConflictError);",
      '  expect(() => check()).toThrow("No");',
      "  expect(() => check()).toThrow(/No/);",
      '  expect(() => check()).toThrow(expect.objectContaining({ name: "ConflictError", message: "No" }));',
      '  expect(call).rejects.toThrow("No");',
      '  expect(thrown).toEqual(new ConflictError("No"));',
      '  expect(thrown).toStrictEqual(new ConflictError("No"));',
      '  expect(call).rejects.toEqual(new ConflictError("No"));',
      '  expect(call).rejects.toEqual(new Error("No"));',
      '  expect(thrown).toMatchObject({ name: "ConflictError", message: "No" });',
      '  expect(call).rejects.toMatchObject({ code: 409, message: "No" });',
      '  expect(thrown).toBe(new ConflictError("No"));',
      "});",
      "",
      'test("a const of the same name, in a block of its own", () => {',
      '  const held = new ConflictError("No");',
      "  expect(call).rejects.toEqual(held);",
      "});",
      "",
      'test("words", () => {',
      '  const held = "No";',
      "  expect(() => check()).toThrow(held);",
      "});",
      "",
      'test("what makes no error", () => {',
      "  expect(() => check()).toThrow(new Rollback());",
      "});",
      "",
      'test("a let, which can hold its words by then", () => {',
      '  let thrown = new ConflictError("No");',
      '  thrown = "No";',
      "  expect(() => check()).toThrow(thrown);",
      "});",
      "",
      'test("a parameter named as an outer error", () => {',
      '  const held = new ConflictError("No");',
      "  const expectThrown = (held: string) => expect(() => check()).toThrow(held);",
      '  expectThrown("No");',
      '  const expectDefault = (held = "No") => expect(() => check()).toThrow(held);',
      "  expectDefault();",
      "});",
    );
    const playwright = lines(
      'import { expect } from "@playwright/test";',
      "",
      'import { test } from "../fixtures.ts";',
      "",
      'test("b", () => expect(() => check()).toThrow(new Error("No")));',
    );
    expect(
      await lintRepo({ "tests/services/a.test.ts": source, "tests/e2e/journeys/b.e2e.ts": playwright }, [
        "test-conventions",
      ]),
    ).toEqual([]);
  });
});
