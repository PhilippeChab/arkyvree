import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { fixRepo, lines, lintRepo } from "./lintRepo.ts";

/** A router file whose one route's handler is `handler`. */
function routeReading(handler: string) {
  return `export const r = app.post("/:id", validate("param", idParam), (c) => {\n${handler}\n});\n`;
}

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("conventions", () => {
  test("a file imports another folder's module through @/ and its own folder's directly, and --fix rewrites both", async () => {
    expect(
      await lintRepo(
        {
          "server/a/b/c.ts": 'import { d } from "../d.ts";\nimport { e } from "./e.ts";\nexport const c = [d, e];\n',
          "server/a/b/e.ts": 'import { d } from "@/server/a/d.ts";\nexport const e = d;\n',
          "server/a/b/f.ts":
            'import { e } from "@/server/a/b/e.ts";\nimport { g } from "@/server/a/b/g/g.ts";\nexport const f = [e, g];\n',
          "lint/rules/x.mjs": 'import { d } from "../d.mjs";\nexport const x = d;\n',
        },
        ["no-parent-imports"],
      ),
    ).toEqual([
      "no-parent-imports server/a/b/c.ts",
      "no-parent-imports server/a/b/f.ts",
      "no-parent-imports server/a/b/f.ts",
    ]);

    const fixed = await fixRepo(
      {
        "server/a/b/c.ts": 'import { d } from "../d.ts";\nexport const c = d;\n',
        "server/a/b/f.ts": 'import { e } from "@/server/a/b/e.ts";\nexport const f = e;\n',
      },
      ["no-parent-imports"],
    );
    expect(fixed["server/a/b/c.ts"]).toStartWith('import { d } from "@/server/a/d.ts";');
    expect(fixed["server/a/b/f.ts"]).toStartWith('import { e } from "./e.ts";');
  });

  test("a helper is a module named for what it does, anywhere", async () => {
    expect(
      await lintRepo(
        {
          "server/services/x/helpers.ts": "export const x = 1;\n",
          "client/src/lib/helpers.tsx": "export const y = 1;\n",
          "server/services/x/editable.ts": "export const z = 1;\n",
          "tests/helpers.ts": "export const t = 1;\n",
          "tests/support/users.ts": "export const s = 1;\n",
          "database/seeds/helpers.ts": "export const d = 1;\n",
          "shared/utils.ts": "export const u = 1;\n",
          "server/utils/format.ts": "export const f = 1;\n",
        },
        ["no-helpers-modules"],
      ),
    ).toEqual([
      "no-helpers-modules client/src/lib/helpers.tsx",
      "no-helpers-modules database/seeds/helpers.ts",
      "no-helpers-modules server/services/x/helpers.ts",
      "no-helpers-modules server/utils/format.ts",
      "no-helpers-modules shared/utils.ts",
      "no-helpers-modules tests/helpers.ts",
    ]);
  });

  test("only the repositories' instances module builds a repository", async () => {
    expect(
      await lintRepo(
        {
          "server/repositories/instances.ts": "export const Feats = new FeatsRepository();\n",
          "server/services/s.ts": "export const feats = new FeatsRepository();\n",
        },
        ["repository-instances"],
      ),
    ).toEqual(["repository-instances server/services/s.ts"]);
  });

  test("a route's params are camelCase, its fixed segments kebab-case, it validates with the app's validate, its params by a named schema, and it doesn't catch", async () => {
    expect(
      await lintRepo(
        {
          "server/routers/api/good.ts": 'export const r = app.get("/:id/feats/:featId", (c) => c);\n',
          "server/routers/api/params.ts": 'export const r = app.get("/:id/feats/:feat_id", (c) => c);\n',
          "server/routers/api/zod.ts":
            'import { zValidator } from "@hono/zod-validator";\nexport const z = zValidator;\n',
          "server/middlewares/validate.ts":
            'import { zValidator } from "@hono/zod-validator";\nexport const z = zValidator;\n',
          "server/routers/api/caught.ts": "export const r = () => {\n  try {\n    f();\n  } catch {}\n};\n",
          "server/routers/static.ts": "export const r = () => {\n  try {\n    f();\n  } catch {}\n};\n",
          "server/routers/api/cleanup.ts":
            "export const r = () => {\n  try {\n    f();\n  } finally {\n    g();\n  }\n};\n",
          "server/routers/api/sub.ts": 'export const r = app.route("/:rule_set", sub);\n',
          "server/routers/api/on.ts": 'export const r = app.on("GET", "/:item_id", (c) => c);\n',
          "server/routers/api/template.ts": "export const r = app.get(`/:level_id`, (c) => c);\n",
          "server/routers/api/snake.ts": 'export const r = app.get("/:id/class_levels/:levelId", (c) => c);\n',
          "server/routers/api/status.ts": 'export const r = app.get("/:id", (c) => c.json({ ok: true }, 200));\n',
          "server/routers/api/nostatus.ts": 'export const r = app.get("/:id", (c) => c.json({ ok: true }));\n',
          "server/routers/api/camel.ts": 'export const r = app.post("/:id/spellsKnown", (c) => c);\n',
          "server/routers/files.ts":
            'export const r = app.get("/robots.txt", (c) => c).get("/assets/*", (c) => c).get("/:id/class-levels", (c) => c);\n',
          "server/routers/api/reexport.ts": 'export { zValidator } from "@hono/zod-validator";\n',
          "server/routers/api/named.ts":
            'export const r = app.get("/:id", validate("param", idParam), validate("json", z.object({})), (c) => c);\n',
          "server/routers/api/inline.ts":
            'export const r = app.get("/:id", validate("param", z.object({ id: z.string() })), (c) => c);\n',
          "server/routers/api/extended.ts":
            'export const r = app.get("/:id/:featId", validate("param", idParam.extend({ featId: z.string() })), (c) => c);\n',
        },
        ["route-conventions"],
      ),
    ).toEqual([
      "route-conventions server/routers/api/camel.ts",
      "route-conventions server/routers/api/caught.ts",
      "route-conventions server/routers/api/extended.ts",
      "route-conventions server/routers/api/inline.ts",
      "route-conventions server/routers/api/nostatus.ts",
      "route-conventions server/routers/api/on.ts",
      "route-conventions server/routers/api/params.ts",
      "route-conventions server/routers/api/reexport.ts",
      "route-conventions server/routers/api/snake.ts",
      "route-conventions server/routers/api/sub.ts",
      "route-conventions server/routers/api/template.ts",
      "route-conventions server/routers/api/zod.ts",
    ]);
  });

  test("a route that renders or queues a PDF takes exportRateLimit", async () => {
    expect(
      await lintRepo(
        {
          "server/routers/api/limited.ts":
            'export const r = app.post("/:id/pdf", denyDemoUser, exportRateLimit, (c) => c).get("/:id/pdfs", (c) => c);\n',
          "server/routers/api/shared.ts": 'export const r = app.get("/characters/:shareToken/pdf", (c) => c);\n',
          "server/routers/api/queued.ts": 'export const r = app.post("/:id/pdf", denyDemoUser, (c) => c);\n',
        },
        ["route-conventions"],
      ),
    ).toEqual(["route-conventions server/routers/api/queued.ts", "route-conventions server/routers/api/shared.ts"]);
  });

  test("a route's body and query are written in it, its handler destructures what it reads, and a router is its module's export", async () => {
    expect(
      await lintRepo(
        {
          "server/routers/api/inline.ts": 'export const r = app.post("/", validate("json", z.object({})), (c) => c);\n',
          "server/routers/api/shared.ts":
            'const itemBody = z.object({});\nexport const r = app.post("/", validate("json", itemBody), (c) => c).put("/", validate("json", itemBody), (c) => c);\n',
          "server/routers/api/once.ts":
            'const itemBody = z.object({});\nexport const r = app.post("/", validate("json", itemBody), (c) => c);\n',
          "server/routers/api/imported.ts":
            'import { itemBody } from "./x.ts";\nexport const r = app.post("/", validate("json", itemBody), (c) => c).put("/", validate("json", itemBody), (c) => c);\n',
          "server/routers/api/misnamed.ts":
            'import { featId } from "./x.ts";\nexport const r = app.get("/:featId", validate("param", featId), (c) => c);\n',
          "server/routers/api/suffix.ts": "const hdSchema = z.number();\nexport const r = hdSchema;\n",
          "server/routers/api/destructured.ts": routeReading(
            '  const { id } = c.req.valid("param");\n  const { name } = c.req.valid("json");\n  return S.f(id, name);',
          ),
          "server/routers/api/whole.ts": routeReading(
            '  const { id } = c.req.valid("param");\n  const body = c.req.valid("json");\n  return S.f(id, { ...body });',
          ),
          "server/routers/api/params.ts": routeReading(
            '  const params = c.req.valid("param");\n  return S.f(params.id);',
          ),
          "server/routers/api/data.ts": routeReading('  const data = c.req.valid("json");\n  return S.f(data);'),
          "server/routers/api/fields.ts": routeReading(
            '  const query = c.req.valid("query");\n  return S.f(query.search, query.page);',
          ),
          "server/routers/api/derived.ts":
            'const itemBody = z.object({});\nexport const r = app.post("/", validate("json", itemBody), (c) => c).put("/", validate("json", itemBody.partial()), (c) => c);\n',
          "server/routers/api/derivedMisnamed.ts":
            'const base = z.object({});\nexport const r = app.post("/", validate("json", base.extend({})), (c) => c).put("/", validate("json", base.partial()), (c) => c);\n',
          "server/routers/api/derivedOnce.ts":
            'const itemBody = z.object({});\nexport const r = app.put("/", validate("json", itemBody.partial()), (c) => c);\n',
          "server/routers/api/declared.ts":
            'async function create(c) {\n  const body = c.req.valid("json");\n  return c.json(await S.create(body), 200);\n}\nexport const r = app.post("/", validate("json", z.object({})), create);\n',
          "server/routers/api/destructuredLater.ts": routeReading(
            '  const body = c.req.valid("json");\n  const { name } = body;\n  return S.f(name);',
          ),
          "server/routers/api/inlineRead.ts": routeReading('  return S.f(c.req.valid("param"));'),
          "server/routers/api/exported.ts": 'export default new Hono().get("/", (c) => c);\n',
          "server/routers/api/named.ts": 'const r = new Hono().get("/", (c) => c);\nexport default r;\n',
        },
        ["route-conventions"],
      ),
    ).toEqual([
      "route-conventions server/routers/api/data.ts",
      "route-conventions server/routers/api/derivedMisnamed.ts",
      "route-conventions server/routers/api/derivedOnce.ts",
      "route-conventions server/routers/api/destructuredLater.ts",
      "route-conventions server/routers/api/fields.ts",
      "route-conventions server/routers/api/imported.ts",
      "route-conventions server/routers/api/imported.ts",
      "route-conventions server/routers/api/inlineRead.ts",
      "route-conventions server/routers/api/misnamed.ts",
      "route-conventions server/routers/api/named.ts",
      "route-conventions server/routers/api/named.ts",
      "route-conventions server/routers/api/once.ts",
      "route-conventions server/routers/api/params.ts",
      "route-conventions server/routers/api/suffix.ts",
    ]);
  });

  test("the server sorts through the repository's orderBy, and a page by pageOrder", async () => {
    expect(
      await lintRepo(
        {
          "server/repositories/BaseRepository.ts":
            'import { asc, desc } from "drizzle-orm";\nexport const o = [asc, desc];\n',
          "server/repositories/Feats.ts": 'import { desc, eq } from "drizzle-orm";\nexport const o = [desc, eq];\n',
          "scripts/report.ts": 'import { asc } from "drizzle-orm";\nexport const o = asc;\n',
          "server/repositories/Orm.ts": 'import * as orm from "drizzle-orm";\nexport const o = [orm.desc, orm.eq];\n',
          "server/repositories/Paged.ts":
            "export class R {\n  findPage(db, p) {\n    return this.withPagination(p, () => db.select().orderBy(...this.pageOrder(this.orderBy(n))));\n  }\n}\n",
          "server/repositories/Unordered.ts":
            "export class R {\n  findPage(db, p) {\n    return this.withPagination(p, () => db.select().orderBy(this.orderBy(n)));\n  }\n}\n",
          "server/repositories/Raw.ts":
            "export class R {\n  findPage(db, p) {\n    const { limit } = this.paginate(p);\n    return db.select().limit(limit);\n  }\n}\n",
          "server/repositories/Sliced.ts":
            "export class R {\n  async findPage(db, p) {\n    return this.paginated(await db.select().offset(p.page), p);\n  }\n}\n",
          "server/repositories/concerns/Paginates.ts":
            "export class P {\n  withPagination(q, f) {\n    return f(this.paginate(q));\n  }\n}\n",
        },
        ["order-through-repository"],
      ),
    ).toEqual([
      "order-through-repository server/repositories/Feats.ts",
      "order-through-repository server/repositories/Orm.ts",
      "order-through-repository server/repositories/Raw.ts",
      "order-through-repository server/repositories/Sliced.ts",
      "order-through-repository server/repositories/Unordered.ts",
    ]);
  });

  test("shared/ and engine/ import neither Bun's APIs nor Node's", async () => {
    expect(
      await lintRepo(
        {
          "shared/a.ts": 'import fs from "node:fs";\nexport const a = fs;\n',
          "shared/b.ts": 'import { $ } from "bun";\nexport const b = $;\n',
          "server/c.ts": 'import fs from "node:fs";\nexport const c = fs;\n',
          "shared/d.ts": 'import path from "path";\nexport const d = path;\n',
          "shared/e.ts": 'export const e = () => Bun.file("x");\n',
          "shared/f.ts": "export const f = { Bun: 1 }.Bun;\n",
          "engine/core/g.ts": 'import fs from "node:fs";\nexport const g = fs;\n',
        },
        ["shared-runtime"],
      ),
    ).toEqual([
      "shared-runtime engine/core/g.ts",
      "shared-runtime shared/a.ts",
      "shared-runtime shared/b.ts",
      "shared-runtime shared/d.ts",
      "shared-runtime shared/e.ts",
    ]);
  });

  test("an engine module outside its API exports no function of its own", async () => {
    expect(
      await lintRepo(
        {
          "engine/api/ops.ts": "export function describeThing() {\n  return 1;\n}\n",
          "engine/core/Good.ts": [
            "function step() {",
            "  return 1;",
            "}",
            "export type Shape = { a: number };",
            "export const LIMITS = { max: 3 };",
            "export function Concern<B>(Base: B) {",
            "  return Base;",
            "}",
            "export default class Good {",
            "  static run() {",
            "    return step();",
            "  }",
            "}",
            "",
          ].join("\n"),
          "engine/core/declared.ts": "export function helper() {\n  return 1;\n}\n",
          "engine/core/held.ts": "export const helper = () => 1;\n",
          "engine/core/listed.ts": "function helper() {\n  return 1;\n}\nexport { helper };\n",
          "engine/core/renamed.ts": "function helper() {\n  return 1;\n}\nexport { helper as Helper };\n",
          "engine/core/cast.ts": "export const helper = (() => 1) as () => number;\n",
          "engine/core/underscored.ts": "export function _helper() {\n  return 1;\n}\n",
          "engine/core/defaulted.ts": "export default function helper() {\n  return 1;\n}\n",
          "engine/index.ts": 'export { describeThing } from "./api/ops.ts";\n',
          "server/x.ts": "export function helper() {\n  return 1;\n}\n",
        },
        ["engine-classes"],
      ),
    ).toEqual([
      "engine-classes engine/core/cast.ts",
      "engine-classes engine/core/declared.ts",
      "engine-classes engine/core/defaulted.ts",
      "engine-classes engine/core/held.ts",
      "engine-classes engine/core/listed.ts",
      "engine-classes engine/core/renamed.ts",
      "engine-classes engine/core/underscored.ts",
    ]);
  });

  test("engine/ computes without waiting: no async function, no await, no Promise", async () => {
    expect(
      await lintRepo(
        {
          "engine/core/a.ts": "export async function a() {}\n",
          "engine/core/b.ts": "export const b = async () => 1;\n",
          "engine/rulesets/c.ts": "export class C {\n  async c() {}\n}\n",
          "engine/rulesets/d.ts": "export function d(): Promise<number> {\n  return f();\n}\n",
          "engine/rulesets/e.ts": "export const e = await f();\n",
          "engine/rulesets/f.ts": "export function f(x: number) {\n  return [x].map((y) => y + 1);\n}\n",
          "engine/rulesets/g.ts": "export const g = () => Promise.resolve(1);\n",
          "engine/rulesets/h.ts": "export const h = new Promise(() => {});\n",
          "engine/rulesets/i.ts": "export const i = [];\nfor await (const x of y) i.push(x);\n",
          "server/g.ts": "export async function g() {\n  await f();\n}\n",
        },
        ["engine-sync"],
      ),
    ).toEqual([
      "engine-sync engine/core/a.ts",
      "engine-sync engine/core/b.ts",
      "engine-sync engine/rulesets/c.ts",
      "engine-sync engine/rulesets/d.ts",
      "engine-sync engine/rulesets/e.ts",
      "engine-sync engine/rulesets/g.ts",
      "engine-sync engine/rulesets/h.ts",
      "engine-sync engine/rulesets/i.ts",
    ]);
  });

  test("a repository write or lock outside the repositories takes a transaction's handle", async () => {
    expect(
      await lintRepo(
        {
          "server/services/good.ts": [
            'import { Feats, Skills } from "@/server/repositories/index.ts";',
            "export const f = (tx: Db, db: Db) => [",
            "  Feats.create(tx, {}),",
            "  Feats.lock(tx, { id }),",
            "  Feats.findOne(db, { id }),",
            "  Skills.countPerRuleset(db, {}),",
            "  Other.create(db, {}),",
            "];",
            "",
          ].join("\n"),
          "server/services/db.ts":
            'import { Feats } from "@/server/repositories/index.ts";\nexport const f = () => Feats.delete(db, { id });\n',
          "server/jobs/many.ts":
            'import { Notifications } from "@/server/repositories/index.ts";\nexport const f = () =>\n  Notifications.createMany(\n    db,\n    [],\n  );\n',
          "server/services/lock.ts":
            'import { Feats } from "@/server/repositories/index.ts";\nexport const f = (database: Db) => Feats.lock(database, { id });\n',
          "server/repositories/inside.ts":
            'import { Feats } from "@/server/repositories/index.ts";\nexport const f = () => Feats.delete(db, { id });\n',
        },
        ["writes-in-transactions"],
      ),
    ).toEqual([
      "writes-in-transactions server/jobs/many.ts",
      "writes-in-transactions server/services/db.ts",
      "writes-in-transactions server/services/lock.ts",
    ]);
  });

  test("an empty list is checked in its repository's read, which answers it without a query, never by a caller", async () => {
    const reading = (body: string) =>
      lines(
        'import { Feats, Rulesets } from "@/server/repositories/index.ts";',
        `export async function f(db: Db, ids: string[], rows: R[]) {`,
        body,
        "}",
      );
    const repository = (body: string) =>
      lines("export class XRepository {", "  async findMany(db: Db, where: { ids: string[] }) {", body, "  }", "}");
    expect(
      await lintRepo(
        {
          "server/services/ternary.ts": reading("  return ids.length > 0 ? await Feats.findMany(db, { ids }) : [];"),
          "server/services/resolved.ts": reading(
            "  return ids.length === 0 ? Promise.resolve([]) : Feats.findMany(db, { ids: ids.map(canonical) });",
          ),
          "server/services/early.ts": reading(
            "  if (!ids.length) return [];\n  return await Feats.findMany(db, { ids });",
          ),
          "server/services/block.ts": reading(
            "  if (ids.length > 0) {\n    await Feats.findPicks(db, { characterLevelIds: ids });\n  }",
          ),
          "server/services/plain.ts": reading("  return await Feats.findMany(db, { ids });"),
          "server/services/write.ts": reading(
            "  if (rows.length === 0) return [];\n  return await Feats.createMany(tx, rows);",
          ),
          "server/services/other.ts": reading("  return ids.length > 0 ? describe(ids) : [];"),
          "server/services/key.ts": reading(
            "  if (ids.length === 0) return [];\n  return await Feats.findMany(db, { ids: otherIds });",
          ),
          "server/services/member.ts": reading(
            "  if (ids.length === 0) return [];\n  return await Feats.findMany(db, { ids: other.ids });",
          ),
          "server/services/more.ts": reading(
            "  if (ids.length === 0) return [];\n  const ruleset = await Rulesets.findOne(db, { id });\n  return await Feats.findMany(db, { ids });",
          ),
          "server/repositories/unchecked.ts": repository(
            "    return await db.select().from(t).where(and(inArray(t.id, where.ids), isNull(t.deletedAt)));",
          ),
          "server/repositories/checked.ts": repository(
            "    if (where.ids.length === 0) return [];\n    return await db.select().from(t).where(inArray(t.id, where.ids));",
          ),
          "server/repositories/optional.ts": repository(
            "    return await db.select().from(t).where(or(eq(t.own, true), inArray(t.id, where.ids)));",
          ),
        },
        ["empty-list-reads"],
      ),
    ).toEqual([
      "empty-list-reads server/repositories/unchecked.ts",
      "empty-list-reads server/services/block.ts",
      "empty-list-reads server/services/early.ts",
      "empty-list-reads server/services/resolved.ts",
      "empty-list-reads server/services/ternary.ts",
    ]);
  });

  test("a repository read says it found nothing with undefined, never null", async () => {
    const repository = (method: string) => lines("export class XRepository {", method, "}");
    expect(
      await lintRepo(
        {
          "server/repositories/fallback.ts": repository(
            "  async findRole(db: Db, where: W) {\n    const row = await db.query.x.findFirst({ where });\n    return row?.role ?? null;\n  }",
          ),
          "server/repositories/first.ts": repository(
            "  async findOneWithBlob(db: Db, where: W) {\n    const rows = await db.select().from(t);\n    return rows[0] || null;\n  }",
          ),
          "server/repositories/literal.ts": repository(
            "  async findOne(db: Db, where: W) {\n    if (!where.id) return null;\n    return await db.query.x.findFirst({ where });\n  }",
          ),
          "server/repositories/typed.ts": repository(
            "  async findName(db: Db, where: W): Promise<string | null> {\n    return (await db.query.x.findFirst({ where }))?.name;\n  }",
          ),
          "server/repositories/nullable.ts": repository(
            "  async findDescription(db: Db, where: W): Promise<string | null | undefined> {\n    return (await db.query.x.findFirst({ where }))?.description;\n  }",
          ),
          "server/repositories/plain.ts": repository(
            "  async findOne(db: Db, where: W) {\n    const [row] = await db.select().from(t);\n    return row;\n  }",
          ),
          "server/repositories/column.ts": repository(
            "  async findMany(db: Db, where: W): Promise<{ description: string | null }[]> {\n    const rows = await db.select().from(t);\n    return rows.map((row) => ({ description: row.description ?? null }));\n  }",
          ),
          "server/repositories/write.ts": repository(
            "  async update(db: Db, values: V, where: W) {\n    const [row] = await db.update(t).set(values).returning();\n    return row ?? null;\n  }",
          ),
          "server/services/service.ts": "export function f(row?: R) {\n  return row ?? null;\n}\n",
        },
        ["no-null-reads"],
      ),
    ).toEqual([
      "no-null-reads server/repositories/fallback.ts",
      "no-null-reads server/repositories/first.ts",
      "no-null-reads server/repositories/literal.ts",
      "no-null-reads server/repositories/typed.ts",
    ]);
  });

  test("a transaction's queries run one at a time, never in a Promise.all", async () => {
    expect(
      await lintRepo(
        {
          "server/services/serial.ts": [
            'import { Feats, Skills } from "@/server/repositories/index.ts";',
            "export const f = async (tx: Db) => {",
            "  await Feats.findOne(tx, { id });",
            "  await Skills.findOne(tx, { id });",
            "};",
            "",
          ].join("\n"),
          "server/services/pool.ts": [
            'import { Feats, Skills } from "@/server/repositories/index.ts";',
            "export const f = () => Promise.all([Feats.findOne(db, { id }), Skills.findOne(db, { id })]);",
            "",
          ].join("\n"),
          "server/services/concurrent.ts": [
            'import { Feats } from "@/server/repositories/index.ts";',
            "export const f = (ids: string[]) =>",
            "  withTransaction((tx) => Promise.all(ids.map((id) => Feats.update(tx, {}, { id }))));",
            "",
          ].join("\n"),
          "server/services/helper.ts": "export const f = (tx: Db) => Promise.allSettled([purge(tx), open(tx)]);\n",
          "server/services/handle.ts": [
            'import { Feats, Skills } from "@/server/repositories/index.ts";',
            "export const f = (db: Db) => Promise.all([Feats.findOne(db, { id }), Skills.findOne(db, { id })]);",
            "",
          ].join("\n"),
        },
        ["writes-in-transactions"],
      ),
    ).toEqual([
      "writes-in-transactions server/services/concurrent.ts",
      "writes-in-transactions server/services/handle.ts",
      "writes-in-transactions server/services/helper.ts",
    ]);
  });

  test("no comment turns a rule off, whatever its reason", async () => {
    expect(
      await lintRepo(
        {
          "server/why.ts": "// oxlint-disable-next-line no-console -- startup logs go to stdout\nconsole.log(1);\n",
          "client/src/wrapped.ts": "/* eslint-disable no-console */\nconsole.log(1);\n",
          "tests/line.ts": "console.log(1); // eslint-disable-line no-console\n",
          "server/clean.ts": "// Logs go to stdout\nconsole.log(1);\n",
        },
        ["no-disable-comments"],
      ),
    ).toEqual([
      "no-disable-comments client/src/wrapped.ts",
      "no-disable-comments server/why.ts",
      "no-disable-comments tests/line.ts",
    ]);
  });

  test("the server reads its environment in server/environment.ts only", async () => {
    expect(
      await lintRepo(
        {
          "server/environment.ts": "export const readEnv = (name: string) => process.env[name];\n",
          "server/services/good.ts":
            'import { readEnv } from "@/server/environment.ts";\nexport const url = readEnv("APP_URL");\n',
          "server/services/process.ts": "export const url = process.env.APP_URL;\n",
          "server/services/bun.ts": "export const url = Bun.env.APP_URL;\n",
          "shared/indexed.ts": 'export const url = process.env["APP_URL"];\n',
          "scripts/db/reset.ts": "export const url = process.env.DATABASE_URL;\n",
        },
        ["environment"],
      ),
    ).toEqual([
      "environment server/services/bun.ts",
      "environment server/services/process.ts",
      "environment shared/indexed.ts",
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
  test("a test named after a module sits at that module's mirror, case and all; a scenario test sits anywhere in its area", async () => {
    expect(
      await lintRepo(
        {
          "server/services/x/FooService.ts": "export default 1;\n",
          "tests/services/x/FooService.test.ts": "export const t = 1;\n",
          "tests/services/FooService.test.ts": "export const t = 1;\n",
          "tests/services/Scenario.test.ts": "export const t = 1;\n",
          "tests/services/x/BarService.test.ts": "export const t = 1;\n",
          "server/services/x/RequirementTree.ts": "export default 1;\n",
          "tests/services/x/requirementTree.test.ts": "export const t = 1;\n",
        },
        ["test-placement"],
      ),
    ).toEqual([
      "test-placement tests/services/FooService.test.ts",
      "test-placement tests/services/x/BarService.test.ts",
      "test-placement tests/services/x/requirementTree.test.ts",
    ]);
  });
  test("a module that exports its class, or the class's shared instance, is named after it", async () => {
    expect(
      await lintRepo(
        {
          "server/FeatsService.ts": "class FeatsService {}\nexport default new FeatsService();\n",
          "server/Telemetry.ts": "export class Telemetry {}\n",
          "server/RequirementTree.ts": "export default class RequirementTree {}\n",
          "client/src/Button.tsx": "export class Button {}\n",
          "server/otel.ts": "class Telemetry {}\nexport default new Telemetry();\n",
          "server/apiError.ts": "export class ApiError extends Error {}\n",
          "server/rulesets/hooks/LevelsHooks.ts": "export class Dnd35LevelsRules {}\n",
          "server/errors/index.ts":
            "export class NotFoundError extends Error {}\nexport class ConflictError extends Error {}\n",
          "server/routers/health.ts": "import { Hono } from 'hono';\nexport default new Hono();\n",
          "server/helpers/kept.ts": "class Kept {}\nexport function run() {\n  return new Kept();\n}\n",
          "server/listed.ts": "class Listed {}\nexport { Listed };\n",
          "server/named.ts": "class Counter {}\nexport const counter = new Counter();\n",
          "server/byName.ts": "class ByName {}\nexport default ByName;\n",
        },
        ["class-file-names"],
      ),
    ).toEqual([
      "class-file-names server/apiError.ts",
      "class-file-names server/byName.ts",
      "class-file-names server/listed.ts",
      "class-file-names server/named.ts",
      "class-file-names server/otel.ts",
      "class-file-names server/rulesets/hooks/LevelsHooks.ts",
    ]);
  });
  test("a concern sits in its file, its class is named for what it adds, and it holds no state", async () => {
    const concern = (fn: string, cls: string, member = "m() {}") =>
      `export function ${fn}<B extends Constructor<Base>>(Base: B) {\n  abstract class ${cls} extends Base {\n    ${member}\n  }\n  return ${cls};\n}\n`;
    expect(
      await lintRepo(
        {
          "server/a/Archives.ts": concern("Archives", "Archiving"),
          "server/a/Searches.ts": concern("Searches", "Searching"),
          "server/a/Stars.ts": concern("Stars", "Starring"),
          "server/a/ScopesToRuleset.ts": concern("ScopesToRuleset", "ScopingToRuleset"),
          "server/a/ArmorClass.ts": concern("ArmorClass", "WithArmorClass"),
          "server/a/AppliesBonuses.ts": concern("AppliesBonuses", "ApplyingBonuses"),
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
  test("a policy is built by its `for`, its only static and its only async method", async () => {
    const policy = (member: string) => `export default class FeatsPolicy extends BasePolicy<Feat> {\n  ${member}\n}\n`;
    expect(
      await lintRepo(
        {
          "server/services/policies/FeatsPolicy.ts": policy(
            "static async for(db: Db) {\n    return new FeatsPolicy(db);\n  }",
          ),
          "server/services/policies/Checks.ts": policy("canUpdate() {\n    return true;\n  }"),
          "server/services/policies/Queries.ts": policy("async canUpdate() {\n    return true;\n  }"),
          "server/services/policies/Statics.ts": policy("static canRead() {\n    return true;\n  }"),
          "server/services/feats/FeatsService.ts": "export const p = new FeatsPolicy(session, feat);\n",
          "server/services/feats/Built.ts": "export const p = await FeatsPolicy.for(db, session, feat);\n",
          "tests/services/policies/FeatsPolicy.test.ts": "export const p = new FeatsPolicy(session, feat);\n",
        },
        ["policy-shape"],
      ),
    ).toEqual([
      "policy-shape server/services/feats/FeatsService.ts",
      "policy-shape server/services/policies/Queries.ts",
      "policy-shape server/services/policies/Statics.ts",
    ]);
  });

  test("whether a value is one of a list is isOneOf, never a .some comparing each", async () => {
    expect(
      await lintRepo(
        {
          "shared/a.ts": "export const a = (x: string) => TYPES.some((type) => type === x);\n",
          "client/src/b.ts": "export const b = (x: string) => TYPES.some((type) => x === type);\n",
          // A field compared, a missing value, a comparison that reads its item twice: not a value among a list's
          "server/c.ts": "export const c = (x: string) => rows.some((row) => row.id === x);\n",
          "server/d.ts": "export const d = ids.some((id) => id === undefined);\n",
          "server/e.ts": "export const e = items.some((item) => item === item.parent);\n",
          "shared/isOneOf.ts": "export const i = (v: unknown, o: string[]) => o.some((option) => option === v);\n",
          "content/f.ts": "export const f = (x: string) => NAMES.some((name) => name === x);\n",
        },
        ["one-of"],
      ),
    ).toEqual(["one-of client/src/b.ts", "one-of shared/a.ts"]);
  });

  test("an error is named error: a catch's binding and an onError callback's first parameter", async () => {
    expect(
      await lintRepo(
        {
          "server/a.ts": "export function a() {\n  try {\n    run();\n  } catch (err) {\n    log(err);\n  }\n}\n",
          "server/b.ts": "export function b() {\n  try {\n    run();\n  } catch (error) {\n    log(error);\n  }\n}\n",
          "server/c.ts": "export function c() {\n  try {\n    run();\n  } catch {\n    log();\n  }\n}\n",
          "client/src/d.ts": "export const d = { onError: (e: unknown) => log(e) };\n",
          "client/src/e.ts":
            "export const e = { onError: (error: unknown) => log(error), onSuccess: (data: unknown) => log(data) };\n",
        },
        ["error-names"],
      ),
    ).toEqual(["error-names client/src/d.ts", "error-names server/a.ts"]);
  });

  test("a file's own function is a declaration, and --fix declares a const's arrow", async () => {
    expect(
      await lintRepo(
        {
          "server/a.ts": "export function f() {}\nconst g = () => 1;\nexport const h = async (a: number) => a;\n",
          // Typed by a function type, or held by a `let`: still a variable holding an arrow
          "server/b.ts": 'import type { Task } from "@/t.ts";\nexport const run: Task = async () => {};\n',
          "shared/c.ts": "let k = () => 1;\nk = () => 2;\nexport { k };\n",
        },
        ["function-declarations"],
      ),
    ).toEqual([
      "function-declarations server/a.ts",
      "function-declarations server/a.ts",
      "function-declarations server/b.ts",
      "function-declarations shared/c.ts",
    ]);

    const fixed = await fixRepo(
      {
        "a.tsx": lines(
          "/** Its verb. */",
          'export const verbOf = (method: string) => /^[a-z]+/.exec(method)?.[0] ?? "";',
          "const make = async <T,>(t: T): Promise<T> => {",
          "  return t;",
          "};",
          "const Row = ({ label }: { label: string }) => <div>{label}</div>;",
        ),
      },
      ["function-declarations"],
    );
    expect(fixed["a.tsx"]).toBe(
      [
        "/** Its verb. */",
        "export function verbOf(method: string) {",
        '  return /^[a-z]+/.exec(method)?.[0] ?? "";',
        "}",
        "async function make<T>(t: T): Promise<T> {",
        "  return t;",
        "}",
        "function Row({ label }: { label: string }) {",
        "  return <div>{label}</div>;",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("a class includes its concerns by name, after its base, and --fix sorts them", async () => {
    expect(
      await lintRepo(
        {
          "server/a.ts": "class A extends include(Base, Paginates, Searches) {}\n",
          "server/b.ts": "class B extends include(Base, Searches, Paginates, ChecksExistence) {}\n",
          "server/c.ts": "class C extends include(Base, Archives) {}\n",
        },
        ["include-order"],
      ),
    ).toEqual(["include-order server/b.ts"]);

    const fixed = await fixRepo(
      { "b.ts": "class B extends include(\n  Base,\n  Searches,\n  Paginates,\n  ChecksExistence,\n) {}\n" },
      ["include-order"],
    );
    expect(fixed["b.ts"]).toBe(
      "class B extends include(\n  Base,\n  ChecksExistence,\n  Paginates,\n  Searches,\n) {}\n",
    );
  });
});
