import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareRoutes, lifecycleStep, verbGroup } from "@/lint/memberOrder.mjs";

import { runOxlint } from "./lintRepo.ts";

// The fix tests run oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

const [LIFECYCLE, READ, CREATE, UPDATE, DELETE, ACTION] = [0, 1, 2, 3, 4, 5];

describe("member order", () => {
  test("groups a method by its leading verb", async () => {
    expect(["findOne", "getRulesetFeats", "exists", "countActive", "isOwner", "validatePath"].map(verbGroup)).toEqual([
      READ,
      READ,
      READ,
      READ,
      READ,
      READ,
    ]);
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
    // The lifecycle comes first, in pipeline order rather than by name.
    expect(["loadSharedData", "preload", "initialize", "build", "applyLoadedData"].map(verbGroup)).toEqual([
      LIFECYCLE,
      LIFECYCLE,
      LIFECYCLE,
      LIFECYCLE,
      LIFECYCLE,
    ]);
    expect(
      ["build", "applyLoadedData", "preload", "loadSharedData"].sort((a, b) => lifecycleStep(a) - lifecycleStep(b)),
    ).toEqual(["loadSharedData", "preload", "build", "applyLoadedData"]);
    // A verb is a whole word: `getter` isn't `get`, and the rest are actions.
    expect(["getter", "publishRuleset", "lockById", "me"].map(verbGroup)).toEqual([ACTION, ACTION, ACTION, ACTION]);
  });

  test("orders routes by method, then by path: fixed segments before parameters, parameters before wildcards", async () => {
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

  test("puts a class and a router in order with oxlint --fix, keeping fields, comments and middleware runs, sub-routers first", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    fs.mkdirSync(path.join(dir, "server/routers"), { recursive: true });
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({
        jsPlugins: [path.resolve("lint/plugin.mjs")],
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
        "  readonly zz = 1;",
        "",
        "  readonly aa = this.zz + 1;",
        "",
        "  /** Deletes. */",
        "  async deleteFeat() {} // about deleting",
        "",
        "  async getFeats() {}",
        "",
        "  async publish() {} // about publishing",
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
        '  .delete("/:id", (c) => c) // about deleting',
        "  // The list.",
        '  .get("/", (c) => c)',
        '  .route("/", early)',
        "  .use(middleware)",
        '  .post("/", (c) => c)',
        '  .route("/b", b)',
        '  .get("/:id", (c) => c)',
        '  .route("/", a);',
        "",
      ].join("\n"),
    );
    await runOxlint(["-c", config, "--fix", dir]);

    expect(fs.readFileSync(service, "utf8")).toBe(
      [
        "class FeatsService {",
        // Fields keep their order, first: an initializer may read an earlier field.
        "  readonly zz = 1;",
        "",
        "  readonly aa = this.zz + 1;",
        "",
        // Then private methods, then public ones, each in CRUD order.
        "  private helper() {}",
        "",
        "  async getFeats() {}",
        "",
        "  async createFeat() {}",
        "",
        "  /** Deletes. */",
        "  async deleteFeat() {} // about deleting",
        "",
        "  async publish() {} // about publishing",
        "}",
        "",
      ].join("\n"),
    );
    // Each run between middleware is sorted on its own: the middleware still applies to what follows it. A run's
    // sub-routers come first, in their order.
    expect(fs.readFileSync(router, "utf8")).toBe(
      [
        "export default new Hono()",
        '  .route("/", early)',
        "  // The list.",
        '  .get("/", (c) => c)',
        '  .delete("/:id", (c) => c) // about deleting',
        "  .use(middleware)",
        '  .route("/b", b)',
        '  .route("/", a)',
        '  .get("/:id", (c) => c)',
        '  .post("/", (c) => c);',
        "",
      ].join("\n"),
    );
    // A same-line comment on what becomes the last route: the chain's `;` stays on the code, before it.
    const chainEnd = path.join(dir, "server/routers/chainEnd.ts");
    fs.writeFileSync(
      chainEnd,
      [
        "export default new Hono() // head note",
        '  .delete("/:id", (c) => c) // about deleting',
        '  .get("/a", (c) => c);',
        "(later);",
        "",
      ].join("\n"),
    );
    await runOxlint(["-c", config, "--fix", chainEnd]);
    expect(fs.readFileSync(chainEnd, "utf8")).toBe(
      [
        "export default new Hono() // head note",
        '  .get("/a", (c) => c)',
        '  .delete("/:id", (c) => c); // about deleting',
        "(later);",
        "",
      ].join("\n"),
    );

    const check = await runOxlint(["-c", config, dir]);
    expect(check.exitCode).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
  test("orders a file's functions and a class's methods sync first, a callee above its caller, with oxlint --fix", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    fs.mkdirSync(path.join(dir, "server"), { recursive: true });
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/member-order": "error" } }),
    );
    const write = (name: string, lines: string[]) => {
      const file = path.join(dir, "server", name);
      fs.writeFileSync(file, lines.join("\n"));
      return file;
    };
    const functions = write("functions.ts", [
      "function helperB() {",
      "  return 1;",
      "}",
      "",
      "/** Calls helperB. */",
      "async function helperA() {",
      "  return helperB();",
      "}",
      "",
      "function helperC() {",
      "  return 2;",
      "}",
      "",
      "export async function getThing() {",
      "  return helperA();",
      "}",
      "",
      "export function deleteThing() {",
      "  return helperC();",
      "}",
      "",
      "export function createThing() {",
      "  return findThing();",
      "}",
      "",
      "export function findThing() {",
      "  return 1;",
      "}",
      "",
    ]);
    // A heading set apart by a blank line starts a run of its own; functions that call each other keep their order.
    const runs = write("runs.ts", [
      "function b() {}",
      "",
      "function a() {}",
      "",
      "// The second section.",
      "",
      "function y() {",
      "  return x();",
      "}",
      "",
      "function x() {",
      "  return y();",
      "}",
      "",
    ]);
    const methods = write("methods.ts", [
      "export class S {",
      "  async getA() {}",
      "",
      "  getB() {}",
      "",
      "  private async load() {}",
      "",
      "  private helper() {}",
      "}",
      "",
    ]);
    // A declaration file follows the module it types.
    const declarations = write("types.d.ts", ["export function b(): void;", "export function a(): void;", ""]);
    await runOxlint(["-c", config, "--fix", dir]);

    expect(fs.readFileSync(functions, "utf8")).toBe(
      [
        // Its helpers, sync first, then its exports: sync first, by verb (reads, creates, deletes), a callee above.
        "function helperB() {",
        "  return 1;",
        "}",
        "",
        "function helperC() {",
        "  return 2;",
        "}",
        "",
        "/** Calls helperB. */",
        "async function helperA() {",
        "  return helperB();",
        "}",
        "",
        "export function findThing() {",
        "  return 1;",
        "}",
        "",
        "export function createThing() {",
        "  return findThing();",
        "}",
        "",
        "export function deleteThing() {",
        "  return helperC();",
        "}",
        "",
        "export async function getThing() {",
        "  return helperA();",
        "}",
        "",
      ].join("\n"),
    );
    expect(fs.readFileSync(runs, "utf8")).toBe(
      [
        "function a() {}",
        "",
        "function b() {}",
        "",
        "// The second section.",
        "",
        "function y() {",
        "  return x();",
        "}",
        "",
        "function x() {",
        "  return y();",
        "}",
        "",
      ].join("\n"),
    );
    expect(fs.readFileSync(methods, "utf8")).toBe(
      [
        "export class S {",
        "  private helper() {}",
        "",
        "  private async load() {}",
        "",
        "  getB() {}",
        "",
        "  async getA() {}",
        "}",
        "",
      ].join("\n"),
    );
    expect(fs.readFileSync(declarations, "utf8")).toBe("export function b(): void;\nexport function a(): void;\n");
    fs.rmSync(dir, { recursive: true });
  });
});
