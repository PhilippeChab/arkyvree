import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { lintRepo, runOxlint } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("conventions", () => {
  test("a file imports another folder's module through @/, and --fix rewrites a ../ import", async () => {
    expect(
      await lintRepo(
        {
          "server/a/b/c.ts": 'import { d } from "../d.ts";\nimport { e } from "./e.ts";\nexport const c = [d, e];\n',
          "server/a/b/e.ts": 'import { d } from "@/server/a/d.ts";\nexport const e = d;\n',
          "lint/rules/x.mjs": 'import { d } from "../d.mjs";\nexport const x = d;\n',
        },
        ["no-parent-imports"],
      ),
    ).toEqual(["no-parent-imports server/a/b/c.ts"]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
    fs.mkdirSync(path.join(dir, "server/a/b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "server/a/b/c.ts"), 'import { d } from "../d.ts";\nexport const c = d;\n');
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({
        jsPlugins: [path.resolve("lint/plugin.mjs")],
        rules: { "arkyvree/no-parent-imports": "error" },
      }),
    );
    await runOxlint(["-c", config, "--fix", dir]);
    expect(fs.readFileSync(path.join(dir, "server/a/b/c.ts"), "utf8")).toStartWith(
      'import { d } from "@/server/a/d.ts";',
    );
    fs.rmSync(dir, { recursive: true });
  });

  test("a helper is a module named for what it does, in the app's code", async () => {
    expect(
      await lintRepo(
        {
          "server/services/x/helpers.ts": "export const x = 1;\n",
          "client/src/lib/helpers.tsx": "export const y = 1;\n",
          "server/services/x/editable.ts": "export const z = 1;\n",
          "tests/helpers.ts": "export const t = 1;\n",
          "shared/utils.ts": "export const u = 1;\n",
          "server/utils/format.ts": "export const f = 1;\n",
        },
        ["no-helpers-modules"],
      ),
    ).toEqual([
      "no-helpers-modules client/src/lib/helpers.tsx",
      "no-helpers-modules server/services/x/helpers.ts",
      "no-helpers-modules server/utils/format.ts",
      "no-helpers-modules shared/utils.ts",
    ]);
  });

  test("only the repositories' index builds a repository", async () => {
    expect(
      await lintRepo(
        {
          "server/repositories/index.ts": "export const Feats = new FeatsRepository();\n",
          "server/services/s.ts": "export const feats = new FeatsRepository();\n",
        },
        ["repository-instances"],
      ),
    ).toEqual(["repository-instances server/services/s.ts"]);
  });

  test("a route's params are camelCase, it validates with the app's zValidator, and it doesn't catch", async () => {
    expect(
      await lintRepo(
        {
          "server/routers/api/good.ts": 'export const r = app.get("/:id/feats/:featId", (c) => c);\n',
          "server/routers/api/params.ts": 'export const r = app.get("/:id/feats/:feat_id", (c) => c);\n',
          "server/routers/api/zod.ts":
            'import { zValidator } from "@hono/zod-validator";\nexport const z = zValidator;\n',
          "server/middlewares/zValidator.ts":
            'import { zValidator } from "@hono/zod-validator";\nexport const z = zValidator;\n',
          "server/routers/api/caught.ts": "export const r = () => {\n  try {\n    f();\n  } catch {}\n};\n",
          "server/routers/static.ts": "export const r = () => {\n  try {\n    f();\n  } catch {}\n};\n",
          "server/routers/api/cleanup.ts":
            "export const r = () => {\n  try {\n    f();\n  } finally {\n    g();\n  }\n};\n",
          "server/routers/api/sub.ts": 'export const r = app.route("/:rule_set", sub);\n',
          "server/routers/api/on.ts": 'export const r = app.on("GET", "/:item_id", (c) => c);\n',
          "server/routers/api/template.ts": "export const r = app.get(`/:level_id`, (c) => c);\n",
          "server/routers/api/reexport.ts": 'export { zValidator } from "@hono/zod-validator";\n',
        },
        ["route-conventions"],
      ),
    ).toEqual([
      "route-conventions server/routers/api/caught.ts",
      "route-conventions server/routers/api/on.ts",
      "route-conventions server/routers/api/params.ts",
      "route-conventions server/routers/api/reexport.ts",
      "route-conventions server/routers/api/sub.ts",
      "route-conventions server/routers/api/template.ts",
      "route-conventions server/routers/api/zod.ts",
    ]);
  });

  test("the server sorts through the repository's orderBy", async () => {
    expect(
      await lintRepo(
        {
          "server/repositories/BaseRepository.ts":
            'import { asc, desc } from "drizzle-orm";\nexport const o = [asc, desc];\n',
          "server/repositories/Feats.ts": 'import { desc, eq } from "drizzle-orm";\nexport const o = [desc, eq];\n',
          "scripts/report.ts": 'import { asc } from "drizzle-orm";\nexport const o = asc;\n',
          "server/repositories/Orm.ts": 'import * as orm from "drizzle-orm";\nexport const o = [orm.desc, orm.eq];\n',
        },
        ["order-through-repository"],
      ),
    ).toEqual([
      "order-through-repository server/repositories/Feats.ts",
      "order-through-repository server/repositories/Orm.ts",
    ]);
  });

  test("shared/ imports neither Bun's APIs nor Node's", async () => {
    expect(
      await lintRepo(
        {
          "shared/a.ts": 'import fs from "node:fs";\nexport const a = fs;\n',
          "shared/b.ts": 'import { $ } from "bun";\nexport const b = $;\n',
          "server/c.ts": 'import fs from "node:fs";\nexport const c = fs;\n',
          "shared/d.ts": 'import path from "path";\nexport const d = path;\n',
          "shared/e.ts": 'export const e = () => Bun.file("x");\n',
          "shared/f.ts": "export const f = { Bun: 1 }.Bun;\n",
        },
        ["shared-runtime"],
      ),
    ).toEqual([
      "shared-runtime shared/a.ts",
      "shared-runtime shared/b.ts",
      "shared-runtime shared/d.ts",
      "shared-runtime shared/e.ts",
    ]);
  });

  test("a Session parameter is named session", async () => {
    expect(
      await lintRepo(
        {
          "server/services/good.ts":
            "export function f(session: Session, _session: Session) {}\nexport class P {\n  constructor(protected readonly session: Session) {}\n}\n",
          "server/services/bad.ts": "export const f = (s: Session) => s;\n",
          "server/policies/bad.ts": "export class P {\n  constructor(private readonly user: Session) {}\n}\n",
          "server/services/union.ts": "export const f = (s: Session | null) => s;\n",
          "server/services/default.ts": "export const f = (s: Session = DEMO) => s;\n",
          "server/services/abstract.ts": "export abstract class A {\n  abstract check(s: Session): void;\n}\n",
        },
        ["session-param"],
      ),
    ).toEqual([
      "session-param server/policies/bad.ts",
      "session-param server/services/abstract.ts",
      "session-param server/services/bad.ts",
      "session-param server/services/default.ts",
      "session-param server/services/union.ts",
    ]);
  });
  test("a test named after a module sits at that module's mirror; a scenario test sits anywhere in its area", async () => {
    expect(
      await lintRepo(
        {
          "server/services/x/FooService.ts": "export default 1;\n",
          "tests/services/x/FooService.test.ts": "export const t = 1;\n",
          "tests/services/FooService.test.ts": "export const t = 1;\n",
          "tests/services/Scenario.test.ts": "export const t = 1;\n",
          "tests/services/x/BarService.test.ts": "export const t = 1;\n",
        },
        ["test-placement"],
      ),
    ).toEqual([
      "test-placement tests/services/FooService.test.ts",
      "test-placement tests/services/x/BarService.test.ts",
    ]);
  });
  test("a concern sits in its file, its class is named for what it adds, and it holds no state", () => {
    const concern = (fn: string, cls: string, member = "m() {}") =>
      `export function ${fn}<B extends Constructor<Base>>(Base: B) {\n  abstract class ${cls} extends Base {\n    ${member}\n  }\n  return ${cls};\n}\n`;
    expect(
      lintRepo(
        {
          "server/a/Archives.ts": concern("Archives", "Archiving"),
          "server/a/Searches.ts": concern("Searches", "Searching"),
          "server/a/Stars.ts": concern("Stars", "Starring"),
          "server/a/ScopesToRuleset.ts": concern("ScopesToRuleset", "ScopingToRuleset"),
          "server/a/ArmorClass.ts": concern("ArmorClass", "WithArmorClass"),
          "server/a/Declares.ts": concern("Declares", "Declaring", "declare readonly table: T;"),
          "server/a/Misnamed.ts": concern("Publishes", "Publishing"),
          "server/a/Scoped.ts": concern("Scoped", "ScopedToRuleset"),
          "server/a/Holds.ts": concern("Holds", "Holding", "count = 0;"),
        },
        ["concern-shape"],
      ),
    ).toEqual([
      "concern-shape server/a/Holds.ts",
      "concern-shape server/a/Misnamed.ts",
      "concern-shape server/a/Scoped.ts",
    ]);
  });
});
