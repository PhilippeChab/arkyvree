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

  test("puts a class and a router in order with oxlint --fix, keeping fields and comments, middleware then sub-routers first", async () => {
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
        "  .use(middleware)",
        '  .delete("/:id", (c) => c) // about deleting',
        "  // The list.",
        '  .get("/", (c) => c)',
        '  .route("/", early)',
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
        // Fields first, by name, but below a field their initializer reads.
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
    // Its middleware, then its sub-routers, in their order, then its routes by method and path.
    expect(fs.readFileSync(router, "utf8")).toBe(
      [
        "export default new Hono()",
        "  .use(middleware)",
        '  .route("/", early)',
        '  .route("/b", b)',
        '  .route("/", a)',
        "  // The list.",
        '  .get("/", (c) => c)',
        '  .get("/:id", (c) => c)',
        '  .post("/", (c) => c)',
        '  .delete("/:id", (c) => c); // about deleting',
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
    // Middleware after a route would skip the routes above it: it's reported, and the router splits
    const late = path.join(dir, "server/routers/late.ts");
    fs.writeFileSync(late, ["export default new Hono()", '  .get("/", (c) => c)', "  .use(middleware)", ""].join("\n"));
    expect((await runOxlint(["-f", "unix", "-c", config, late])).stdout).toContain(
      "A router's middleware (`.use()`) comes before its sub-routers and routes",
    );
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

  test("puts a class's members in groups with oxlint --fix: constructor, statics, readonly fields, other fields, methods", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/member-order": "error" } }),
    );
    const store = path.join(dir, "Store.ts");
    fs.writeFileSync(
      store,
      [
        "class Store {",
        "  async load() {}",
        "  count = 0;",
        "  label?: string;",
        "  readonly b = 2;",
        "  /** The first. */",
        "  readonly a = 1;",
        "  static zeta() {}",
        "  static async beta() {}",
        "  private static alpha() {}",
        "  static VERSION = 1;",
        "  constructor() {}",
        "}",
        "",
      ].join("\n"),
    );
    await runOxlint(["-c", config, "--fix", dir]);
    expect(fs.readFileSync(store, "utf8")).toBe(
      [
        "class Store {",
        "  constructor() {}",
        "  static VERSION = 1;",
        // Static methods as methods are: private before public, sync before async, then by name
        "  private static alpha() {}",
        "  static zeta() {}",
        "  static async beta() {}",
        "  /** The first. */",
        "  readonly a = 1;",
        "  readonly b = 2;",
        "  count = 0;",
        "  label?: string;",
        "  async load() {}",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("suggests, never fixes, moving a field whose initializer calls what reads another field", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/member-order": "error" } }),
    );
    // Each moved by name would run before the field it reads through a method, an arrow, a static method or a block
    const sources = {
      "ThroughMethod.ts": [
        "class ThroughMethod {",
        "  private b = 1;",
        "  private a = this.double();",
        "  private double() {",
        "    return this.b * 2;",
        "  }",
        "}",
        "",
      ],
      "ThroughArrow.ts": [
        "class ThroughArrow {",
        "  private b = 1;",
        "  private make = () => this.b * 2;",
        "  private a = this.make();",
        "}",
        "",
      ],
      "StaticBlock.ts": [
        "class Block {",
        "  static z = 1;",
        "  static {",
        "    Block.init();",
        "  }",
        "  static a = 2;",
        "  static init() {",
        "    return Block.z + Block.a;",
        "  }",
        "}",
        "",
      ],
      "Statics.ts": [
        "class Statics {",
        "  static b = 1;",
        "  static a = Statics.double();",
        "  static double() {",
        "    return Statics.b * 2;",
        "  }",
        "}",
        "",
      ],
    };
    for (const [file, lines] of Object.entries(sources)) fs.writeFileSync(path.join(dir, file), lines.join("\n"));
    const { stdout } = await runOxlint(["-c", config, "--fix", dir]);
    await runOxlint(["-c", config, "--fix", dir]);
    for (const [file, lines] of Object.entries(sources))
      expect(fs.readFileSync(path.join(dir, file), "utf8")).toBe(lines.join("\n"));
    expect(stdout).toContain("A field's initializer runs code");
  });

  test("puts a type's members, an enum's and an index's re-exports in order with oxlint --fix, comments and all", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/member-order": "error" } }),
    );
    const index = path.join(dir, "index.ts");
    fs.writeFileSync(
      index,
      [
        "/** The index: a `{` in a comment is no list's start. */",
        "",
        "type A = { b: string; a: number };",
        "interface B {",
        "  /** The zed, `{{ }}`. */",
        "  z: string; // about z",
        "  y(): void;",
        "  y(n: number): void;",
        "  (x: number): string;",
        "  [key: string]: unknown;",
        "  a: string;",
        "}",
        "enum E {",
        '  B = "b",',
        "  /** The a. */",
        '  A = "a",',
        "}",
        "enum Implicit {",
        "  B,",
        "  A,",
        "}",
        'export type { T } from "./t.ts";',
        'export { d, c } from "./c.ts";',
        'export { b } from "./b.ts";',
        "",
      ].join("\n"),
    );
    // A list inside one that moves (an export's names, a nested type's members) settles on the next pass: oxlint
    // applies one of two overlapping fixes at a time
    await runOxlint(["-c", config, "--fix", dir]);
    await runOxlint(["-c", config, "--fix", dir]);
    expect(fs.readFileSync(index, "utf8")).toBe(
      [
        "/** The index: a `{` in a comment is no list's start. */",
        "",
        // Each place keeps its separator: the last member of a one-line type has none
        "type A = { a: number; b: string };",
        // Call and index signatures first, in their order, then by name, an overload's signatures together
        "interface B {",
        "  (x: number): string;",
        "  [key: string]: unknown;",
        "  a: string;",
        "  y(): void;",
        "  y(n: number): void;",
        "  /** The zed, `{{ }}`. */",
        "  z: string; // about z",
        "}",
        "enum E {",
        "  /** The a. */",
        '  A = "a",',
        '  B = "b",',
        "}",
        // An implicit value is the member's place
        "enum Implicit {",
        "  B,",
        "  A,",
        "}",
        // By module, a type's after a value's; an export's names by name
        'export { b } from "./b.ts";',
        'export { c, d } from "./c.ts";',
        'export type { T } from "./t.ts";',
        "",
      ].join("\n"),
    );
  });

  test("suggests, never fixes, a new order for two fields whose initializers run code", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "member-order-"));
    const config = path.join(dir, ".oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ jsPlugins: [path.resolve("lint/plugin.mjs")], rules: { "arkyvree/member-order": "error" } }),
    );
    const cache = path.join(dir, "Cache.ts");
    const source = ["class Cache {", "  readonly zz = new Map();", "", "  readonly aa = new Map();", "}", ""].join(
      "\n",
    );
    fs.writeFileSync(cache, source);
    const { stdout } = await runOxlint(["-c", config, "--fix", dir]);
    expect(fs.readFileSync(cache, "utf8")).toBe(source);
    expect(stdout).toContain("A field's initializer runs code");
    await runOxlint(["-c", config, "--fix", "--fix-suggestions", dir]);
    expect(fs.readFileSync(cache, "utf8")).toBe(
      ["class Cache {", "  readonly aa = new Map();", "", "  readonly zz = new Map();", "}", ""].join("\n"),
    );
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
    // A comment set apart by a blank line ends a run (`comment-style` reports it); functions that call each other go by
    // name too: they're hoisted.
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
        // Its helpers, sync first, then its exports: sync first, by name, whatever they call.
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
        "export function createThing() {",
        "  return findThing();",
        "}",
        "",
        "export function deleteThing() {",
        "  return helperC();",
        "}",
        "",
        "export function findThing() {",
        "  return 1;",
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
        "function x() {",
        "  return y();",
        "}",
        "",
        "function y() {",
        "  return x();",
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
    expect((await runOxlint(["-c", config, dir])).exitCode).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
});
