/**
 * The architecture, as rules: what each layer may import, where queries are built, and how a folder is entered.
 *
 * - `layers`: a layer imports only what's below it (database < repositories < cache < copy-on-write's writes <
 *   services < jobs < routers; the middlewares sit on the repositories, beside the services). The engine, the root
 *   `engine/`, imports nothing of the server, the database, the content, the codegen or the client: its machinery
 *   (`engine/core/`) sits below the rulesets that run on it (`engine/rulesets/`), and `lib/`, what it shares with the
 *   server, imports nothing of the app. The cache holds copy-on-write's read side (the view a ruleset's reads see),
 *   `cow/` its write side. A ruleset's content (`content/<ruleset>/`: its builders, its data and what the codegen
 *   generates) is data, which imports none of what reads or writes it; its builders (the types and builders its data is
 *   written with) import nothing of its data. The codegen (`codegen/`) isn't the server's, and stores nothing; the
 *   server reads none of `database/`, `content/` and `codegen/`. `shared/` imports nothing app-specific (the schema's
 *   types only), and the client takes only types from the server.
 * - `engine-front-door`: code outside `engine/` enters it through `engine/index.ts`, its operations and their types, as
 *   the client enters the server through its API; a test may reach any of its modules.
 * - `queries-in-repositories`: a query is built in `server/repositories/` or `server/database/` (what talks to Postgres
 *   itself: the job queue, a channel's notifications, its health), nowhere else in the server. A transaction's handle
 *   is named `tx`, the name it knows a query by.
 * - `folder-index`: code outside a folder that has an `index.ts` imports it through that index (the service folders,
 *   `cow/`, `policies/`, the client's component folders; code outside a client component folder enters it at its
 *   outermost index, never a subfolder's). Files within the folder import each other directly, and a test may reach a
 *   folder's own modules (a pure module's unit test).
 * - `re-exports`: an `index.ts` that re-exports is a folder's entry, which only re-exports what the folder offers,
 *   from the modules themselves (`export { x } from "./x.ts"`): its own code goes in a module named for it. Any other
 *   module (an `index.ts` that re-exports nothing too: a route folder's routes) exports what it declares, never another
 *   module's: code that needs that imports it from where it's defined.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import fs from "node:fs";
import path from "node:path";

import { onImports, targetOf } from "./imports.mjs";
import { repoPath, rootOf } from "./paths.mjs";

/** Each layer and what it must not import. `types`: imported for its types only, it's allowed. */
const ABOVE_REPOSITORIES = [
  "server/cache/",
  "server/cow/",
  "server/services/",
  "server/jobs/",
  "server/middlewares/",
  "server/routers/",
];
/** The client's component folders, which code outside enters at their outermost index */
const CLIENT_COMPONENTS = "client/src/components/";
/** What a folder's entry with code of its own is told. */
const ENTRY_ONLY_RE_EXPORTS =
  'A folder\'s index.ts only re-exports what the folder offers (`export { x } from "./x.ts"`): its own code goes in a ' +
  "module named for it.";
const indexCache = new Map();
/**
 * The trees whose folders are entered through their `index.ts`: the server's, but its routers (a route folder's
 * `index.ts` is its routes, not its folder's entry), the engine's, and the client's components.
 */
const INDEXED_TREES = ["server/", "engine/", CLIENT_COMPONENTS];

const LAYERS = [
  { layer: "server/database/", deny: ["server/repositories/", ...ABOVE_REPOSITORIES] },
  { layer: "server/repositories/", deny: ABOVE_REPOSITORIES },
  {
    layer: "server/cache/",
    deny: ["server/cow/", "server/services/", "server/jobs/", "server/middlewares/", "server/routers/"],
  },
  {
    layer: "server/cow/",
    deny: ["server/services/", "server/jobs/", "server/middlewares/", "server/routers/"],
  },
  { layer: "server/services/", deny: ["server/jobs/", "server/middlewares/", "server/routers/"] },
  { layer: "server/jobs/", deny: ["server/middlewares/", "server/routers/"] },
  { layer: "server/middlewares/", deny: ["server/services/", "server/jobs/", "server/routers/"] },
  // The server reads nothing of database/, content/ or codegen/: the content reaches it through the database, which
  // the packages seed
  { layer: "server/", deny: ["database/", "content/", "codegen/"] },
  // A ruleset's content is data, which the seeders write and the codegen generates: it imports none of them
  { layer: "content/", deny: ["server/", "database/", "codegen/", "engine/", "client/", "lib/", "drizzle/"] },
  // What a ruleset's content is written with: below its data and what the codegen generates of it
  { layer: "content/dnd3.5/builders/", deny: ["content/dnd3.5/data/", "content/dnd3.5/generated/"] },
  // The codegen reads the books and writes content: it stores nothing, and it isn't the server's
  { layer: "codegen/", deny: ["server/", "database/", "client/"] },
  // The engine computes over the data it's given: it reads nothing itself, so it imports none of what stores data
  {
    layer: "engine/",
    deny: ["server/", "database/", "content/", "codegen/", "client/", "drizzle/"],
    types: ["drizzle/"],
  },
  // Its core is what every ruleset runs on: it names none of them
  { layer: "engine/core/", deny: ["engine/rulesets/"] },
  // What the server and the engine share (the mixins): it imports nothing of the app
  { layer: "lib/", deny: ["server/", "engine/", "database/", "client/", "shared/", "drizzle/"] },
  { layer: "shared/", deny: ["server/", "engine/", "client/", "database/", "drizzle/"], types: ["drizzle/"] },
  {
    layer: "client/",
    deny: ["server/", "engine/", "database/", "drizzle/"],
    types: ["server/", "engine/", "drizzle/"],
  },
];
/** What a module that exports another module's is told. */
const MODULE_EXPORTS_ITS_OWN =
  "A module exports what it declares, never another module's: code that needs that imports it from where it's defined.";
/** Where a query may be built: the repositories, and the database layer (what talks to Postgres itself). */
const QUERY_HOMES = ["server/repositories/", "server/database/"];

const QUERY_METHODS = new Set(["select", "selectDistinct", "insert", "update", "delete", "execute"]);
const SET_OPERATORS = new Set(["union", "unionAll", "intersect", "intersectAll", "except", "exceptAll"]);

const UNINDEXED_TREES = ["server/routers/"];

function createEngineFrontDoor(context) {
  const file = repoPath(context.filename);
  // The engine's own modules import each other; a test may reach any of them
  if (file.startsWith("engine/") || file.startsWith("tests/")) return {};
  const message =
    "Code outside engine/ enters it through engine/index.ts, its operations and their types, as the client enters " +
    "the server through its API.";
  return onImports((node, spec) => {
    const target = targetOf(file, spec);
    if (!target?.startsWith("engine/") || target === "engine/index.ts") return;
    context.report({ node, message });
  });
}

function createFolderIndex(context) {
  const root = rootOf(context.filename);
  const file = repoPath(context.filename);
  // The server, the engine and the client hold to it. A test, a seeder, the codegen and a script may reach a folder's
  // own modules: the engine's, though, only through its entry (`engine-front-door`).
  if (!/^(server|engine|client)\//.test(file)) return {};
  return onImports((node, spec) => {
    const target = targetOf(file, spec);
    if (!target) return;
    const tree = INDEXED_TREES.find((t) => target.startsWith(t));
    if (!tree || UNINDEXED_TREES.some((t) => target.startsWith(t))) return;
    // The nearest folder that has an index, from the target's own (a directory import) up: the one it's entered
    // through.
    const isDirectory = !/\.[a-z]+$/.test(target);
    let folder = null;
    for (
      let dir = isDirectory ? target : path.posix.dirname(target);
      dir.length >= tree.length - 1 && dir.startsWith(tree.slice(0, -1));
      dir = path.posix.dirname(dir)
    ) {
      if (dir === tree.slice(0, -1)) break;
      if (hasIndex(path.join(root, dir))) {
        folder = dir;
        break;
      }
    }
    if (!folder || file.startsWith(folder + "/")) return;
    // Code outside a client component folder (`components/characters/`) enters it at its outermost index: a
    // subfolder's index is an entry for the folder's own files, never for the code outside it
    const area = tree + target.slice(tree.length).split("/")[0];
    for (
      let dir = path.posix.dirname(folder);
      tree === CLIENT_COMPONENTS && !file.startsWith(area + "/") && dir.startsWith(area);
      dir = path.posix.dirname(dir)
    )
      if (hasIndex(path.join(root, dir))) folder = dir;
    const index = isDirectory
      ? target === folder
      : path.posix.basename(target).replace(/\.tsx?$/, "") === "index" && path.posix.dirname(target) === folder;
    if (!index) {
      context.report({
        node,
        message: `Import ${folder}/ through its index.ts: code outside a folder enters it there.`,
      });
    }
  });
}

function createLayers(context) {
  const file = repoPath(context.filename);
  const rules = LAYERS.filter((l) => file.startsWith(l.layer));
  if (!rules.length) return {};
  return onImports((node, spec, types) => {
    const target = targetOf(file, spec);
    if (!target) return;
    for (const rule of rules) {
      const denied = rule.deny.find((d) => target.startsWith(d));
      if (!denied) continue;
      if (rule.allow?.some((a) => target.startsWith(a))) continue;
      if (types && rule.types?.some((t) => target.startsWith(t))) continue;
      const typesOnly = rule.types?.some((t) => denied.startsWith(t)) ? " (types only)" : "";
      context.report({
        node,
        message: `${rule.layer} doesn't import from ${denied}${typesOnly}: a layer imports what's below it.`,
      });
      return;
    }
  });
}

function createQueriesInRepositories(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/") || QUERY_HOMES.some((h) => file.startsWith(h))) return {};
  const message = "A query is built in a repository (server/repositories/): call its method instead.";
  return {
    // db.select(…), tx.update(…), db.execute(…)
    CallExpression(node) {
      const callee = node.callee;
      if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        ["db", "tx"].includes(callee.object.name) &&
        QUERY_METHODS.has(callee.property.name)
      )
        context.report({ node, message });
    },
    // db.query.someTable.findMany(…)
    MemberExpression(node) {
      if (
        node.object.type === "Identifier" &&
        ["db", "tx"].includes(node.object.name) &&
        node.property.name === "query" &&
        node.parent?.type === "MemberExpression"
      )
        context.report({ node, message });
    },
    // withTransaction((tx) => …), db.transaction((tx) => …): the handle this rule knows is `tx`.
    "CallExpression:exit"(node) {
      const callee = node.callee;
      const opensTransaction =
        (callee.type === "Identifier" && callee.name === "withTransaction") ||
        (callee.type === "MemberExpression" && callee.property.name === "transaction");
      const handler = node.arguments.find(
        (a) => a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression",
      );
      const handle = handler?.params[0];
      if (opensTransaction && handle && !(handle.type === "Identifier" && handle.name === "tx")) {
        context.report({
          node: handle,
          message: "A transaction's handle is named `tx`: the query rule knows queries by it.",
        });
      }
    },
    // unionAll and the other set operators
    ImportDeclaration(node) {
      if (!String(node.source.value).startsWith("drizzle-orm")) return;
      for (const s of node.specifiers ?? [])
        if (s.type === "ImportSpecifier" && SET_OPERATORS.has(s.imported.name)) context.report({ node: s, message });
    },
  };
}

function createReExports(context) {
  const isIndex = /(^|\/)index\.tsx?$/.test(repoPath(context.filename));
  return {
    Program(program) {
      const imported = new Set(
        program.body
          .filter((s) => s.type === "ImportDeclaration")
          .flatMap((s) => s.specifiers.map((sp) => sp.local.name)),
      );
      const reExporting = program.body.filter((s) => reExports(s, imported));
      // An index that re-exports is its folder's entry: it re-exports from the modules themselves, and holds nothing else
      if (isIndex && reExporting.length > 0) {
        for (const statement of program.body.filter((s) => !reExportsFrom(s)))
          context.report({ node: statement, message: ENTRY_ONLY_RE_EXPORTS });

        return;
      }
      for (const statement of reExporting) context.report({ node: statement, message: MODULE_EXPORTS_ITS_OWN });
    },
  };
}

function hasIndex(dir) {
  if (!indexCache.has(dir)) indexCache.set(dir, fs.existsSync(`${dir}/index.ts`) || fs.existsSync(`${dir}/index.tsx`));

  return indexCache.get(dir);
}

/** Whether a statement exports another module's: from it (`export … from`), or through what the file imports. */
function reExports(statement, imported) {
  if (statement.type === "ExportAllDeclaration") return true;
  // `export default x`, of what the file imports, is another module's too
  if (statement.type === "ExportDefaultDeclaration") return imported.has(statement.declaration.name);
  if (statement.type !== "ExportNamedDeclaration" || statement.declaration) return false;
  return Boolean(statement.source) || statement.specifiers.some((s) => imported.has(s.local.name));
}

/** Whether a statement re-exports straight from the module that declares it: `export { x } from "./x.ts"`. */
function reExportsFrom(statement) {
  return (
    statement.type === "ExportAllDeclaration" || (statement.type === "ExportNamedDeclaration" && !!statement.source)
  );
}

export default {
  "engine-front-door": { meta: { type: "problem" }, create: createEngineFrontDoor },
  layers: { meta: { type: "problem" }, create: createLayers },
  "queries-in-repositories": { meta: { type: "problem" }, create: createQueriesInRepositories },
  "folder-index": { meta: { type: "problem" }, create: createFolderIndex },
  "re-exports": { meta: { type: "problem" }, create: createReExports },
};
