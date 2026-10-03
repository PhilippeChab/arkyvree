import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const oxlint = path.resolve("node_modules/.bin/oxlint");

/** A repo of `files` (path → source), linted by the architecture rules: each finding as `rule path`. */
function lint(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), source);
  }
  fs.writeFileSync(
    path.join(dir, ".oxlintrc.json"),
    JSON.stringify({
      jsPlugins: [path.resolve("lint/plugin.mjs")],
      rules: {
        "arkyvree/layers": "error",
        "arkyvree/queries-in-repositories": "error",
        "arkyvree/folder-index": "error",
      },
    }),
  );
  const run = Bun.spawnSync([oxlint, "-f", "unix", "."], { cwd: dir });
  fs.rmSync(dir, { recursive: true });
  return [...run.stdout.toString().matchAll(/^\.?\/?([^:]+):\d+:\d+: .*\[Error\/arkyvree\(([a-z-]+)\)\]$/gm)]
    .map(([, file, rule]) => `${rule} ${file}`)
    .sort();
}

describe("architecture rules", () => {
  test("a layer imports only what's below it: types the exceptions name, cow from the cache and the engine", () => {
    expect(
      lint({
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

  test("a query is built in a repository, or in the infrastructure that talks to Postgres", () => {
    expect(
      lint({
        "server/services/s.ts": "export const s = (db) => db.select().from(t);\n",
        "server/services/r.ts": "export const r = (tx) => tx.query.users.findMany();\n",
        "server/services/u.ts": 'import { unionAll } from "drizzle-orm/pg-core";\nexport const u = unionAll;\n',
        "server/repositories/Users.ts": "export const ok = (db) => db.select().from(t);\n",
        "server/ws.ts": "export const notify = (db) => db.execute(sql);\n",
      }),
    ).toEqual([
      "queries-in-repositories server/services/r.ts",
      "queries-in-repositories server/services/s.ts",
      "queries-in-repositories server/services/u.ts",
    ]);
  });

  test("code outside a folder with an index enters it through the index; inside it, and tests, import directly", () => {
    expect(
      lint({
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
});
