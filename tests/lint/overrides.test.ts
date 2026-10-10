import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runOxlint } from "./lintRepo.ts";

/** Modules a fixture writes, by name: a base, a class two levels down, a concern, and classes that include it. */
const MODULES: Record<string, string[]> = {
  "Base.ts": [
    "export default abstract class Base {",
    "  protected abstract columnsOf(): void;",
    "  abstract describe(): string;",
    "  check() {}",
    "}",
  ],
  "Builds.ts": [
    'import type Base from "./Base.ts";',
    "",
    "export function Builds<B extends Constructor<Base>>(Base: B) {",
    "  abstract class Building extends Base {",
    '    describe() { return "built"; }',
    "  }",
    "  return Building;",
    "}",
  ],
  "GenericBase.ts": ["export default abstract class GenericBase<T> {", "  abstract read(): T;", "}"],
  "Generic.ts": [
    'import { include } from "@/lib/mixins.ts";',
    'import GenericBase from "./GenericBase.ts";',
    'import { Lists } from "./Lists.ts";',
    "",
    "export default class Generic extends include(GenericBase<string>, Lists) {",
    '  read() { return ""; }',
    "  protected listOf() { return []; }",
    "}",
  ],
  "index.ts": ['export { default as Middle } from "./Middle.ts";'],
  "Leaf.ts": [
    'import { Middle } from "./index.ts";',
    "",
    "export default class Leaf extends Middle {",
    "  protected columnsOf() {}",
    '  describe() { return ""; }',
    "  plan() {}",
    "  own() {}",
    "  check() {}",
    "}",
  ],
  "Lists.ts": [
    'import type Base from "./Base.ts";',
    "",
    "export function Lists<B extends Constructor<Base>>(Base: B) {",
    "  abstract class Listing extends Base {",
    "    protected abstract listOf(): string[];",
    "  }",
    "  return Listing;",
    "}",
  ],
  "Middle.ts": [
    'import Base from "./Base.ts";',
    "",
    "export default abstract class Middle extends Base {",
    "  abstract plan(): void;",
    "}",
  ],
};

/** A fixture's folder, its modules written, with a config running the rule alone. */
function writeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "override-keyword-"));
  fs.writeFileSync(
    path.join(dir, ".oxlintrc.json"),
    JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/override-keyword": "error" } }),
  );
  for (const [name, lines] of Object.entries(MODULES)) fs.writeFileSync(path.join(dir, name), `${lines.join("\n")}\n`);
  return dir;
}

// Each runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("override-keyword", () => {
  test("reports and fixes an abstract member's implementation without `override`, through its base chain", async () => {
    const dir = writeFixture();
    const config = path.join(dir, ".oxlintrc.json");
    const { stdout } = await runOxlint(["-c", config, "-f", "unix", dir]);
    const reported = stdout
      .split("\n")
      .map((line) => /([A-Za-z]+\.ts):\d+:\d+: `(\w+)`/.exec(line))
      .filter(Boolean)
      .map((match) => `${match?.[1]} ${match?.[2]}`)
      .sort();
    expect(reported).toEqual([
      // A concern's class implements its base's (`Constructor<Base>`)
      "Builds.ts describe",
      // An instantiated base and a concern, through `include(…)`
      "Generic.ts listOf",
      "Generic.ts read",
      // Two levels up, through an index's re-export
      "Leaf.ts columnsOf",
      "Leaf.ts describe",
      "Leaf.ts plan",
    ]);

    await runOxlint(["-c", config, "--fix", dir]);
    expect(fs.readFileSync(path.join(dir, "Leaf.ts"), "utf8")).toBe(
      [
        'import { Middle } from "./index.ts";',
        "",
        "export default class Leaf extends Middle {",
        // After its accessibility
        "  protected override columnsOf() {}",
        '  override describe() { return ""; }',
        "  override plan() {}",
        // Its own, and a concrete one's override, which the compiler's `noImplicitOverride` reports
        "  own() {}",
        "  check() {}",
        "}",
        "",
      ].join("\n"),
    );
    fs.rmSync(dir, { recursive: true });
  });
});
