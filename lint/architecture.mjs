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
 * - `one-engine-op`: a service's or a job's action (a method, a function) asks the engine one operation, which answers
 *   it whole: what it plans, it describes, and what it checks, it refuses. A second one is a rule the server composes.
 * - `opaque-view`: the server holds a ruleset's view only as the scope it hands the engine's operations: of its
 *   `rulesetData`, it reads the copy-on-write data alone (`rulesetData.cow`), which its writes go by. Its cache builds
 *   the view.
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
/** The server's layers whose functions are actions: each asks the engine one operation (`one-engine-op`). */
const ACTION_LAYERS = ["server/services/", "server/jobs/"];
/** The client's component folders, which code outside enters at their outermost index */
const CLIENT_COMPONENTS = "client/src/components/";
/** What a folder's entry with code of its own is told. */
const ENTRY_ONLY_RE_EXPORTS =
  'A folder\'s index.ts only re-exports what the folder offers (`export { x } from "./x.ts"`): its own code goes in a ' +
  "module named for it.";
const FUNCTION_TYPES = new Set(["ArrowFunctionExpression", "FunctionDeclaration", "FunctionExpression"]);

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
/** The modules `one-engine-op` read, by path. */
const sourceCache = new Map();

const UNINDEXED_TREES = ["server/routers/"];

/** What only retypes an expression: `x!`, `x as T`, `x satisfies T`, `(x)`. */
const VIEW_WRAPPERS = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
]);

/**
 * The action a call is made in: the method of a class it's in (a concern's too), or the outermost function around it,
 * its callbacks included. None at a module's top.
 */
function actionOf(node) {
  let action = null;
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "MethodDefinition" || current.type === "PropertyDefinition") return current;
    if (FUNCTION_TYPES.has(current.type)) action = current;
  }
  return action;
}

/**
 * Whether a module of the server's actions asks the engine when its function `name` runs: the module that declares it
 * (an index's re-export followed) imports an operation from `engine/index.ts`.
 */
function asksEngine(target, name) {
  const source = readSource(target);
  if (source === undefined) return false;
  const reExport = [...source.matchAll(/export \{([^}]*)\} from "([^"]+)"/g)].find((match) =>
    match[1].split(",").some(
      (part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() === name,
    ),
  );
  if (reExport) return asksEngine(targetOf(target, reExport[2]), name);
  return [...source.matchAll(/import (?!type )(\{[^}]*\}|\* as \w+) from "@\/engine\/index\.ts"/g)].some(
    (match) =>
      match[1].startsWith("*") || match[1].split(",").some((part) => part.trim() && !part.trim().startsWith("type ")),
  );
}

function createEngineFrontDoor(context) {
  const file = repoPath(context.filename);
  // The engine's own modules import each other; a test may reach any of them
  if (file.startsWith("engine/") || file.startsWith("tests/")) return {};
  const message =
    "Code outside engine/ enters it through engine/index.ts, its operations and their types, as the client enters " +
    "the server through its API.";
  return onImports((node, spec) => {
    const target = targetOf(file, spec);
    // `@/engine` resolves to its index too, which the rules that read the front door's imports name it by
    if (!(target === "engine" || target?.startsWith("engine/")) || target === "engine/index.ts") return;
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

function createOneEngineOp(context) {
  const file = repoPath(context.filename);
  if (!ACTION_LAYERS.some((layer) => file.startsWith(layer))) return {};
  // What an action asks the engine: an operation it imports (called, or handed on), through a namespace or an alias,
  // or another action's function or service
  const ops = new Set();
  const namespaces = new Set();
  const functions = new Map();
  const callsByAction = new Map();
  const record = (action, call) => {
    if (!callsByAction.has(action)) callsByAction.set(action, []);
    callsByAction.get(action).push(call);
  };
  return {
    ImportDeclaration(node) {
      if (node.importKind === "type") return;
      const target = targetOf(file, node.source.value);
      const values = node.specifiers.filter((specifier) => specifier.importKind !== "type");
      if (target === "engine/index.ts") {
        // Its operations, named as functions are: not its data (`RULESET_LIMITS`) or its classes (`RulesError`)
        for (const specifier of values) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
          else if (/^[a-z]/.test(specifier.imported.name)) ops.add(specifier.local.name);
        }
        return;
      }
      if (!target || !ACTION_LAYERS.some((layer) => target.startsWith(layer))) return;
      for (const specifier of values) {
        const name = specifier.type === "ImportSpecifier" ? specifier.imported.name : "default";
        if (specifier.type !== "ImportNamespaceSpecifier" && asksEngine(target, name)) ops.add(specifier.local.name);
      }
    },
    Identifier(node) {
      // An operation's every use: a call, or a value handed on (`ids.map(getEntity)`, `.bind`, a service's method)
      const { parent } = node;
      if (!ops.has(node.name) || parent.type.startsWith("Import")) return;
      if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
      if (parent.type === "VariableDeclarator" && parent.id === node) return;
      const action = actionOf(node);
      if (action) record(action, { op: node.name });
      // An alias of an operation is one
      if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") ops.add(parent.id.name);
    },
    FunctionDeclaration(node) {
      const top = node.parent.type === "Program" || node.parent.parent?.type === "Program";
      if (top && node.id) functions.set(node.id.name, node);
    },
    CallExpression(node) {
      const action = actionOf(node);
      const { callee } = node;
      if (!action) return;
      if (callee.type === "Identifier" && !ops.has(callee.name)) record(action, { fn: callee.name });
      if (callee.type !== "MemberExpression" || callee.computed) return;
      if (callee.object.type === "ThisExpression" && action.type !== "FunctionDeclaration")
        record(action, { method: callee.property.name, of: action.parent });
    },
    MemberExpression(node) {
      if (node.object.type !== "Identifier" || !namespaces.has(node.object.name)) return;
      const action = actionOf(node);
      const name = node.computed ? "(computed)" : node.property.name;
      if (action && !/^[A-Z]/.test(name)) record(action, { op: name });
    },
    "Program:exit"() {
      const reached = new Map();
      const reach = (action, seen = new Set()) => {
        if (reached.has(action)) return reached.get(action);
        const asked = new Set();
        if (seen.has(action)) return asked;
        seen.add(action);
        for (const call of callsByAction.get(action) ?? []) {
          if (call.op) asked.add(call.op);
          const callee = call.fn ? functions.get(call.fn) : call.method && methodOf(call.of, call.method);
          if (callee) for (const op of reach(callee, seen)) asked.add(op);
        }
        reached.set(action, asked);
        return asked;
      };
      for (const action of new Set([...callsByAction.keys(), ...functions.values()])) {
        const asked = reach(action);
        if (asked.size < 2) continue;
        context.report({
          node: action,
          message:
            `An action asks the engine one operation, which answers it whole; this one asks ${[...asked].join(", ")}: ` +
            "give the engine an operation for the action.",
        });
      }
    },
  };
}

function createOpaqueView(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/") || file.startsWith("server/cache/")) return {};
  const message =
    "The server hands a ruleset's view to the engine's operations as its scope, and reads none of it but its " +
    "copy-on-write data (`rulesetData.cow`): what the view answers, an operation of the engine answers.";
  // A read of the view: its copy-on-write data, or a pattern that takes that alone (`{ rulesetData: { cow } }`)
  const check = (node) => {
    const outer = unwrapped(node);
    const { parent } = outer;
    const readsCow =
      parent.type === "MemberExpression" &&
      parent.object === outer &&
      !parent.computed &&
      parent.property.name === "cow";
    if (!readsCow) context.report({ node, message });
  };
  // The cache's class, under whatever name the file imports it by
  const caches = new Set(["RulesetCache"]);
  return {
    CallExpression(node) {
      // The view itself, which the scope gives the server
      const { callee } = node;
      if (callee.type === "MemberExpression" && !callee.computed && callee.property.name === "getData")
        if (callee.object.type === "Identifier" && caches.has(callee.object.name)) context.report({ node, message });
    },
    ImportSpecifier(node) {
      if (node.imported.name === "RulesetCache") caches.add(node.local.name);
    },
    Identifier(node) {
      if (node.name === "rulesetData" && isRead(node)) check(node);
    },
    MemberExpression(node) {
      const named = node.computed ? node.property.value : node.property.name;
      if (named === "rulesetData") check(node);
    },
    Property(node) {
      // `{ rulesetData: view } = scope`, `{ rulesetData: { feats } } = scope`: the view under another name, or read
      if (node.parent.type !== "ObjectPattern" || node.computed || node.key.name !== "rulesetData") return;
      const { value } = node;
      if (value.type === "Identifier" && value.name === "rulesetData") return;
      const takesCow =
        value.type === "ObjectPattern" &&
        value.properties.every((p) => p.type === "Property" && !p.computed && p.key.name === "cow");
      if (!takesCow) context.report({ node, message });
    },
  };
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

/**
 * Whether an identifier named `rulesetData` is read: not a binding a declaration or a pattern makes under its own name
 * (`const { rulesetData } = scope`), nor a key, nor a type's.
 */
function isRead(node) {
  const { parent } = node;
  if (parent.type === "MemberExpression") return parent.object === node;
  if (parent.type === "Property") return parent.parent.type === "ObjectExpression" && parent.value === node;
  if (parent.type === "VariableDeclarator") return parent.init === node;
  if (VIEW_WRAPPERS.has(parent.type)) return true;
  return !parent.type.startsWith("TS") && !FUNCTION_TYPES.has(parent.type);
}

/** A class's method `name`, among the members of its body: a method, or a field holding a function. */
function methodOf(classBody, name) {
  return classBody.body.find(
    (member) =>
      (member.type === "MethodDefinition" || member.type === "PropertyDefinition") &&
      !member.computed &&
      member.key.name === name,
  );
}

/** A module's source, as the repo has it: none for one it doesn't. */
function readSource(target) {
  if (!sourceCache.has(target))
    sourceCache.set(target, fs.existsSync(target) ? fs.readFileSync(target, "utf8") : undefined);
  return sourceCache.get(target);
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

/** What an expression of the view is, past what only retypes it (`rulesetData!`, `rulesetData as X`, parentheses). */
function unwrapped(node) {
  let outer = node;
  while (VIEW_WRAPPERS.has(outer.parent.type)) outer = outer.parent;
  return outer;
}

export default {
  "engine-front-door": { meta: { type: "problem" }, create: createEngineFrontDoor },
  "one-engine-op": { meta: { type: "problem" }, create: createOneEngineOp },
  "opaque-view": { meta: { type: "problem" }, create: createOpaqueView },
  layers: { meta: { type: "problem" }, create: createLayers },
  "queries-in-repositories": { meta: { type: "problem" }, create: createQueriesInRepositories },
  "folder-index": { meta: { type: "problem" }, create: createFolderIndex },
  "re-exports": { meta: { type: "problem" }, create: createReExports },
};
