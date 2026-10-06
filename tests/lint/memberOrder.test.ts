import { describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareRoutes } from "@/lint/memberOrder.mjs";

import { runOxlint } from "./lintRepo.ts";

// The fix tests run oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("member order", () => {
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
        // Then private methods, then public ones, each by name.
        "  private helper() {}",
        "",
        "  async createFeat() {}",
        "",
        "  /** Deletes. */",
        "  async deleteFeat() {} // about deleting",
        "",
        "  async getFeats() {}",
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
  test("orders a file's types and constants by name, a constant another one reads above it, with oxlint --fix", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/member-order": "error" } }),
    );
    const declarations = path.join(dir, "declarations.ts");
    fs.writeFileSync(
      declarations,
      [
        "type Row = { id: string };",
        "/** A page of rows. */",
        "type Page = Row[];",
        "",
        "export type Zone = string;",
        "export interface Area {}",
        "",
        "const owner = 1; // the owner",
        "const KINDS = [owner, other];",
        "const other = 2;",
        "const apple = 3;",
        "",
        "export const Zebra = 1;",
        "export const alpha = 2;",
        "",
      ].join("\n"),
    );
    // Constants whose values run code keep their order: only `--fix-suggestions` sorts them
    const running = path.join(dir, "running.ts");
    fs.writeFileSync(running, ["const b = make();", "const a = make();", ""].join("\n"));
    await runOxlint(["-c", config, "--fix", dir]);

    expect(fs.readFileSync(declarations, "utf8")).toBe(
      [
        // Each section by name (ignoring case), the file's own above its exports; the spacing keeps its place.
        "/** A page of rows. */",
        "type Page = Row[];",
        "type Row = { id: string };",
        "",
        "export interface Area {}",
        "export type Zone = string;",
        "",
        "const apple = 3;",
        "const other = 2;",
        "const owner = 1; // the owner",
        "const KINDS = [owner, other];",
        "",
        "export const alpha = 2;",
        "export const Zebra = 1;",
        "",
      ].join("\n"),
    );
    expect(fs.readFileSync(running, "utf8")).toBe("const b = make();\nconst a = make();\n");
    expect((await runOxlint(["-f", "unix", "-c", config, running])).stdout).toContain(
      "Two of them run code, which `--fix` never reorders: move them, or `--fix-suggestions` does.",
    );
    await runOxlint(["-c", config, "--fix", "--fix-suggestions", running]);
    expect(fs.readFileSync(running, "utf8")).toBe("const a = make();\nconst b = make();\n");
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
    // A comment set apart by a blank line ends a run (`comment-style` reports it); functions that call each other are
    // reported, and keep their order.
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
    // A declaration file's functions are in order too, each place keeping its spacing
    const declarations = write("types.d.ts", ["export function b(): void;", "export function a(): void;", ""]);
    await runOxlint(["-c", config, "--fix", dir]);

    expect(fs.readFileSync(functions, "utf8")).toBe(
      [
        // Its helpers, sync first, then its exports: sync first, by name, a callee right above its first caller.
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
    expect(fs.readFileSync(declarations, "utf8")).toBe("export function a(): void;\nexport function b(): void;\n");
    expect((await runOxlint(["-f", "unix", "-c", config, dir])).stdout).toContain(
      "Functions that call each other (x, y): untangle them, so the file reads bottom-up.",
    );
    fs.rmSync(dir, { recursive: true });
  });
});
