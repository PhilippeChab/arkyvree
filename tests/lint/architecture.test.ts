import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

/** A repo of `files` (path → source), linted by the architecture rules: each finding as `rule path`. */
function lint(files: Record<string, string>, from = ".") {
  return lintRepo(files, ["layers", "queries-in-repositories", "folder-index"], from);
}

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("architecture rules", () => {
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
        "server/cache/c.ts": 'import { w } from "@/server/cow/index.ts";\nexport const c = w;\n',
        "server/cow/w.ts": 'import { s } from "@/server/services/s.ts";\nexport const w = s;\n',
        "server/rulesets/e.ts": 'import { w } from "@/server/cow/index.ts";\nexport const e = w;\n',
        // The engine's machinery names no ruleset, not even for a type; a ruleset builds on the machinery and lib/
        "engine/core/module/m.ts": 'import type { C } from "@/engine/rulesets/dnd3.5/index.ts";\nexport type M = C;\n',
        "engine/rulesets/dnd3.5/r.ts": 'import type { M } from "@/engine/core/module/m.ts";\nexport type R = M;\n',
        "engine/rulesets/dnd3.5/i.ts": 'import { include } from "@/lib/mixins.ts";\nexport const i = include;\n',
        // lib/ imports nothing of the app
        "lib/l.ts":
          'import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";\nexport const l = RulesetFactory;\n',
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
        "database/packages/dnd35/content/a.ts":
          'import { b } from "@/database/packages/dnd35/content/b.ts";\nexport const a = b;\n',
        "database/packages/dnd35/content/d.ts":
          'import { D } from "@/database/packages/dnd35/data/core.ts";\nexport const d = D;\n',
        "database/packages/dnd35/content/s.ts": 'import { S } from "@/server/rulesets/s.ts";\nexport const s = S;\n',
      }),
    ).toEqual([
      "layers client/src/v.ts",
      "layers client/src/w.ts",
      "layers database/packages/dnd35/content/d.ts",
      "layers database/packages/dnd35/content/s.ts",
      "layers engine/core/module/m.ts",
      "layers engine/core/view/r.ts",
      "layers engine/core/view/v.ts",
      "layers lib/l.ts",
      "layers server/cache/c.ts",
      "layers server/cow/w.ts",
      "layers server/database/d.ts",
      "layers server/repositories/A.ts",
      "layers server/services/s.ts",
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

  test("the middlewares sit above the repositories, and the server reads nothing of database/", async () => {
    expect(
      await lint({
        "server/repositories/R.ts": 'import { m } from "@/server/middlewares/m.ts";\nexport const r = m;\n',
        "server/middlewares/m.ts": 'import { R } from "@/server/repositories/R.ts";\nexport const m = R;\n',
        "server/rulesets/seed.ts":
          'import { items } from "@/database/packages/dnd35/seed/items.ts";\nexport const s = items;\n',
        "server/rulesets/data.ts":
          'import { CORE } from "@/database/packages/dnd35/data/core.ts";\nexport const d = CORE;\n',
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
