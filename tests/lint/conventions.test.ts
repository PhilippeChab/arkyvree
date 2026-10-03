import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { lintRepo, runOxlint } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("conventions", () => {
  test("a file imports another folder's module through @/, and --fix rewrites a ../ import", () => {
    expect(
      lintRepo(
        {
          "server/a/b/c.ts": 'import { d } from "../d.ts";\nimport { e } from "./e.ts";\nexport const c = [d, e];\n',
          "server/a/b/e.ts": 'import { d } from "@/server/a/d.ts";\nexport const e = d;\n',
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
    runOxlint(["-c", config, "--fix", dir]);
    expect(fs.readFileSync(path.join(dir, "server/a/b/c.ts"), "utf8")).toStartWith(
      'import { d } from "@/server/a/d.ts";',
    );
    fs.rmSync(dir, { recursive: true });
  });

  test("a helper is a module named for what it does, in the app's code", () => {
    expect(
      lintRepo(
        {
          "server/services/x/helpers.ts": "export const x = 1;\n",
          "client/src/lib/helpers.tsx": "export const y = 1;\n",
          "server/services/x/editable.ts": "export const z = 1;\n",
          "tests/helpers.ts": "export const t = 1;\n",
        },
        ["no-helpers-modules"],
      ),
    ).toEqual(["no-helpers-modules client/src/lib/helpers.tsx", "no-helpers-modules server/services/x/helpers.ts"]);
  });

  test("only the repositories' index builds a repository", () => {
    expect(
      lintRepo(
        {
          "server/repositories/index.ts": "export const Feats = new FeatsRepository();\n",
          "server/services/s.ts": "export const feats = new FeatsRepository();\n",
        },
        ["repository-instances"],
      ),
    ).toEqual(["repository-instances server/services/s.ts"]);
  });

  test("a route's params are camelCase, it validates with the app's zValidator, and it doesn't catch", () => {
    expect(
      lintRepo(
        {
          "server/routers/api/good.ts": 'export const r = app.get("/:id/feats/:featId", (c) => c);\n',
          "server/routers/api/params.ts": 'export const r = app.get("/:id/feats/:feat_id", (c) => c);\n',
          "server/routers/api/zod.ts":
            'import { zValidator } from "@hono/zod-validator";\nexport const z = zValidator;\n',
          "server/middlewares/zValidator.ts":
            'import { zValidator } from "@hono/zod-validator";\nexport const z = zValidator;\n',
          "server/routers/api/caught.ts": "export const r = () => {\n  try {\n    f();\n  } catch {}\n};\n",
          "server/routers/static.ts": "export const r = () => {\n  try {\n    f();\n  } catch {}\n};\n",
        },
        ["route-conventions"],
      ),
    ).toEqual([
      "route-conventions server/routers/api/caught.ts",
      "route-conventions server/routers/api/params.ts",
      "route-conventions server/routers/api/zod.ts",
    ]);
  });

  test("the server sorts through the repository's orderBy", () => {
    expect(
      lintRepo(
        {
          "server/repositories/BaseRepository.ts":
            'import { asc, desc } from "drizzle-orm";\nexport const o = [asc, desc];\n',
          "server/repositories/Feats.ts": 'import { desc, eq } from "drizzle-orm";\nexport const o = [desc, eq];\n',
          "scripts/report.ts": 'import { asc } from "drizzle-orm";\nexport const o = asc;\n',
        },
        ["order-through-repository"],
      ),
    ).toEqual(["order-through-repository server/repositories/Feats.ts"]);
  });

  test("shared/ imports neither Bun's APIs nor Node's", () => {
    expect(
      lintRepo(
        {
          "shared/a.ts": 'import fs from "node:fs";\nexport const a = fs;\n',
          "shared/b.ts": 'import { $ } from "bun";\nexport const b = $;\n',
          "server/c.ts": 'import fs from "node:fs";\nexport const c = fs;\n',
        },
        ["shared-runtime"],
      ),
    ).toEqual(["shared-runtime shared/a.ts", "shared-runtime shared/b.ts"]);
  });

  test("a Session parameter is named session", () => {
    expect(
      lintRepo(
        {
          "server/services/good.ts":
            "export function f(session: Session, _session: Session) {}\nexport class P {\n  constructor(protected readonly session: Session) {}\n}\n",
          "server/services/bad.ts": "export const f = (s: Session) => s;\n",
          "server/policies/bad.ts": "export class P {\n  constructor(private readonly user: Session) {}\n}\n",
        },
        ["session-param"],
      ),
    ).toEqual(["session-param server/policies/bad.ts", "session-param server/services/bad.ts"]);
  });
});
