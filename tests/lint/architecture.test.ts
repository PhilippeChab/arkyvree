import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

/** A repo of `files` (path → source), linted by the architecture rules: each finding as `rule path`. */
function lint(files: Record<string, string>, from = ".") {
  return lintRepo(files, ["layers", "queries-in-repositories", "folder-index"], from);
}

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("architecture rules", () => {
  test("code outside engine/ enters it through engine/index.ts; the engine and a test reach any of its modules", async () => {
    expect(
      await lintRepo(
        {
          "server/a.ts": 'import { x } from "@/engine/index.ts";\nexport const a = x;\n',
          "server/b.ts": 'import { x } from "@/engine/core/view/index.ts";\nexport const b = x;\n',
          "database/c.ts":
            'import X from "@/engine/rulesets/dnd3.5/model/skills/SkillsPaths.ts";\nexport const c = X;\n',
          "codegen/d.ts": 'import type { T } from "@/engine/rulesets/dnd3.5/index.ts";\nexport type D = T;\n',
          "engine/core/e.ts": 'import { x } from "@/engine/core/view/index.ts";\nexport const e = x;\n',
          "tests/f.test.ts": 'import { x } from "@/engine/core/view/index.ts";\nexport const f = x;\n',
          // The folder, which resolves to its index: by its name only
          "server/g.ts": 'import { x } from "@/engine";\nexport const g = x;\n',
        },
        ["engine-front-door"],
      ),
    ).toEqual([
      "engine-front-door codegen/d.ts",
      "engine-front-door database/c.ts",
      "engine-front-door server/b.ts",
      "engine-front-door server/g.ts",
    ]);
  });

  test("a service's or a job's action asks the engine one operation, however often, through whatever it calls", async () => {
    const engine = 'import { Engine, type T } from "@/engine/index.ts";\n';
    const plan = "Engine.for(x).skills().planCreate(x)";
    const describe = "Engine.for(x).skills().describe(x)";
    expect(
      await lintRepo(
        {
          // One operation per method, called twice, by a callback too; a handle's own methods aren't operations
          "server/services/a.ts":
            engine +
            `export class A {\n  one(x: T) {\n    ${plan};\n    return [x].map(() => ${plan});\n  }\n` +
            `  two(x: T) {\n    ${plan};\n    return [x].map(() => ${describe});\n  }\n}\n`,
          // A function of the module, and a concern's method
          "server/jobs/b.ts": engine + `export function b(x: T) {\n  ${plan};\n  return ${describe};\n}\n`,
          "server/services/c.ts":
            engine +
            "export function C<B extends new () => object>(Base: B) {\n  return class extends Base {\n" +
            `    one(x: T) {\n      return ${plan};\n    }\n    other(x: T) {\n      return ${describe};\n    }\n  };\n}\n`,
          // Through its own method or its module's function
          "server/services/d.ts":
            engine +
            `function described(x: T) {\n  return ${describe};\n}\n` +
            `export class D {\n  private planned(x: T) {\n    return ${plan};\n  }\n` +
            "  one(x: T) {\n    return [this.planned(x), described(x)];\n  }\n}\n",
          // Through a handle the action keeps, or the entry under another name
          "server/jobs/e.ts":
            engine +
            "export function e(x: T) {\n  const skills = Engine.for(x).skills();\n" +
            "  return [skills.planCreate(x), skills.describe(x)];\n}\n" +
            "export function f(x: T) {\n  const engine = Engine;\n  return [engine.for(x).skills().planEdit(x), " +
            describe +
            "];\n}\n",
          // Through another action's function, re-exported by its folder's index, beside an operation of its own
          "server/services/f/flow.ts": engine + `export function flow(x: T) {\n  return ${plan};\n}\n`,
          "server/services/f/index.ts": 'export { flow } from "./flow.ts";\n',
          "server/services/g.ts":
            engine +
            'import { flow } from "@/server/services/f/index.ts";\n' +
            `export function g(x: T) {\n  return [flow(x), ${describe}];\n}\n`,
          // The routers and copy-on-write's views aren't actions
          "server/cow/views/h.ts": engine + `export function h(x: T) {\n  ${plan};\n  return ${describe};\n}\n`,
          // Another service, and a plan's own answer (`plan.describe(row)`), which isn't another operation
          "server/services/l/LService.ts":
            engine + `class LService {\n  m(x: T) {\n    return ${plan};\n  }\n}\nexport default new LService();\n`,
          "server/services/m.ts":
            engine +
            'import LService from "./l/LService.ts";\n' +
            `export class M {\n  one(x: T) {\n    return [LService.m(x), ${describe}];\n  }\n` +
            `  two(x: T) {\n    const planned = ${plan};\n    return planned.describe(x);\n  }\n}\n`,
        },
        ["one-engine-op"],
      ),
    ).toEqual([
      "one-engine-op server/jobs/b.ts",
      "one-engine-op server/jobs/e.ts",
      "one-engine-op server/jobs/e.ts",
      "one-engine-op server/services/a.ts",
      "one-engine-op server/services/d.ts",
      "one-engine-op server/services/g.ts",
      "one-engine-op server/services/m.ts",
    ]);
  });

  test("the server reads a ruleset's view only for its copy-on-write data; copy-on-write's views build it", async () => {
    expect(
      await lintRepo(
        {
          "server/services/a.ts":
            "export function a(scope: { rulesetData: { cow: object } }) {\n" +
            "  const { rulesetData } = scope;\n  return [rulesetData.cow, scope.rulesetData.cow];\n}\n",
          "server/services/b.ts":
            "export function b(scope: { rulesetData: { feats: object } }) {\n  return scope.rulesetData.feats;\n}\n",
          "server/services/c.ts":
            "export function c(scope: { rulesetData: object }) {\n  const { rulesetData } = scope;\n" +
            "  const view = rulesetData;\n  return view;\n}\n",
          "server/cow/views/d.ts":
            "export function d(scope: { rulesetData: { feats: object } }) {\n  return scope.rulesetData.feats;\n}\n",
          // Past a retyping, its copy-on-write data alone; the view under another name, through `!`, or the cache's
          "server/services/e.ts":
            "export function e(scope: { rulesetData: { cow: object } }) {\n" +
            "  const { rulesetData: { cow } } = scope;\n  return [cow, (scope.rulesetData as { cow: object }).cow];\n}\n",
          "server/services/f.ts":
            "export function f(scope: { rulesetData: object }) {\n  const { rulesetData: view } = scope;\n  return view;\n}\n",
          "server/services/g.ts":
            "export function g(scope: { rulesetData?: { feats: object } }) {\n  return scope.rulesetData!.feats;\n}\n",
          "server/services/h.ts":
            'import { RulesetViews } from "@/server/cow/index.ts";\n' +
            "export async function h(ruleset: never) {\n  return await RulesetViews.getData(ruleset);\n}\n",
          // Under the name the file imports the cache by, or by a computed key
          "server/services/i.ts":
            'import { RulesetViews as Cache } from "@/server/cow/index.ts";\n' +
            "export async function i(ruleset: never) {\n  return await Cache.getData(ruleset);\n}\n",
          "server/services/j.ts":
            'export function j(scope: { rulesetData: { feats: object } }) {\n  return scope["rulesetData"].feats;\n}\n',
        },
        ["opaque-view"],
      ),
    ).toEqual([
      "opaque-view server/services/b.ts",
      "opaque-view server/services/c.ts",
      "opaque-view server/services/f.ts",
      "opaque-view server/services/g.ts",
      "opaque-view server/services/h.ts",
      "opaque-view server/services/i.ts",
      "opaque-view server/services/j.ts",
    ]);
  });

  test("an index that re-exports only re-exports; any other module exports what it declares", async () => {
    expect(
      await lintRepo(
        {
          // A folder's entry, re-exporting from its modules; a module named index that re-exports nothing (routes)
          "server/a/index.ts": 'export { f } from "./f.ts";\nexport type { T } from "./t.ts";\n',
          "server/routers/r/index.ts": "export default 1;\n",
          // An entry with code of its own, and one that re-exports what it imports
          "server/b/index.ts": 'export { f } from "./f.ts";\nexport const g = 1;\n',
          "server/c/index.ts": 'import { f } from "./f.ts";\nexport { f };\n',
          // A module re-exporting from another, or what it imports
          "server/d.ts": 'export { f } from "./a/f.ts";\n',
          "server/e.ts": 'import { f } from "./a/f.ts";\nexport { f };\nexport const h = f;\n',
          // A module making what it imports its default export
          "server/g.ts": 'import f from "./a/f.ts";\nexport default f;\n',
        },
        ["re-exports"],
      ),
    ).toEqual([
      "re-exports server/b/index.ts",
      "re-exports server/c/index.ts",
      "re-exports server/c/index.ts",
      "re-exports server/d.ts",
      "re-exports server/e.ts",
      "re-exports server/g.ts",
    ]);
  });

  test("a layer imports only what's below it, types where a layer names them", async () => {
    expect(
      await lint({
        "server/repositories/A.ts": 'import { x } from "@/server/services/s.ts";\nexport const a = x;\n',
        "server/database/d.ts": 'import type { R } from "@/server/repositories/r.ts";\nexport type D = R;\n',
        "server/services/s.ts": 'import r from "@/server/routers/r.ts";\nexport const x = r;\n',
        // The cache is memoization only: none of the repositories, copy-on-write or the engine
        "server/cache/c.ts": 'import { w } from "@/server/cow/index.ts";\nexport const c = w;\n',
        "server/cache/r.ts": 'import { R } from "@/server/repositories/index.ts";\nexport const r = R;\n',
        "server/cache/e.ts": 'import { Engine } from "@/engine/index.ts";\nexport const e = Engine;\n',
        "server/cow/w.ts": 'import { s } from "@/server/services/s.ts";\nexport const w = s;\n',
        // Copy-on-write's views sit below its writes
        "server/cow/views/v.ts": 'import { E } from "@/server/cow/writes/EntityCopy.ts";\nexport const v = E;\n',
        "server/cow/writes/w.ts": 'import { V } from "@/server/cow/views/RulesetViews.ts";\nexport const w = V;\n',
        // The engine's machinery names no ruleset, not even for a type; a ruleset builds on the machinery and lib/
        "engine/core/module/m.ts": 'import type { C } from "@/engine/rulesets/dnd3.5/index.ts";\nexport type M = C;\n',
        "engine/rulesets/dnd3.5/r.ts": 'import type { M } from "@/engine/core/module/m.ts";\nexport type R = M;\n',
        "engine/rulesets/dnd3.5/i.ts": 'import { include } from "@/lib/mixins.ts";\nexport const i = include;\n',
        // lib/ imports nothing of the app
        "lib/l.ts": 'import { x } from "@/server/services/s.ts";\nexport const l = x;\n',
        "shared/s.ts": 'import type { T } from "@/drizzle/schema.ts";\nexport type S = T;\n',
        // The engine reads nothing itself: neither the server nor the database, and the schema for its types alone
        "engine/core/view/v.ts": 'import { db } from "@/server/database/index.ts";\nexport const v = db;\n',
        "engine/core/view/t.ts": 'import type { T } from "@/drizzle/schema.ts";\nexport type V = T;\n',
        // Its core names no ruleset
        "engine/core/view/r.ts": 'import type { R } from "@/engine/rulesets/dnd3.5/r.ts";\nexport type V = R;\n',
        // The client takes the engine's types, never its code
        "client/src/e.ts":
          'import type { RulesetData } from "@/engine/core/view/index.ts";\nexport type E = RulesetData;\n',
        "client/src/w.ts":
          'import { RulesetData } from "@/engine/core/view/index.ts";\nexport const w = RulesetData;\n',
        "client/src/c.ts": 'import type { App } from "@/server/routers/application.ts";\nexport type C = App;\n',
        "client/src/v.ts": 'import { app } from "@/server/routers/application.ts";\nexport const v = app;\n',
        // A content package's vocabulary reads neither its data nor the server
        "content/dnd3.5/builders/a.ts": 'import { b } from "@/content/dnd3.5/builders/b.ts";\nexport const a = b;\n',
        "content/dnd3.5/builders/s.ts": 'import { x } from "@/server/services/s.ts";\nexport const s = x;\n',
      }),
    ).toEqual([
      "layers client/src/v.ts",
      "layers client/src/w.ts",
      "layers content/dnd3.5/builders/s.ts",
      "layers engine/core/module/m.ts",
      "layers engine/core/view/r.ts",
      "layers engine/core/view/v.ts",
      "layers lib/l.ts",
      "layers server/cache/c.ts",
      "layers server/cache/e.ts",
      "layers server/cache/r.ts",
      "layers server/cow/views/v.ts",
      "layers server/cow/w.ts",
      "layers server/database/d.ts",
      "layers server/repositories/A.ts",
      "layers server/services/s.ts",
    ]);
  });

  test("a ruleset's content: its builders below its data and its generated books, which its packages gather", async () => {
    const imports = (from: string) => `import { x } from "${from}";\nexport const y = x;\n`;
    expect(
      await lint({
        // The builders import nothing written in them
        "content/dnd3.5/builders/a.ts": imports("@/content/dnd3.5/data/coreRules.ts"),
        "content/dnd3.5/builders/b.ts": imports("@/content/dnd3.5/generated/srd/index.ts"),
        "content/dnd3.5/builders/c.ts": imports("@/content/dnd3.5/packages/core.ts"),
        "content/dnd3.5/builders/d.ts": imports("@/content/dnd3.5/testData/characters.ts"),
        "content/dnd3.5/builders/e.ts": imports("@/content/dnd3.5/builders/feats/types.ts"),
        // The hand-written data reads nothing the codegen writes; a generated book wraps no hand-written content
        "content/dnd3.5/data/f.ts": imports("@/content/dnd3.5/generated/srd/index.ts"),
        "content/dnd3.5/data/g.ts": imports("@/content/dnd3.5/packages/core.ts"),
        "content/dnd3.5/data/h.ts": imports("@/vocabulary/dnd3.5/weapons.ts"),
        "content/dnd3.5/generated/srd/i.ts": imports("@/content/dnd3.5/data/feats/coreFeats.ts"),
        "content/dnd3.5/generated/srd/j.ts": imports("@/content/dnd3.5/builders/feats/possession.ts"),
        // A package gathers the books and the data
        "content/dnd3.5/packages/k.ts": imports("@/content/dnd3.5/generated/srd/index.ts"),
        "content/dnd3.5/packages/l.ts": imports("@/content/dnd3.5/data/coreRules.ts"),
        // The codegen reads the builders and the data, never what it writes
        "codegen/dnd3.5/tools/m.ts": imports("@/content/dnd3.5/generated/srd/index.ts"),
        "codegen/dnd3.5/tools/n.ts": imports("@/content/dnd3.5/packages/core.ts"),
        "codegen/dnd3.5/tools/o.ts": imports("@/content/dnd3.5/data/feats/coreFeats.ts"),
        "codegen/dnd3.5/tools/p.ts": imports("@/content/dnd3.5/builders/feats/types.ts"),
        // A seeder reads a package's content from its definition
        "database/seeders/dnd3.5/q.ts": imports("@/content/dnd3.5/data/coreRules.ts"),
        "database/seeders/dnd3.5/r.ts": imports("@/content/dnd3.5/generated/dmg/index.ts"),
        "database/packages/s.ts": imports("@/content/dnd3.5/packages/core.ts"),
        "database/seeds/t.ts": imports("@/content/dnd3.5/testData/characters.ts"),
        "tests/u.test.ts": imports("@/content/dnd3.5/generated/srd/index.ts"),
      }),
    ).toEqual([
      "layers codegen/dnd3.5/tools/m.ts",
      "layers codegen/dnd3.5/tools/n.ts",
      "layers content/dnd3.5/builders/a.ts",
      "layers content/dnd3.5/builders/b.ts",
      "layers content/dnd3.5/builders/c.ts",
      "layers content/dnd3.5/builders/d.ts",
      "layers content/dnd3.5/data/f.ts",
      "layers content/dnd3.5/data/g.ts",
      "layers content/dnd3.5/generated/srd/i.ts",
      "layers database/seeders/dnd3.5/q.ts",
      "layers database/seeders/dnd3.5/r.ts",
    ]);
  });

  test("each ruleset's folders are its own, and what every ruleset runs on names none of them", async () => {
    const imports = (from: string) => `import { x } from "${from}";\nexport const y = x;\n`;
    expect(
      await lintRepo(
        {
          // The rulesets: the folders of engine/rulesets/
          "engine/rulesets/dnd3.5/index.ts": "export const x = 1;\n",
          "engine/rulesets/pf1/index.ts": "export const x = 1;\n",
          // One ruleset's code reaches into another's, in any tree
          "engine/rulesets/pf1/a.ts": imports("@/engine/rulesets/dnd3.5/index.ts"),
          "content/pf1/data/b.ts": imports("@/content/dnd3.5/data/coreRules.ts"),
          "codegen/pf1/tools/c.ts": imports("@/codegen/dnd3.5/tools/text/sanitize.ts"),
          "database/seeders/pf1/d.ts": imports("@/database/seeders/dnd3.5/BaseSeeder.ts"),
          "client/src/pages/pf1/e.ts": imports("@/client/src/pages/dnd3.5/f.ts"),
          // What every ruleset runs on names none of them
          "engine/core/g.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          "content/core/builders/h.ts": imports("@/content/dnd3.5/builders/feats/possession.ts"),
          "codegen/core/i.ts": imports("@/codegen/dnd3.5/tools/text/sanitize.ts"),
          "database/seeders/core/j.ts": imports("@/database/seeders/dnd3.5/BaseSeeder.ts"),
          "server/k.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          "shared/l.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          // The content's runner, the dev and test seeds and the scripts reach a ruleset's content through its registry
          "database/packages/m.ts": imports("@/content/dnd3.5/packages/core.ts"),
          "database/seeds/n.ts": imports("@/content/dnd3.5/testData/characters.ts"),
          "scripts/db/x.ts": imports("@/database/seeders/dnd3.5/RulesetSeeder.ts"),
          "database/packages/registry.ts": imports("@/database/seeders/dnd3.5/RulesetSeeder.ts"),
          "database/seeds/y.ts": imports("@/database/packages/registry.ts"),
          // A ruleset reads its own folders and the core's; a registry and a test read any ruleset's
          "content/dnd3.5/builders/o.ts": imports("@/content/dnd3.5/builders/items/types.ts"),
          "content/dnd3.5/data/p.ts": imports("@/content/core/builders/customization/requirements.ts"),
          "engine/rulesets/dnd3.5/q.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          "engine/api/r.ts": imports("@/engine/rulesets/pf1/index.ts"),
          "tests/s.test.ts": imports("@/engine/rulesets/pf1/index.ts"),
          // The client's generic modules reach a ruleset's vocabulary and code through its registries alone
          "client/src/pages/rulesets/t.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          "client/src/pages/rulesets/vocabularyFactory.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          "client/src/pages/rulesets/components/dnd3.5/u.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
          "client/src/pages/rulesets/components/v.ts": imports("@/client/src/pages/rulesets/components/dnd3.5/u.ts"),
          "client/src/pages/rulesets/details/sectionFactory.ts": imports(
            "@/client/src/pages/rulesets/components/dnd3.5/u.ts",
          ),
          "vocabulary/pf1/w.ts": imports("@/vocabulary/dnd3.5/spells.ts"),
        },
        ["ruleset-folders"],
      ),
    ).toEqual([
      "ruleset-folders client/src/pages/pf1/e.ts",
      "ruleset-folders client/src/pages/rulesets/components/v.ts",
      "ruleset-folders client/src/pages/rulesets/t.ts",
      "ruleset-folders codegen/core/i.ts",
      "ruleset-folders codegen/pf1/tools/c.ts",
      "ruleset-folders content/core/builders/h.ts",
      "ruleset-folders content/pf1/data/b.ts",
      "ruleset-folders database/packages/m.ts",
      "ruleset-folders database/seeders/core/j.ts",
      "ruleset-folders database/seeders/pf1/d.ts",
      "ruleset-folders database/seeds/n.ts",
      "ruleset-folders engine/core/g.ts",
      "ruleset-folders engine/rulesets/pf1/a.ts",
      "ruleset-folders scripts/db/x.ts",
      "ruleset-folders server/k.ts",
      "ruleset-folders shared/l.ts",
      "ruleset-folders vocabulary/pf1/w.ts",
    ]);
  });

  test("a ruleset's vocabulary is data: it imports nothing of the app but shared/'s types", async () => {
    expect(
      await lint({
        "vocabulary/dnd3.5/a.ts": 'import { x } from "@/engine/core/RulesError.ts";\nexport const a = x;\n',
        "vocabulary/dnd3.5/b.ts":
          'import type { ItemLocation } from "@/shared/enums.ts";\nexport const b: ItemLocation[] = [];\n',
        "vocabulary/dnd3.5/c.ts": 'import { y } from "@/client/src/lib/z.ts";\nexport const c = y;\n',
      }),
    ).toEqual(["layers vocabulary/dnd3.5/a.ts", "layers vocabulary/dnd3.5/c.ts"]);
  });

  test("a ruleset's vocabulary declares no function or class, and a constant holds none", async () => {
    expect(
      await lintRepo(
        {
          "vocabulary/dnd3.5/a.ts": "export function label(level: number) {\n  return `Level ${level}`;\n}\n",
          "vocabulary/dnd3.5/b.ts": "export const label = (level: number) => `Level ${level}`;\n",
          "vocabulary/dnd3.5/c.ts": "export class Labels {}\n",
          // A callback in a constant's value builds the data
          "vocabulary/dnd3.5/d.ts":
            "const LEVELS = [0, 1];\nexport const LABELS = LEVELS.map((level) => `Level ${level}`);\n",
          "shared/e.ts": "export function label(level: number) {\n  return `Level ${level}`;\n}\n",
        },
        ["vocabulary-data"],
      ),
    ).toEqual([
      "vocabulary-data vocabulary/dnd3.5/a.ts",
      "vocabulary-data vocabulary/dnd3.5/b.ts",
      "vocabulary-data vocabulary/dnd3.5/c.ts",
    ]);
  });

  test("a query is built in a repository, or in the database layer", async () => {
    expect(
      await lint({
        "server/services/s.ts": "export const s = (db) => db.select().from(t);\n",
        "server/services/r.ts": "export const r = (tx) => tx.query.users.findMany();\n",
        "server/services/u.ts": 'import { unionAll } from "drizzle-orm/pg-core";\nexport const u = unionAll;\n',
        "server/repositories/Users.ts": "export const ok = (db) => db.select().from(t);\n",
        "server/database/notify.ts": "export const notify = (db) => db.execute(sql);\n",
        "server/websockets/events.ts": "export const notify = (db) => db.execute(sql);\n",
      }),
    ).toEqual([
      "queries-in-repositories server/services/r.ts",
      "queries-in-repositories server/services/s.ts",
      "queries-in-repositories server/services/u.ts",
      "queries-in-repositories server/websockets/events.ts",
    ]);
  });

  test("code outside a folder with an index enters it through the index; inside it, and tests, import directly", async () => {
    expect(
      await lint({
        "server/services/feats/index.ts": 'export { default as FeatsService } from "./FeatsService.ts";\n',
        "server/services/feats/FeatsService.ts": 'import { helper } from "./helper.ts";\nexport default helper;\n',
        "server/services/feats/helper.ts": "export const helper = 1;\n",
        "server/routers/bad.ts":
          'import FeatsService from "@/server/services/feats/FeatsService.ts";\nexport const b = FeatsService;\n',
        "server/routers/good.ts":
          'import { FeatsService } from "@/server/services/feats/index.ts";\nexport const g = FeatsService;\n',
        "tests/feats.test.ts":
          'import { helper } from "@/server/services/feats/helper.ts";\nexport const t = helper;\n',
      }),
    ).toEqual(["folder-index server/routers/bad.ts"]);
  });

  test("every server folder with an index is entered through it, but the routers'; the seeders and tools reach in", async () => {
    expect(
      await lint({
        "server/repositories/index.ts": 'export { Visibility } from "./BaseRepository.ts";\n',
        "server/repositories/BaseRepository.ts": "export enum Visibility { All }\n",
        "server/services/direct.ts":
          'import { Visibility } from "@/server/repositories/BaseRepository.ts";\nexport const d = Visibility;\n',
        "server/services/indexed.ts":
          'import { Visibility } from "@/server/repositories/index.ts";\nexport const i = Visibility;\n',
        "server/routers/api/index.ts": "export default 1;\n",
        "server/routers/api/validation.ts": "export const idParam = 1;\n",
        "server/routers/authentication/validation.ts":
          'import { idParam } from "@/server/routers/api/validation.ts";\nexport const v = idParam;\n',
        "database/seeds/seed.ts":
          'import { Visibility } from "@/server/repositories/BaseRepository.ts";\nexport const s = Visibility;\n',
      }),
    ).toEqual(["folder-index server/services/direct.ts"]);
  });

  test("code outside a client component folder enters it at its outermost index; its own files at a subfolder's", async () => {
    expect(
      await lint({
        "client/src/components/sheet/index.ts": 'export { Row } from "./rows/index.ts";\n',
        "client/src/components/sheet/rows/index.ts": 'export { Row } from "./Row.tsx";\n',
        "client/src/components/sheet/rows/Row.tsx": "export function Row() {\n  return null;\n}\n",
        "client/src/components/sheet/Body.tsx":
          'import { Row } from "./rows/index.ts";\nexport function Body() {\n  return Row();\n}\n',
        "client/src/pages/outer.tsx":
          'import { Row } from "@/client/src/components/sheet/index.ts";\nexport const o = Row;\n',
        "client/src/pages/inner.tsx":
          'import { Row } from "@/client/src/components/sheet/rows/index.ts";\nexport const i = Row;\n',
      }),
    ).toEqual(["folder-index client/src/pages/inner.tsx"]);
  });

  test("a ruleset's code enters a client component folder of its own ruleset at that ruleset folder's index", async () => {
    expect(
      await lint({
        "engine/rulesets/dnd3.5/index.ts": "export const x = 1;\n",
        "client/src/components/sheet/index.ts": 'export { Row } from "./Row.tsx";\n',
        "client/src/components/sheet/Row.tsx": "export function Row() {\n  return null;\n}\n",
        "client/src/components/sheet/dnd3.5/index.ts": 'export { Cell } from "./cells/index.ts";\n',
        "client/src/components/sheet/dnd3.5/cells/index.ts": 'export { Cell } from "./Cell.tsx";\n',
        "client/src/components/sheet/dnd3.5/cells/Cell.tsx": "export function Cell() {\n  return null;\n}\n",
        // Its ruleset folder's index, never a subfolder's, nor the generic folder's around it, which re-exports none of it
        "client/src/pages/dnd3.5/step.tsx":
          'import { Cell } from "@/client/src/components/sheet/dnd3.5/index.ts";\nexport const s = Cell;\n',
        "client/src/pages/dnd3.5/deep.tsx":
          'import { Cell } from "@/client/src/components/sheet/dnd3.5/cells/index.ts";\nexport const d = Cell;\n',
        // A generic module still enters at the folder's outermost index
        "client/src/pages/generic.tsx":
          'import { Cell } from "@/client/src/components/sheet/dnd3.5/index.ts";\nexport const g = Cell;\n',
      }),
    ).toEqual(["folder-index client/src/pages/dnd3.5/deep.tsx", "folder-index client/src/pages/generic.tsx"]);
  });

  test("the middlewares sit above the repositories, and the server reads nothing of database/", async () => {
    expect(
      await lint({
        "server/repositories/R.ts": 'import { m } from "@/server/middlewares/m.ts";\nexport const r = m;\n',
        "server/middlewares/m.ts": 'import { R } from "@/server/repositories/R.ts";\nexport const m = R;\n',
        "server/rulesets/seed.ts":
          'import { items } from "@/database/seeders/dnd3.5/items.ts";\nexport const s = items;\n',
        "server/rulesets/data.ts":
          'import { CORE } from "@/content/dnd3.5/packages/core.ts";\nexport const d = CORE;\n',
        "server/services/s.ts": 'import { SEED } from "@/database/seeds/users.ts";\nexport const s = SEED;\n',
      }),
    ).toEqual([
      "layers server/repositories/R.ts",
      "layers server/rulesets/data.ts",
      "layers server/rulesets/seed.ts",
      "layers server/services/s.ts",
    ]);
  });

  test("a transaction's handle is named `tx`, which the query rule knows", async () => {
    expect(
      await lint({
        "server/services/s.ts":
          "export const a = withTransaction(async (conn) => conn);\nexport const b = withTransaction(async (tx) => tx);\n",
      }),
    ).toEqual(["queries-in-repositories server/services/s.ts"]);
  });

  test("a directory import of a folder is its index", async () => {
    expect(
      await lint({
        "server/services/rulesets/index.ts": 'export { default as RulesetsService } from "./RulesetsService.ts";\n',
        "server/services/rulesets/RulesetsService.ts": "export default 1;\n",
        "server/services/rulesets/feats/index.ts": 'export { default as FeatsService } from "./FeatsService.ts";\n',
        "server/services/rulesets/feats/FeatsService.ts": "export default 1;\n",
        "server/routers/r.ts":
          'import { RulesetsService } from "@/server/services/rulesets";\nimport { FeatsService } from "@/server/services/rulesets/feats";\nexport const r = [RulesetsService, FeatsService];\n',
      }),
    ).toEqual([]);
  });

  test("the rules hold when oxlint runs from a subfolder", async () => {
    expect(
      await lint(
        { "server/repositories/A.ts": 'import { x } from "@/server/services/s.ts";\nexport const a = x;\n' },
        "server",
      ),
    ).toEqual(["layers server/repositories/A.ts"]);
  });
});
