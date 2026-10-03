import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareRoutes, verbGroup } from "@/lint/memberOrder.mjs";

const [READ, CREATE, UPDATE, DELETE, ACTION] = [0, 1, 2, 3, 4];

describe("member order", () => {
  test("groups a method by its leading verb", () => {
    expect(["findOne", "getRulesetFeats", "exists", "countActive"].map(verbGroup)).toEqual([READ, READ, READ, READ]);
    expect(["create", "createMany", "bulkCreateVariants", "duplicateRulesetItem"].map(verbGroup)).toEqual([
      CREATE,
      CREATE,
      CREATE,
      CREATE,
    ]);
    expect(["update", "markAllRead", "setPassword"].map(verbGroup)).toEqual([UPDATE, UPDATE, UPDATE]);
    expect(["delete", "archiveCharacter", "unarchive", "hardDeleteCampaign"].map(verbGroup)).toEqual([
      DELETE,
      DELETE,
      DELETE,
      DELETE,
    ]);
    // A verb is a whole word: `getter` isn't `get`, and the rest are actions.
    expect(["getter", "publishRuleset", "lockById", "me"].map(verbGroup)).toEqual([ACTION, ACTION, ACTION, ACTION]);
  });

  test("orders routes by method, then by path: a fixed segment before a parameter, a parameter before a wildcard", () => {
    const routes = [
      { method: "delete", path: "/:id" },
      { method: "get", path: "/:id" },
      { method: "post", path: "/" },
      { method: "get", path: "/:id/feats/:featId" },
      { method: "get", path: "/:id/feats/grouped" },
      { method: "get", path: "/" },
      { method: "get", path: "*" },
      { method: "put", path: "/:id" },
    ];
    expect([...routes].sort(compareRoutes).map((r) => `${r.method} ${r.path}`)).toEqual([
      "get /",
      "get /:id",
      "get /:id/feats/grouped",
      "get /:id/feats/:featId",
      "get *",
      "post /",
      "put /:id",
      "delete /:id",
    ]);
  });

  test("puts a class and a router in order with oxlint --fix, keeping comments and middleware runs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    fs.mkdirSync(path.join(dir, "server/routers"), { recursive: true });
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({
        jsPlugins: [path.resolve("lint/memberOrder.mjs")],
        rules: { "arkyvree/member-order": "error" },
      }),
    );
    const service = path.join(dir, "FeatsService.ts");
    fs.writeFileSync(
      service,
      [
        "class FeatsService {",
        "  private helper() {}",
        "",
        "  /** Deletes. */",
        "  async deleteFeat() {}",
        "",
        "  async getFeats() {}",
        "",
        "  async publish() {}",
        "",
        "  async createFeat() {}",
        "}",
        "",
      ].join("\n"),
    );
    const router = path.join(dir, "server/routers/feats.ts");
    fs.writeFileSync(
      router,
      [
        "export default new Hono()",
        '  .delete("/:id", (c) => c)',
        "  // The list.",
        '  .get("/", (c) => c)',
        "  .use(middleware)",
        '  .post("/", (c) => c)',
        '  .get("/:id", (c) => c);',
        "",
      ].join("\n"),
    );
    const oxlint = path.resolve("node_modules/.bin/oxlint");
    Bun.spawnSync([oxlint, "-c", config, "--fix", dir]);

    expect(fs.readFileSync(service, "utf8")).toBe(
      [
        "class FeatsService {",
        "  private helper() {}",
        "",
        "  async getFeats() {}",
        "",
        "  async createFeat() {}",
        "",
        "  /** Deletes. */",
        "  async deleteFeat() {}",
        "",
        "  async publish() {}",
        "}",
        "",
      ].join("\n"),
    );
    // Each run between middleware is sorted on its own: the middleware still applies to what follows it.
    expect(fs.readFileSync(router, "utf8")).toBe(
      [
        "export default new Hono()",
        "  // The list.",
        '  .get("/", (c) => c)',
        '  .delete("/:id", (c) => c)',
        "  .use(middleware)",
        '  .get("/:id", (c) => c)',
        '  .post("/", (c) => c);',
        "",
      ].join("\n"),
    );
    const check = Bun.spawnSync([oxlint, "-c", config, dir]);
    expect(check.exitCode).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
});
