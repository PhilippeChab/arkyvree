/**
 * The architecture, as rules: what each layer may import, where queries are built, and how a folder is entered.
 *
 * - `layers`: a layer imports only what's below it (database < repositories < cache, the engine < services < jobs <
 *   routers). The cache and the engine use copy-on-write from `services/rulesets/cow/`, its one exception. `shared/`
 *   imports nothing app-specific (the schema's types only), and the client takes only types from the server.
 * - `queries-in-repositories`: a query is built in `server/repositories/` or `server/database/`, nowhere else in the
 *   server, but for the infrastructure that talks to Postgres itself (the job queue, websocket notifications, health
 *   checks).
 * - `folder-index`: code outside a folder that has an `index.ts` imports it through that index (the service folders,
 *   `cow/`, `policies/`, the client's component folders). Files within the folder import each other directly, and a
 *   test may reach a folder's own modules (a pure module's unit test).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */
import fs from "node:fs";
import path from "node:path";

/** Each layer and what it must not import. `types`: imported for its types only, it's allowed. */
const LAYERS = [
  {
    layer: "server/database/",
    deny: [
      "server/repositories/",
      "server/cache/",
      "server/services/",
      "server/rulesets/",
      "server/jobs/",
      "server/routers/",
    ],
  },
  {
    layer: "server/repositories/",
    deny: ["server/cache/", "server/services/", "server/rulesets/", "server/jobs/", "server/routers/"],
  },
  {
    layer: "server/cache/",
    deny: ["server/services/", "server/jobs/", "server/routers/"],
    allow: ["server/services/rulesets/cow/"],
  },
  {
    layer: "server/rulesets/",
    deny: ["server/services/", "server/jobs/", "server/routers/"],
    allow: ["server/services/rulesets/cow/"],
  },
  { layer: "server/services/", deny: ["server/jobs/", "server/routers/"] },
  { layer: "server/jobs/", deny: ["server/routers/"] },
  { layer: "shared/", deny: ["server/", "client/", "database/", "drizzle/"], types: ["drizzle/"] },
  { layer: "client/", deny: ["server/", "database/", "drizzle/"], types: ["server/", "drizzle/"] },
];

/** Where a query may be built: the repositories, the database layer, and the infrastructure that talks to Postgres. */
const QUERY_HOMES = ["server/repositories/", "server/database/"];
const QUERY_INFRASTRUCTURE = new Set([
  "server/queue.ts",
  "server/ws.ts",
  "server/main.ts",
  "server/worker.ts",
  "server/routers/application.ts",
]);
const QUERY_METHODS = new Set(["select", "selectDistinct", "insert", "update", "delete", "execute"]);
const SET_OPERATORS = new Set(["union", "unionAll", "intersect", "intersectAll", "except", "exceptAll"]);

/** The trees whose folders are entered through their `index.ts`. */
const INDEXED_TREES = ["server/services/", "client/src/components/"];

const repoPath = (context, file) =>
  path
    .relative(context.cwd ?? process.cwd(), file)
    .split(path.sep)
    .join("/");

/** An import's target, as a repo path: `@/x`, or relative to the importer. Packages have none. */
function targetOf(importer, spec) {
  if (spec.startsWith("@/")) return path.posix.normalize(spec.slice(2));
  if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(importer), spec));
  return null;
}

/** Whether an import brings in types only: `import type`, or every specifier `type`. */
function typeOnly(node) {
  if (node.importKind === "type" || node.exportKind === "type") return true;
  const specifiers = node.specifiers ?? [];
  return specifiers.length > 0 && specifiers.every((s) => s.importKind === "type" || s.exportKind === "type");
}

/** Every import and re-export a file makes: its node, its specifier, and whether it brings types only. */
function onImports(callback) {
  const visit = (node) => {
    if (node.source && typeof node.source.value === "string") callback(node, node.source.value, typeOnly(node));
  };
  return {
    ImportDeclaration: visit,
    ExportNamedDeclaration: visit,
    ExportAllDeclaration: visit,
    ImportExpression(node) {
      if (node.source?.type === "Literal" && typeof node.source.value === "string")
        callback(node, node.source.value, false);
    },
  };
}

const layers = {
  meta: { type: "problem" },
  create(context) {
    const file = repoPath(context, context.filename);
    const rule = LAYERS.find((l) => file.startsWith(l.layer));
    if (!rule) return {};
    return onImports((node, spec, types) => {
      const target = targetOf(file, spec);
      if (!target) return;
      const denied = rule.deny.find((d) => target.startsWith(d));
      if (!denied) return;
      if (rule.allow?.some((a) => target.startsWith(a))) return;
      if (types && rule.types?.some((t) => target.startsWith(t))) return;
      const typesOnly = rule.types?.some((t) => denied.startsWith(t)) ? " (types only)" : "";
      context.report({
        node,
        message: `${rule.layer} doesn't import from ${denied}${typesOnly}: a layer imports what's below it.`,
      });
    });
  },
};

const queriesInRepositories = {
  meta: { type: "problem" },
  create(context) {
    const file = repoPath(context, context.filename);
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
      // unionAll and the other set operators
      ImportDeclaration(node) {
        if (!String(node.source.value).startsWith("drizzle-orm")) return;
        for (const s of node.specifiers ?? []) {
          if (s.type === "ImportSpecifier" && SET_OPERATORS.has(s.imported.name)) context.report({ node: s, message });
        }
      },
    };
  },
};

const indexCache = new Map();
const hasIndex = (dir) => {
  if (!indexCache.has(dir)) {
    indexCache.set(dir, fs.existsSync(`${dir}/index.ts`) || fs.existsSync(`${dir}/index.tsx`));
  }
  return indexCache.get(dir);
};

const folderIndex = {
  meta: { type: "problem" },
  create(context) {
    const root = context.cwd ?? process.cwd();
    const file = repoPath(context, context.filename);
    if (file.startsWith("tests/")) return {};
    return onImports((node, spec) => {
      const target = targetOf(file, spec);
      if (!target) return;
      const tree = INDEXED_TREES.find((t) => target.startsWith(t));
      if (!tree) return;
      // The nearest folder above the target that has an index: the one it's entered through.
      let folder = null;
      for (
        let dir = path.posix.dirname(target);
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
      const index =
        path.posix.basename(target).replace(/\.tsx?$/, "") === "index" && path.posix.dirname(target) === folder;
      if (!index) {
        context.report({
          node,
          message: `Import ${folder}/ through its index.ts: code outside a folder enters it there.`,
        });
      }
    });
  },
};

export const rules = {
  layers,
  "queries-in-repositories": queriesInRepositories,
  "folder-index": folderIndex,
};
