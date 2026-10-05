import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

/** A repo of `files` (path → source), linted by the architecture rules: each finding as `rule path`. */
const lint = (files: Record<string, string>, from = ".") =>
  lintRepo(files, ["layers", "queries-in-repositories", "folder-index"], from);

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("architecture rules", () => {
  test("a layer imports only what's below it: types the exceptions name, cow from the cache and the engine", async () => {
    expect(
      await lint({
        "server/repositories/A.ts": 'import { x } from "@/server/services/s.ts";\nexport const a = x;\n',
        "server/database/d.ts": 'import type { R } from "@/server/repositories/r.ts";\nexport type D = R;\n',
        "server/services/s.ts": 'import r from "@/server/routers/r.ts";\nexport const x = r;\n',
        "server/cache/c.ts": 'import { w } from "@/server/services/rulesets/cow/index.ts";\nexport const c = w;\n',
        "shared/s.ts": 'import type { T } from "@/drizzle/schema.ts";\nexport type S = T;\n',
        "client/src/c.ts": 'import type { App } from "@/server/routers/application.ts";\nexport type C = App;\n',
        "client/src/v.ts": 'import { app } from "@/server/routers/application.ts";\nexport const v = app;\n',
      }),
    ).toEqual([
      "layers client/src/v.ts",
      "layers server/database/d.ts",
      "layers server/repositories/A.ts",
      "layers server/services/s.ts",
    ]);
  });

  test("a query is built in a repository, or in the infrastructure that talks to Postgres", async () => {
    expect(
      await lint({
        "server/services/s.ts": "export const s = (db) => db.select().from(t);\n",
        "server/services/r.ts": "export const r = (tx) => tx.query.users.findMany();\n",
        "server/services/u.ts": 'import { unionAll } from "drizzle-orm/pg-core";\nexport const u = unionAll;\n',
        "server/repositories/Users.ts": "export const ok = (db) => db.select().from(t);\n",
        "server/websockets/events.ts": "export const notify = (db) => db.execute(sql);\n",
      }),
    ).toEqual([
      "queries-in-repositories server/services/r.ts",
      "queries-in-repositories server/services/s.ts",
      "queries-in-repositories server/services/u.ts",
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

  test("the middlewares sit above the repositories, and the server reads content packages, not the seeders", async () => {
    expect(
      await lint({
        "server/repositories/R.ts": 'import { m } from "@/server/middlewares/m.ts";\nexport const r = m;\n',
        "server/middlewares/m.ts": 'import { R } from "@/server/repositories/R.ts";\nexport const m = R;\n',
        "server/rulesets/seed.ts":
          'import { items } from "@/database/packages/dnd35/seed/items.ts";\nexport const s = items;\n',
        "server/services/s.ts": 'import { SEED } from "@/database/seeds/helpers.ts";\nexport const s = SEED;\n',
      }),
    ).toEqual(["layers server/repositories/R.ts", "layers server/services/s.ts"]);
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
