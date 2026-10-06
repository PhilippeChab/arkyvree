/**
 * The architecture, as rules: what each layer may import, where queries are built, and how a folder is entered.
 *
 * - `layers`: a layer imports only what's below it (database < repositories < cache, the engine < services < jobs <
 *   routers; the middlewares sit on the repositories, beside the services). The cache and the engine use copy-on-write
 *   from `services/rulesets/cow/`, its one exception. The server reads the content packages, never the seeders.
 *   `shared/` imports nothing app-specific (the schema's types only), and the client takes only types from the server.
 * - `queries-in-repositories`: a query is built in `server/repositories/` or `server/database/`, nowhere else in the
 *   server, but for the infrastructure that talks to Postgres itself (the job queue, websocket notifications, health
 *   checks). A transaction's handle is named `tx`, the name it knows a query by.
 * - `folder-index`: code outside a folder that has an `index.ts` imports it through that index (the service folders,
 *   `cow/`, `policies/`, the client's component folders). Files within the folder import each other directly, and a
 *   test may reach a folder's own modules (a pure module's unit test).
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
  "server/services/",
  "server/rulesets/",
  "server/jobs/",
  "server/middlewares/",
  "server/routers/",
];
const LAYERS = [
  { layer: "server/database/", deny: ["server/repositories/", ...ABOVE_REPOSITORIES] },
  { layer: "server/repositories/", deny: ABOVE_REPOSITORIES },
  {
    layer: "server/cache/",
    deny: ["server/services/", "server/jobs/", "server/middlewares/", "server/routers/"],
    allow: ["server/services/rulesets/cow/"],
  },
  {
    layer: "server/rulesets/",
    deny: ["server/services/", "server/jobs/", "server/middlewares/", "server/routers/"],
    allow: ["server/services/rulesets/cow/"],
  },
  { layer: "server/services/", deny: ["server/jobs/", "server/middlewares/", "server/routers/"] },
  { layer: "server/jobs/", deny: ["server/middlewares/", "server/routers/"] },
  { layer: "server/middlewares/", deny: ["server/services/", "server/jobs/", "server/routers/"] },
  // The server reads the content packages' data (a new ruleset's template items), never the seeders or scripts.
  { layer: "server/", deny: ["database/"], allow: ["database/packages/"] },
  { layer: "shared/", deny: ["server/", "client/", "database/", "drizzle/"], types: ["drizzle/"] },
  { layer: "client/", deny: ["server/", "database/", "drizzle/"], types: ["server/", "drizzle/"] },
];

/** Where a query may be built: the repositories, the database layer, and the infrastructure that talks to Postgres. */
const QUERY_HOMES = ["server/repositories/", "server/database/"];
const QUERY_INFRASTRUCTURE = new Set(["server/queue.ts", "server/websockets/events.ts", "server/routers/health.ts"]);
const QUERY_METHODS = new Set(["select", "selectDistinct", "insert", "update", "delete", "execute"]);
const SET_OPERATORS = new Set(["union", "unionAll", "intersect", "intersectAll", "except", "exceptAll"]);

/** The trees whose folders are entered through their `index.ts`. */
// The trees whose folders are entered through their index.ts: the server's, but its routers (a route folder's index.ts
// is its routes, not its folder's entry), and the client's components.
const INDEXED_TREES = ["server/", "client/src/components/"];
const UNINDEXED_TREES = ["server/routers/"];

const indexCache = new Map();

function hasIndex(dir) {
  if (!indexCache.has(dir)) {
    indexCache.set(dir, fs.existsSync(`${dir}/index.ts`) || fs.existsSync(`${dir}/index.tsx`));
  }
  return indexCache.get(dir);
}

function createFolderIndex(context) {
  const root = rootOf(context.filename);
  const file = repoPath(context.filename);
  // The server and the client hold to it. A test may reach a folder's own modules, and the seeders and the parser's
  // tools reach the engine's pure modules without loading the database an index would.
  if (!/^(server|client)\//.test(file)) return {};
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
  if (!file.startsWith("server/") || QUERY_HOMES.some((h) => file.startsWith(h)) || QUERY_INFRASTRUCTURE.has(file))
    return {};
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
      ) {
        context.report({ node, message });
      }
    },
    // db.query.someTable.findMany(…)
    MemberExpression(node) {
      if (
        node.object.type === "Identifier" &&
        ["db", "tx"].includes(node.object.name) &&
        node.property.name === "query" &&
        node.parent?.type === "MemberExpression"
      ) {
        context.report({ node, message });
      }
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
      for (const s of node.specifiers ?? []) {
        if (s.type === "ImportSpecifier" && SET_OPERATORS.has(s.imported.name)) context.report({ node: s, message });
      }
    },
  };
}

export default {
  layers: { meta: { type: "problem" }, create: createLayers },
  "queries-in-repositories": { meta: { type: "problem" }, create: createQueriesInRepositories },
  "folder-index": { meta: { type: "problem" }, create: createFolderIndex },
};
