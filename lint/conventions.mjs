/**
 * The conventions AGENTS.md lists, as rules, so code can't drift from them:
 *
 * - `no-parent-imports`: a file imports another folder's module through `@/` (the repo's root), never `../`, and a
 *   module of its own folder (or one under it) directly (`./x.ts`), never through `@/`.
 *   `oxlint --fix` rewrites one. Not in `lint/`, whose plugins node loads without the alias.
 * - `no-helpers-modules`: a helper is a module named for what it does, never a `helpers` or `utils` grab bag, file or
 *   folder, anywhere (the tests' shared code is `tests/support/`'s topic modules).
 * - `repository-instances`: code uses the repositories' shared instances (`@/server/repositories/index.ts`), which
 *   the request cache wraps; only that file builds one.
 * - `route-conventions`: a route's path params are camelCase (`:modifierId`; `.get`, `.route`, `.on`) and its fixed
 *   segments kebab-case (`/class-levels`; a file's name, `robots.txt`, or `*` too), it answers with its status
 *   (`c.json(body, status)`), its validation is the app's `validate` (`@/server/middlewares/index.ts`, which answers in
 *   the API's error envelope), its params are a named schema (`validate("param", featParams)`: from a `validation.ts`
 *   when several routers use it, declared at the top of its router otherwise), its body and query are written in it
 *   (or at its router's top, as `itemBody`, when several of its routes take one, as it is or derived), its handler
 *   reads its input into a const and destructures what it reads of it (`body` or `query` when it reads one whole), a
 *   router is its module's export (`export default new Hono()…`) and names a schema for what it validates (never
 *   `…Schema`), and it lets an error reach `onError` instead of catching it (`server/routers/api/`; a `finally` alone
 *   is fine).
 * - `order-through-repository`: the server's queries sort with a repository's `this.orderBy(column, direction)`, never
 *   drizzle's `asc` / `desc`, and a repository method that reads a page orders it by `this.pageOrder(keys)`, which ends
 *   on a key no two rows share: OFFSET paging repeats or skips rows that tie.
 * - `shared-runtime`: `shared/` runs in the client too, and `engine/` computes over the data it's given, so neither uses
 *   Bun's APIs (`bun`, the `Bun` global) nor Node's (`node:fs`, `fs`).
 * - `engine-sync`: `engine/` reads nothing, so nothing it does waits: no `async` function, no `await`, no `Promise`.
 * - `engine-classes`: an operation of `engine/` is its API's (`engine/api/`, which `engine/index.ts` exports), and each
 *   of its steps a class's method or a module's own function: outside the API, a module exports no function of its
 *   own (declared, held by a const, or listed), so no file reaches into another's steps. It exports classes (and their
 *   shared instance), concerns and components (PascalCase), types and data.
 * - `session-param`: a `Session` parameter is named `session` (`_session` when it's unused).
 * - `writes-in-transactions`: a repository write or lock (`methodVerbs.json`'s verbs) outside the repositories takes a
 *   transaction's handle, `tx` (`withTransaction(async (tx) => …)`), never the shared `db`: a write is atomic with the
 *   rest of its request, and a lock holds until its transaction ends. A transaction's queries run one at a time, on its
 *   one connection: never in a `Promise.all` (`tx`, or a handle the function is given, which may be a transaction).
 * - `empty-list-reads`: an empty list never reaches the database, and is checked in one place: the repository. A read
 *   method filtering on a list of `where` (`inArray(column, where.ids)`, outside an `or`) answers an empty one without a
 *   query (`if (where.ids.length === 0) return [];` first), and its callers read without checking: no
 *   `ids.length > 0 ? Repo.findMany(db, { ids }) : []`, no `if (!ids.length) return []` before reads of `ids` alone. A
 *   check that skips other queries too (a write, a read of something else) is the caller's to keep: an insert of no rows
 *   throws, and a read of something else would run for nothing. The rule sees a repository's calls only: a check that
 *   skips a helper, whose queries it can't see, is left to review.
 * - `no-null-reads`: a repository read says it found nothing with `undefined`, as drizzle does (`findFirst`, `const [row] =
 *   …`), never `null`, which is a column's empty value: no `return null`, `?? null` or `| null` return type.
 * - `no-disable-comments`: no comment turns a lint rule off (`oxlint-disable…`, `eslint-disable…`): a case a rule gets
 *   wrong changes the rule, its options or its definition, never one line.
 * - `environment`: the server reads its environment in `server/environment.ts` only (`readEnv`, `isProduction`…),
 *   which lists every variable: never `process.env` or `Bun.env` elsewhere in the server or `shared/`.
 * - `test-placement`: a test named after a module sits at that module's mirror (`tests/services/…` ↔
 *   `server/services/…`); a test of a behavior across modules is free in its area.
 * - `error-names`: an error is named `error`: a `catch`'s binding, and an `onError` callback's first parameter.
 * - `function-declarations`: a file's own function is a `function` declaration (`function verbOf(method) {…}`), never
 *   a variable holding an arrow: an arrow is for a callback. `oxlint --fix` declares one (a typed one's parameters are
 *   typed by hand).
 * - `include-order`: a class includes its concerns by name, after its base (`include(BaseRepository<…>, Paginates,
 *   Searches)`): a concern builds on the base alone, so their order is the reader's. `oxlint --fix` sorts them.
 * - `policy-shape`: a service builds a policy with `XPolicy.for(db, session, entity)`, which loads the session's standing
 *   on the entity (its role on it), never with `new`; a policy's only static is `for`, and its only async method: a
 *   check reads that standing and what the service passes it (`canDeleteEntity({ inUse })`), and throws or answers.
 * - `class-file-names`: a module that declares a class and exports it, or its shared instance (`export default new
 *   X()`), is named after the class: `X.ts` (`FeatsService.ts`, `References.ts`). A module of several classes is
 *   named for what groups them (`server/errors/`), and a router's `new Hono()` is another module's class.
 * - `concern-shape`: a concern (`function X<B extends Constructor>(Base: B)`) sits in `X.ts`, its class is named for
 *   what it adds (a verb's `-ing`, `Archives` → `Archiving`, or `With` a noun, `ArmorClass` → `WithArmorClass`), and
 *   it adds methods, never state.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import { onImports, targetOf } from "./imports.mjs";
import { startsWithVerb } from "./methodNames.mjs";
import { repoPath, rootOf } from "./paths.mjs";

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

const CONCURRENT = new Set(["all", "allSettled", "any", "race"]);
/** An `eslint-disable` / `oxlint-disable` comment's text. */
const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b/;
/** kebab-case, a file's name (`sitemap.xml`) or a wildcard */
const FIXED_SEGMENT = /^([a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)?|\*)$/;
/** A module or folder named for no particular thing: `helpers.ts`, `utils/`. */
const GRAB_BAG = /(^|\/)(helpers|utils?)(\.tsx?$|\/)/;
/** A route's whole input, named for its target when it's named: `featParams`, `itemBody`, a query's `…Query`. */
const INPUT_NAMES = { param: /Params?$/, json: /Body$/, query: /Query$/ };

/** The variable a handler reads a whole input into: it destructures params, and an input it reads field by field. */
const INPUT_VARIABLES = { json: "body", query: "query" };
const METHOD_VERBS = JSON.parse(
  fs.readFileSync(new URL("../server/repositories/methodVerbs.json", import.meta.url), "utf8"),
);

const READ_VERBS = METHOD_VERBS.read;

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "route"]);

/** The trees that use neither Bun's APIs nor Node's, and why. */
const RUNTIME_FREE_TREES = [
  ["shared/", "`shared/` runs in the client too"],
  ["engine/", "`engine/` computes over the data it's given"],
  ["lib/", "`lib/` is what the engine shares with the server"],
  ["content/", "`content/` is data"],
];

/** Each test area and the source tree it mirrors. */
const TEST_MIRRORS = [
  ["tests/services/", "server/services/"],
  ["tests/routers/", "server/routers/"],
  ["tests/jobs/", "server/jobs/"],
  ["tests/cache/", "server/cache/"],
  ["tests/engine/", "engine/"],
  ["tests/middlewares/", "server/middlewares/"],
  ["tests/emails/", "server/emails/"],
  ["tests/shared/", "shared/"],
  ["tests/client/", "client/src/"],
  ["tests/lint/", "lint/"],
  ["tests/scripts/", "scripts/"],
  ["tests/parser/", "codegen/dnd3.5/tools/"],
];

const WRITE_VERBS = [...METHOD_VERBS.write, ...METHOD_VERBS.lock];

/** The calls in `node`'s subtree, itself included. */
function* callsIn(node) {
  if (node.type === "CallExpression") yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value])
      if (typeof child?.type === "string") yield* callsIn(child);
  }
}

/** What a call or member chain starts from: `itemBody` in `itemBody.partial()`, `z` in `z.object({…})`. */
function chainRootOf(node) {
  let current = node;
  while (current?.type === "CallExpression" || current?.type === "MemberExpression")
    current = current.type === "CallExpression" ? current.callee : current.object;

  return current;
}

/** A handler's read of its validated input: `const { id } = c.req.valid("param")`, `body` or `query` when it's whole. */
function checkInputRead(context, declarator) {
  const target = validTargetOf(declarator.init);
  if (!target || declarator.id.type === "ObjectPattern") return;
  const variable = INPUT_VARIABLES[target];
  if (!variable) {
    context.report({
      node: declarator,
      message: `A route destructures its ${target}: \`const { id } = c.req.valid("${target}")\`.`,
    });
  } else if (declarator.id.type === "Identifier" && declarator.id.name !== variable) {
    context.report({ node: declarator.id, message: `A route reads its whole ${target} as \`${variable}\`.` });
  } else if (
    declarator.id.type === "Identifier" &&
    !readsWhole(enclosingFunction(declarator) ?? declarator, variable)
  ) {
    context.report({
      node: declarator.id,
      message: `A route that reads its ${target}'s fields destructures them: \`const { name } = c.req.valid("${target}")\`.`,
    });
  }
}

/**
 * A body or query schema given by name: the router's own, which several of its routes take, as it is or derived
 * (`itemBody.partial()`).
 */
function checkNamedInputs(context, named, constants) {
  for (const [name, { bare, derived, targets }] of named) {
    const misnamed = [...targets].find((target) => !INPUT_NAMES[target].test(name));
    if (constants.has(name) && derived.length > 0 && misnamed) {
      context.report({
        node: derived[0],
        message: `A route's ${misnamed} schema is named for what it validates (\`itemBody\`, a query's \`…Query\`): \`${name}\` isn't.`,
      });
    }
    const reported = !constants.has(name) ? bare : bare.length + derived.length > 1 ? [] : [...bare, ...derived];
    for (const node of reported) {
      context.report({
        node,
        message: `A route's body or query is written in the route; \`${name}\` is declared at the router's top only when several of its routes take it.`,
      });
    }
  }
}

/** A router's top-level constants: a router is its module's export, and a schema is named for what it validates. */
function checkRouterTop(context, program, constants) {
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration" && statement.declaration.type === "Identifier")
      context.report({ node: statement, message: "A router is its module's export: `export default new Hono()…`." });

    const exported = statement.type === "ExportNamedDeclaration";
    const declaration = exported ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "Identifier") continue;
      constants.add(declarator.id.name);
      if (!exported && isHonoChain(declarator.init)) {
        context.report({ node: declarator, message: "A router is its module's export: `export default new Hono()…`." });
      } else if (declarator.id.name.endsWith("Schema")) {
        context.report({
          node: declarator.id,
          message:
            "A router's schema is named for what it validates (`featParams`, `itemBody`, `hitDie`), not `…Schema`.",
        });
      }
    }
  }
}

/**
 * A route's validated input: its params by a named schema, its body and query written in it or, when several of the
 * router's routes take one, at the router's top (`itemBody`). `named` collects the names given for a body or a query.
 */
function checkValidation(context, node, named) {
  const [target, schema] = node.arguments;
  const pattern = INPUT_NAMES[target?.value];
  if (!pattern) return;
  if (target.value === "param" && schema?.type !== "Identifier") {
    context.report({
      node: schema,
      message:
        "A route's params are a named schema (`idParam`, `featParams`): from a `validation.ts` when several " +
        "routers use it, declared at the top of the router otherwise.",
    });
  } else if (schema?.type === "Identifier" && !pattern.test(schema.name)) {
    context.report({
      node: schema,
      message: `A route's ${target.value} schema is named for what it validates (\`featParams\`, \`idParam\`, \`itemBody\`, a query's \`…Query\`): \`${schema.name}\` isn't.`,
    });
  } else if (target.value !== "param") {
    const root = schema?.type === "Identifier" ? schema : chainRootOf(schema);
    if (root?.type !== "Identifier") return;
    if (!named.has(root.name)) named.set(root.name, { bare: [], derived: [], targets: new Set() });
    const uses = named.get(root.name);
    uses[root === schema ? "bare" : "derived"].push(root);
    uses.targets.add(target.value);
  }
}

function createClassFileNames(context) {
  const file = repoPath(context.filename);
  if (!/\.tsx?$/.test(file)) return {};
  const base = path.posix.basename(file).replace(/\.tsx?$/, "");
  return {
    Program(program) {
      const classes = new Set();
      const exported = new Map();
      for (const statement of program.body) {
        const declaration =
          statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
            ? statement.declaration
            : statement;
        if (declaration?.type !== "ClassDeclaration" || !declaration.id) continue;
        classes.add(declaration.id.name);
        if (declaration !== statement) exported.set(declaration.id.name, declaration.id);
      }
      // The class exported by name (`export { X }`, `export default X`), or its instance (`export default new X()`,
      // `export const x = new X()`)
      const exportOf = (node) => {
        if (node?.type === "Identifier" && classes.has(node.name)) exported.set(node.name, node);
        if (node?.type === "NewExpression" && node.callee.type === "Identifier" && classes.has(node.callee.name))
          exported.set(node.callee.name, node.callee);
      };
      for (const statement of program.body) {
        if (statement.type === "ExportDefaultDeclaration") exportOf(statement.declaration);
        if (statement.type !== "ExportNamedDeclaration" || statement.source) continue;
        for (const specifier of statement.specifiers ?? []) exportOf(specifier.local);
        for (const declarator of statement.declaration?.declarations ?? []) exportOf(declarator.init);
      }
      // One class, or its shared instance: the module is named after it
      if (exported.size !== 1) return;
      const [[name, node]] = exported;
      if (name === base) return;
      context.report({
        node,
        message: `A module that exports its class, or the class's shared instance, is named after it: \`${name}${path.posix.extname(file)}\`.`,
      });
    },
  };
}

function createConcernShape(context) {
  const file = repoPath(context.filename);
  return {
    FunctionDeclaration(fn) {
      if (!fn.id || !isConcern(fn) || fn.parent?.type !== "ExportNamedDeclaration") return;
      const name = fn.id.name;
      if (path.posix.basename(file).replace(/\.tsx?$/, "") !== name)
        context.report({ node: fn.id, message: `A concern sits in a file of its name: \`${name}.ts\`.` });

      const [verb, rest] = [/^[A-Z][a-z]*/.exec(name)?.[0] ?? name, name.replace(/^[A-Z][a-z]*/, "")];
      const allowed = [`With${name}`, ...(verb.endsWith("s") ? gerunds(verb).map((g) => g + rest) : [])];
      for (const statement of fn.body.body) {
        if (statement.type !== "ClassDeclaration") continue;
        if (!allowed.includes(statement.id.name)) {
          context.report({
            node: statement.id,
            message: `A concern's class is named for what it adds: \`${allowed.slice(1).join("` or `") || allowed[0]}\` (a verb, \`Archives\` → \`Archiving\`) or \`With${name}\` (a noun, \`ArmorClass\` → \`WithArmorClass\`), not \`${statement.id.name}\`.`,
          });
        }
        for (const member of statement.body.body) {
          if (member.type === "PropertyDefinition" && !member.declare) {
            context.report({
              node: member,
              message:
                "A concern adds methods, never state: its class holds no field (the state goes in a base it builds on).",
            });
          }
        }
      }
    },
  };
}

function createEmptyListReads(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/")) return {};
  const text = context.sourceCode.text;
  const textOf = (node) => text.slice(...(node.range ?? [node.start, node.end]));
  if (file.startsWith("server/repositories/")) {
    return {
      MethodDefinition(node) {
        const name = node.key.name;
        const body = node.value.body;
        if (!body || node.accessibility === "private" || !READ_VERBS.some((verb) => startsWithVerb(name, verb))) return;
        // The lists of `where` the read filters on: `inArray(column, where.ids)`, outside an `or` or a `not`
        const lists = new Set();
        for (const call of callsIn(body)) {
          if (call.callee.type !== "Identifier" || call.callee.name !== "inArray") continue;
          const list = call.arguments[1];
          if (list?.type !== "MemberExpression" || list.object.type !== "Identifier" || list.object.name !== "where")
            continue;

          if (!isUnderCall(call, body, ["or", "not"])) lists.add(textOf(list));
        }
        const guarded = new Set();
        for (const statement of body.body) {
          const test = statement.type === "IfStatement" ? emptinessTest(statement.test) : undefined;
          if (test?.whenEmpty && returnedBy(statement.consequent)) guarded.add(textOf(test.list));
        }
        for (const list of lists) {
          if (guarded.has(list)) continue;
          context.report({
            node: node.key,
            message: `\`${name}\` reads the list \`${list}\`: it answers an empty one without a query (\`if (${list}.length === 0) return …;\` first), so that no caller checks it.`,
          });
        }
      },
    };
  }
  // The repositories' shared instances this file imports.
  const repositories = new Set();
  // Whether `node` uses `list` as a value (`{ ids }`, `{ entityIds: ids.map(…) }`), not as a property's key
  const uses = (node, list) => {
    if ((node.type === "Identifier" || node.type === "MemberExpression") && textOf(node) === list) return true;
    return Object.entries(node).some(([key, value]) => {
      if (key === "parent" || (key === "key" && node.type === "Property" && !node.computed)) return false;
      if (key === "property" && node.type === "MemberExpression" && !node.computed) return false;
      return (Array.isArray(value) ? value : [value]).some(
        (child) => typeof child?.type === "string" && uses(child, list),
      );
    });
  };
  // Whether every repository call in `nodes` reads `list`, and there is one: what a check of `list` alone skips
  const readsOnly = (nodes, list) => {
    const calls = nodes
      .flatMap((node) => [...callsIn(node)])
      .filter((call) => call.callee.type === "MemberExpression" && repositories.has(call.callee.object.name));
    const readsList = (call) =>
      READ_VERBS.some((verb) => startsWithVerb(call.callee.property.name, verb)) &&
      call.arguments.slice(1).some((argument) => uses(argument, list));
    return calls.length > 0 && calls.every(readsList);
  };
  const report = (node) =>
    context.report({
      node,
      message:
        "A read takes an empty list as it is: its repository answers an empty one without a query. Read it without checking here (only a write skips an empty list: an insert of no rows throws).",
    });
  return {
    ImportDeclaration(node) {
      if (!String(node.source.value).startsWith("@/server/repositories/")) return;
      for (const specifier of node.specifiers)
        if (specifier.type === "ImportSpecifier") repositories.add(specifier.local.name);
    },
    ConditionalExpression(node) {
      const test = emptinessTest(node.test);
      if (!test) return;
      const [skipped, read] = test.whenEmpty ? [node.consequent, node.alternate] : [node.alternate, node.consequent];
      if (isEmptyValue(skipped) && readsOnly([read], textOf(test.list))) report(node);
    },
    IfStatement(node) {
      const test = emptinessTest(node.test);
      if (!test || node.alternate) return;
      const list = textOf(test.list);
      if (test.whenEmpty) {
        // `if (!ids.length) return [];`, then reads of `ids`
        const returned = returnedBy(node.consequent);
        if (!returned || !isEmptyValue(returned.argument) || node.parent.type !== "BlockStatement") return;
        if (readsOnly(node.parent.body.slice(node.parent.body.indexOf(node) + 1), list)) report(node);
        return;
      }
      // `if (ids.length > 0) { …a read of ids… }`
      if (readsOnly([node.consequent], list)) report(node);
    },
  };
}

function createEngineSync(context) {
  if (!repoPath(context.filename).startsWith("engine/")) return {};
  const message =
    "`engine/` reads nothing, so nothing it does waits: it computes without `async`, `await` or a `Promise`.";
  function checkAsync(node) {
    if (node.async) context.report({ node, message });
  }
  return {
    ArrowFunctionExpression: checkAsync,
    AwaitExpression(node) {
      context.report({ node, message });
    },
    ForOfStatement(node) {
      if (node.await) context.report({ node, message });
    },
    FunctionDeclaration: checkAsync,
    FunctionExpression: checkAsync,
    // A `Promise` type, or the value: `new Promise(…)`, `Promise.all(…)`
    Identifier(node) {
      if (node.name === "Promise") context.report({ node, message });
    },
  };
}

function createEngineClasses(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("engine/") || file.startsWith("engine/api/") || file === "engine/index.ts") return {};
  const message =
    "Outside `engine/api/`, an engine module exports no function of its own: an operation is the API's, and a step a " +
    "class's method (or the module's own, unexported, function).";
  const isFunction = (node) =>
    node?.type === "FunctionDeclaration" ||
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionExpression";
  const isCamelCase = (name) => /^[a-z]/.test(name);
  // The module's own functions, by name: what an export list may name
  const ownFunctions = new Set();
  return {
    Program(node) {
      for (const statement of node.body) {
        if (statement.type === "FunctionDeclaration" && statement.id) ownFunctions.add(statement.id.name);
        if (statement.type === "VariableDeclaration")
          for (const d of statement.declarations) if (d.id.type === "Identifier" && isFunction(d.init)) ownFunctions.add(d.id.name);
      }
    },
    ExportDefaultDeclaration(node) {
      const { declaration } = node;
      if (isFunction(declaration) && (!declaration.id || isCamelCase(declaration.id.name)))
        context.report({ node, message });
      if (declaration.type === "Identifier" && ownFunctions.has(declaration.name) && isCamelCase(declaration.name))
        context.report({ node, message });
    },
    ExportNamedDeclaration(node) {
      const { declaration, source, specifiers } = node;
      if (declaration?.type === "FunctionDeclaration" && isCamelCase(declaration.id.name))
        context.report({ node, message });
      if (declaration?.type === "VariableDeclaration") {
        for (const d of declaration.declarations)
          if (d.id.type === "Identifier" && isFunction(d.init) && isCamelCase(d.id.name)) context.report({ node: d, message });
      }
      if (source) return;
      for (const specifier of specifiers ?? []) {
        const local = specifier.local?.name;
        if (local && ownFunctions.has(local) && isCamelCase(specifier.exported?.name ?? local))
          context.report({ node: specifier, message });
      }
    },
  };
}

function createEnvironment(context) {
  const file = repoPath(context.filename);
  if (!/^(server|engine|shared)\//.test(file) || file === "server/environment.ts") return {};
  return {
    MemberExpression(node) {
      const { object, property } = node;
      if (object.type !== "Identifier" || property.type !== "Identifier" || property.name !== "env") return;
      if (object.name !== "process" && object.name !== "Bun") return;
      context.report({
        node,
        message: `Read the environment through \`@/server/environment.ts\` (\`readEnv\`, \`isProduction\`…), which lists every variable: not \`${object.name}.env\`.`,
      });
    },
  };
}

function createErrorNames(context) {
  const message = "An error is named `error`: a `catch`'s binding, and an `onError` callback's first parameter.";
  return {
    CatchClause(node) {
      if (node.param?.type === "Identifier" && node.param.name !== "error")
        context.report({ node: node.param, message });
    },
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : node.key.value;
      if (node.computed || key !== "onError" || !/^(Arrow)?Function(Expression)?$/.test(node.value.type)) return;
      const [first] = node.value.params;
      if (first?.type === "Identifier" && first.name !== "error") context.report({ node: first, message });
    },
  };
}

function createFunctionDeclarations(context) {
  const text = context.sourceCode.text;
  return {
    Program(program) {
      for (const statement of program.body) {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type !== "VariableDeclaration") continue;
        if (declaration.declarations.length !== 1) continue;
        const [declarator] = declaration.declarations;
        const fn = declarator.init;
        if (fn?.type !== "ArrowFunctionExpression" && fn?.type !== "FunctionExpression") continue;
        if (declarator.id.type !== "Identifier") continue;
        // The fix declares what it can as it is: not a function a type annotates (its parameters take their types from
        // it, which a declaration writes out), one a `let` reassigns, or an arrow reading `this`
        const fixable =
          declaration.kind === "const" &&
          !declarator.id.typeAnnotation &&
          !(fn.type === "ArrowFunctionExpression" && readsThis(fn.body));
        context.report({
          node: declarator.id,
          message:
            "A file's own function is a `function` declaration, never a variable holding an arrow: an arrow is for a " +
            "callback. `oxlint --fix` declares one (a typed one's parameters are typed by hand).",
          ...(fixable && {
            fix: (fixer) => {
              const { range, text: replacement } = declarationText(text, statement, declarator);
              return fixer.replaceTextRange(range, replacement);
            },
          }),
        });
      }
    },
  };
}

function createIncludeOrder(context) {
  return {
    CallExpression(call) {
      if (call.callee.type !== "Identifier" || call.callee.name !== "include") return;
      const concerns = call.arguments.slice(1);
      if (concerns.length < 2 || concerns.some((c) => c.type !== "Identifier")) return;
      const names = concerns.map((c) => c.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      if (names.every((name, i) => name === sorted[i])) return;
      context.report({
        node: concerns[names.findIndex((name, i) => name !== sorted[i])],
        message: `A class includes its concerns by name, after its base: \`${sorted.join(", ")}\`.`,
        fix: (fixer) => concerns.map((c, i) => fixer.replaceText(c, sorted[i])),
      });
    },
  };
}

function createNoDisableComments(context) {
  return {
    Program(program) {
      const text = context.sourceCode.text;
      for (const comment of context.sourceCode.getAllComments()) {
        if (!DIRECTIVE.test(comment.value)) continue;
        const line = text.slice(0, comment.start).split("\n").length;
        context.report({
          node: program,
          message: `Line ${line}: no comment turns a rule off: a case the rule gets wrong changes the rule, its options or its definition.`,
        });
      }
    },
  };
}

function createNoHelpersModules(context) {
  const file = repoPath(context.filename);
  if (!GRAB_BAG.test(file)) return {};
  return {
    Program(node) {
      context.report({
        node,
        message:
          "A helper is a module named for what it does (`editableCharacter.ts`, `text.ts`), never a `helpers` or `utils`.",
      });
    },
  };
}

function createNoNullReads(context) {
  if (!repoPath(context.filename).startsWith("server/repositories/")) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        "A repository read says it found nothing with `undefined`, as drizzle does (`findFirst`, `const [row] = …`), never `null`: `null` is a column's empty value.",
    });
  return {
    MethodDefinition(node) {
      const fn = node.value;
      const name = node.key.name;
      if (!fn.body || node.accessibility === "private" || !READ_VERBS.some((verb) => startsWithVerb(name, verb)))
        return;
      if (hasNullMember(fn.returnType?.typeAnnotation)) report(fn.returnType);
      for (const statement of returnsOf(fn.body)) if (isNullFallback(statement.argument)) report(statement);
    },
  };
}

function createNoParentImports(context) {
  const file = repoPath(context.filename);
  // Node loads lint/'s plugins as they are, without the `@/` alias the app's bundlers resolve.
  if (file.startsWith("lint/")) return {};
  const folder = path.posix.dirname(file);
  return onImports((node, spec) => {
    const target = targetOf(file, spec);
    if (spec.startsWith("@/") && target.startsWith(`${folder}/`)) {
      const fixed = `./${path.posix.relative(folder, target)}`;
      context.report({
        node: node.source,
        message: `Import a module of your own folder directly: \`${fixed}\`, not \`${spec}\`.`,
        fix: (fixer) => fixer.replaceText(node.source, JSON.stringify(fixed)),
      });
    }
    if (!spec.startsWith("../")) return;
    const fixed = `@/${target}`;
    context.report({
      node: node.source,
      message: `Import another folder's module through \`@/\`: \`${fixed}\`, not \`${spec}\`.`,
      fix: (fixer) => fixer.replaceText(node.source, JSON.stringify(fixed)),
    });
  });
}

function createOrderThroughRepository(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/") || file === "server/repositories/BaseRepository.ts") return {};
  const message = "Sort with the repository's `this.orderBy(column, direction)`, not drizzle's `asc` / `desc`.";
  const namespaces = new Set();
  return {
    ImportDeclaration(node) {
      if (node.source.value !== "drizzle-orm") return;
      for (const s of node.specifiers ?? []) {
        if (s.type === "ImportSpecifier" && ["asc", "desc"].includes(s.imported.name))
          context.report({ node: s, message });
        if (s.type === "ImportNamespaceSpecifier") namespaces.add(s.local.name);
      }
    },
    // A method that pages (`this.withPagination`, `this.paginate`, `this.paginated`) orders by `this.pageOrder(…)`
    MethodDefinition(node) {
      if (!file.startsWith("server/repositories/") || file === "server/repositories/concerns/Paginates.ts") return;
      const called = new Set();
      for (const call of callsIn(node.value)) {
        const callee = call.callee;
        if (callee.type === "MemberExpression" && callee.object.type === "ThisExpression")
          called.add(callee.property.name);
      }
      if (["withPagination", "paginate", "paginated"].some((name) => called.has(name)) && !called.has("pageOrder")) {
        context.report({
          node: node.key,
          message:
            "A page is ordered by `this.pageOrder(keys)`, which ends on a key no two rows share: OFFSET paging repeats or skips rows that tie.",
        });
      }
    },
    // import * as orm from "drizzle-orm"; orm.desc(…)
    MemberExpression(node) {
      if (
        node.object.type === "Identifier" &&
        namespaces.has(node.object.name) &&
        ["asc", "desc"].includes(node.property.name)
      )
        context.report({ node, message });
    },
  };
}

function createPolicyShape(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/")) return {};
  const inPolicies = file.startsWith("server/services/policies/");
  return {
    MethodDefinition(node) {
      if (!inPolicies || node.key.type !== "Identifier" || node.key.name === "for") return;
      if (node.static) {
        context.report({
          node: node.key,
          message: "A policy's only static is `for`, which builds it: a check is the policy's (`policy.canRead()`).",
        });
      } else if (node.value.async) {
        context.report({
          node: node.key,
          message:
            "A policy's check is sync: `for` loads the standing it reads, and the service passes it the rest " +
            "(`canDeleteEntity({ inUse })`).",
        });
      }
    },
    NewExpression(node) {
      if (inPolicies || node.callee.type !== "Identifier" || !node.callee.name.endsWith("Policy")) return;
      context.report({
        node,
        message: `Build a policy with \`${node.callee.name}.for(db, session, entity)\`: it loads the session's standing on it.`,
      });
    },
  };
}

function createRepositoryInstances(context) {
  if (repoPath(context.filename) === "server/repositories/instances.ts") return {};
  return {
    NewExpression(node) {
      if (node.callee.type === "Identifier" && node.callee.name.endsWith("Repository")) {
        context.report({
          node,
          message: `Use the shared instance from \`@/server/repositories/index.ts\`, which the request cache wraps: never \`new ${node.callee.name}()\`.`,
        });
      }
    },
  };
}

function createRouteConventions(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/")) return {};
  const inRouters = file.startsWith("server/routers/");
  const inApi = file.startsWith("server/routers/api/");
  const constants = new Set();
  const named = new Map();
  return {
    Program(program) {
      if (inRouters) checkRouterTop(context, program, constants);
    },
    "Program:exit"() {
      checkNamedInputs(context, named, constants);
    },
    VariableDeclarator(node) {
      if (inRouters) checkInputRead(context, node);
    },
    // .get("/:id/feats/:featId", …)
    CallExpression(node) {
      if (!inRouters) return;
      const callee = node.callee;
      // validate("param", featParams), validate("json", z.object(…)): a route's input, and the name it's given.
      if (callee.type === "Identifier" && callee.name === "validate") {
        checkValidation(context, node, named);
        return;
      }
      if (callee.type !== "MemberExpression") return;
      // S.get(c.req.valid("param")): a handler reads its input into a const, where the rule sees how it's read
      if (validTargetOf(node) && node.parent?.type !== "VariableDeclarator") {
        context.report({
          node,
          message: 'A route reads its input into a const: `const { id } = c.req.valid("param")`.',
        });
        return;
      }
      // c.json(body) → c.json(body, 200): a route says its status, which its types list.
      if (
        callee.object.type === "Identifier" &&
        callee.object.name === "c" &&
        callee.property.name === "json" &&
        node.arguments.length < 2
      ) {
        context.report({ node, message: "A route answers with its status: `c.json(body, status)`." });
        return;
      }
      // .get("/:id", …), .route("/:id", sub), .on("GET", "/:id", …)
      const route = ROUTE_METHODS.has(callee.property.name)
        ? node.arguments[0]
        : callee.property.name === "on"
          ? node.arguments[1]
          : null;
      const routePath = pathOf(route);
      if (!routePath?.startsWith("/")) return;
      for (const segment of routePath.split("/")) {
        if (segment === "") continue;
        const param = segment.startsWith(":") ? segment.slice(1).replace(/[{?].*$/, "") : null;
        if (param !== null && !CAMEL_CASE.test(param))
          context.report({ node: route, message: `A path param is camelCase: \`:${param}\` isn't.` });
        else if (param === null && !FIXED_SEGMENT.test(segment))
          context.report({ node: route, message: `A path's fixed segment is kebab-case: \`${segment}\` isn't.` });
      }
    },
    // A try that only cleans up (`finally`) lets the error through.
    TryStatement(node) {
      if (!inApi || !node.handler) return;
      context.report({
        node,
        message: "A route lets an error reach the app's `onError`, which answers in the API's envelope: no try.",
      });
    },
    ...onImports((node, spec) => {
      if (spec === "@hono/zod-validator" && !file.startsWith("server/middlewares/")) {
        context.report({
          node,
          message: "Validate with `validate` from `@/server/middlewares/index.ts`: it answers in the API's envelope.",
        });
      }
    }),
  };
}

function createSessionParam(context) {
  if (!repoPath(context.filename).startsWith("server/")) return {};
  const check = (fn) => {
    for (const param of fn.params) {
      const binding = parameter(param);
      if (isSessionType(binding?.typeAnnotation?.typeAnnotation) && !["session", "_session"].includes(binding.name)) {
        context.report({
          node: binding,
          message: `A \`Session\` parameter is named \`session\`, not \`${binding.name}\`.`,
        });
      }
    }
  };
  return {
    FunctionDeclaration: check,
    FunctionExpression: check,
    ArrowFunctionExpression: check,
    // An abstract method's or an overload's signature.
    TSEmptyBodyFunctionExpression: check,
    TSDeclareFunction: check,
  };
}

function createSharedRuntime(context) {
  const file = repoPath(context.filename);
  const reason = RUNTIME_FREE_TREES.find(([tree]) => file.startsWith(tree))?.[1];
  if (!reason) return {};
  return {
    ...onImports((node, spec) => {
      if (spec === "bun" || spec.startsWith("bun:") || isBuiltin(spec))
        context.report({ node, message: `${reason}: it doesn't import \`${spec}\`.` });
    }),
    // Bun.file(…) needs no import.
    Identifier(node) {
      const parent = node.parent;
      const isName =
        (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
        (parent?.type === "Property" && parent.key === node && !parent.computed);
      if (node.name === "Bun" && !isName) context.report({ node, message: `${reason}: it doesn't use \`Bun\`.` });
    },
  };
}

function createTestPlacement(context) {
  const file = repoPath(context.filename);
  const mirror = TEST_MIRRORS.find(([tests]) => file.startsWith(tests));
  const extension = /\.test\.tsx?$/.exec(file)?.[0];
  if (!mirror || !extension) return {};
  const [tests, tree] = mirror;
  const name = path.posix.basename(file, extension);
  const mirrored = `${tree}${path.posix.dirname(file.slice(tests.length))}/`.replace(/\/\.\/$/, "/");
  const byName = modulesIn(rootOf(context.filename), tree);
  const modules = byName.get(name);
  // A module of the test's name in another case: a rename left the test behind
  const recased = modules
    ? undefined
    : [...byName.keys()].find((module) => module.toLowerCase() === name.toLowerCase());
  return {
    Program(node) {
      if (recased) {
        context.report({
          node,
          message: `A test named after \`${recased}\` takes its name, case and all: \`${recased}.test.ts\`.`,
        });
      } else if (modules) {
        if (modules.some((m) => path.posix.dirname(m) + "/" === mirrored)) return;
        const at = modules.map((m) =>
          `${tests}${path.posix.dirname(m.slice(tree.length))}/${name}.test.ts`.replace("/./", "/"),
        );
        context.report({
          node,
          message: `A test named after \`${name}\` sits at its module's mirror: ${at.join(" or ")}.`,
        });
      } else if (/(Service|Policy|Repository)$/.test(name)) {
        context.report({
          node,
          message: `\`${name}.test.ts\` is named after a module, but there's no \`${name}\` in ${tree}.`,
        });
      }
    },
  };
}

function createWritesInTransactions(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("server/") || /^server\/(repositories|database)\//.test(file)) return {};
  // The repositories' shared instances this file imports.
  const repositories = new Set();
  return {
    ImportDeclaration(node) {
      if (!String(node.source.value).startsWith("@/server/repositories/")) return;
      for (const specifier of node.specifiers)
        if (specifier.type === "ImportSpecifier") repositories.add(specifier.local.name);
    },
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return;
      if (callee.object.name === "Promise" && CONCURRENT.has(callee.property.name) && node.arguments[0]) {
        const onTransaction = [...callsIn(node.arguments[0])].some((call) => {
          const handle = call.arguments[0];
          if (handle?.type !== "Identifier") return false;
          if (handle.name === "tx") return true;
          const isRepository = call.callee.type === "MemberExpression" && repositories.has(call.callee.object.name);
          return isRepository && isParameterOf(call, handle.name);
        });
        if (onTransaction) {
          context.report({
            node,
            message:
              "A transaction runs one query at a time, on its one connection: await these in turn, not in `Promise.all` (pg queues them, and pg@9 throws).",
          });
        }
        return;
      }
      if (!repositories.has(callee.object.name) || callee.property.type !== "Identifier") return;
      const method = callee.property.name;
      if (!WRITE_VERBS.some((verb) => startsWithVerb(method, verb))) return;
      const handle = node.arguments[0];
      if (handle?.type === "Identifier" && handle.name === "tx") return;
      context.report({
        node: handle ?? node,
        message: `\`${callee.object.name}.${method}\` writes: give it a transaction's handle, \`tx\` (\`withTransaction(async (tx) => …)\`), not the shared \`db\`.`,
      });
    },
  };
}

/** A const's arrow or function expression written as the function declaration it is. */
function declarationText(text, statement, declarator) {
  const fn = declarator.init;
  const name = declarator.id.name;
  const [start] = statement.range ?? [statement.start, statement.end];
  const [, end] = statement.range ?? [statement.start, statement.end];
  const exported = statement.type === "ExportNamedDeclaration" ? "export " : "";
  const [fnStart, fnEnd] = fn.range ?? [fn.start, fn.end];
  if (fn.type === "FunctionExpression") {
    const rest = text.slice(fnStart, fnEnd).replace(/^(async\s+)?function\s*(\*?)\s*(?:[A-Za-z_$][\w$]*)?\s*/, "");
    return {
      range: [start, end],
      text: `${exported}${fn.async ? "async " : ""}function${fn.generator ? "*" : ""} ${name}${rest}`,
    };
  }
  let headStart = fnStart;
  if (fn.async) headStart = text.indexOf("async", fnStart) + "async".length;
  let typeParameters = "";
  if (fn.typeParameters) {
    const [tpStart, tpEnd] = fn.typeParameters.range ?? [fn.typeParameters.start, fn.typeParameters.end];
    typeParameters = text.slice(tpStart, tpEnd).replace(/,\s*>$/, ">");
    headStart = tpEnd;
  }
  const [bodyStart, bodyEnd] = fn.body.range ?? [fn.body.start, fn.body.end];
  const arrow = text.lastIndexOf("=>", bodyStart);
  let head = text.slice(headStart, arrow).trim();
  if (!head.startsWith("(")) head = `(${head})`;
  const body =
    fn.body.type === "BlockStatement"
      ? text.slice(bodyStart, bodyEnd)
      : `{\n  return ${text.slice(arrow + 2, fnEnd).trim()};\n}`;
  return {
    range: [start, end],
    text: `${exported}${fn.async ? "async " : ""}function ${name}${typeParameters}${head} ${body}`,
  };
}

/**
 * What a test of a list's emptiness checks (`ids.length > 0`, `!ids.length`, `"ids" in where && where.ids.length ===
 * 0`): the list, and whether the test holds when it's empty.
 */
function emptinessTest(node) {
  if (node.type === "LogicalExpression" && node.operator === "&&") return emptinessTest(node.right);
  if (node.type === "UnaryExpression" && node.operator === "!") {
    const inner = lengthOf(node.argument);
    return inner && { list: inner, whenEmpty: true };
  }
  if (node.type === "MemberExpression") {
    const list = lengthOf(node);
    return list && { list, whenEmpty: false };
  }
  if (node.type !== "BinaryExpression" || node.right.type !== "Literal") return undefined;
  const list = lengthOf(node.left);
  if (!list) return undefined;
  const test = `${node.operator} ${node.right.value}`;
  if (["> 0", "!== 0", "!= 0", ">= 1"].includes(test)) return { list, whenEmpty: false };
  if (["=== 0", "== 0", "< 1"].includes(test)) return { list, whenEmpty: true };
  return undefined;
}

/** The function `node` sits in. */
function enclosingFunction(node) {
  let current = node.parent;
  while (current && !/Function(Expression|Declaration)$/.test(current.type)) current = current.parent;
  return current;
}

/**
 * The `-ing` forms a third-person verb can take: `Archives` → `Archiving`, `Stars` → `Starring`, `Scopes` → `Scoping`,
 * `Applies` → `Applying`.
 */
function gerunds(verb) {
  // Applies → Applying
  if (verb.endsWith("ies")) return [`${verb.slice(0, -3)}ying`];
  const base = /(ch|sh|ss|x|z)es$/.test(verb) ? verb.slice(0, -2) : verb.slice(0, -1);
  return [`${base}ing`, `${base.replace(/e$/, "")}ing`, `${base}${base.at(-1)}ing`];
}

/**
 * Whether a type says `null` for nothing: `null`, or a union with it and without `undefined`, under a `Promise`
 * (`Promise<Role | null>`). A nullable column's value (`string | null | undefined`) says both.
 */
function hasNullMember(type) {
  if (!type) return false;
  if (type.type === "TSNullKeyword") return true;
  if (type.type === "TSUnionType") {
    const has = (keyword) => type.types.some((member) => member.type === keyword);
    return has("TSNullKeyword") && !has("TSUndefinedKeyword");
  }
  const isPromise = type.type === "TSTypeReference" && type.typeName?.name === "Promise";
  return isPromise && hasNullMember((type.typeArguments ?? type.typeParameters)?.params[0]);
}

/** Whether a function takes its base class as a concern does: `<B extends Constructor<…>>(Base: B)`. */
function isConcern(fn) {
  return (
    fn.typeParameters?.params[0]?.constraint?.type === "TSTypeReference" &&
    fn.typeParameters.params[0].constraint.typeName.name === "Constructor"
  );
}

/** Whether `node` is an empty value a skipped read stands in for: `[]`, `new Map()`, `Promise.resolve([])`, `false`… */
function isEmptyValue(node) {
  if (!node) return true;
  if (node.type === "ArrayExpression") return node.elements.length === 0;
  if (node.type === "NewExpression") return node.arguments.length === 0;
  if (node.type === "Literal") return node.value === false || node.value === 0 || node.value === null;
  if (node.type === "Identifier") return node.name === "undefined";
  if (node.type === "AwaitExpression") return isEmptyValue(node.argument);
  const callee = node.type === "CallExpression" ? node.callee : undefined;
  const isResolve = callee?.type === "MemberExpression" && callee.object.name === "Promise";
  return isResolve && callee.property.name === "resolve" && isEmptyValue(node.arguments[0]);
}

/** Whether `node` chains a router's routes on its `new Hono()`. */
function isHonoChain(node) {
  let current = node;
  while (current?.type === "CallExpression" && current.callee.type === "MemberExpression")
    current = current.callee.object;

  return current?.type === "NewExpression" && current.callee.type === "Identifier" && current.callee.name === "Hono";
}

/** Whether `node` is `null`, or gives `null` for nothing: `x ?? null`, `x || null`, `x ? y : null`. */
function isNullFallback(node) {
  if (!node) return false;
  if (node.type === "Literal") return node.raw === "null";
  if (node.type === "LogicalExpression") return isNullFallback(node.right);
  if (node.type === "ConditionalExpression") return isNullFallback(node.consequent) || isNullFallback(node.alternate);
  return false;
}

/** Whether `name` is a parameter of a function `node` sits in: a handle it's given, which may be a transaction. */
function isParameterOf(node, name) {
  for (let p = node.parent; p; p = p.parent)
    if (p.params?.some((param) => parameter(param)?.name === name)) return true;

  return false;
}

/** Whether a type is `Session`, or a union with it (`Session | null`). */
function isSessionType(type) {
  if (type?.type === "TSUnionType") return type.types.some(isSessionType);
  return type?.type === "TSTypeReference" && type.typeName.type === "Identifier" && type.typeName.name === "Session";
}

/** Whether `node` sits in a call to one of `names` (`or(…)`, `not(…)`) below `root`. */
function isUnderCall(node, root, names) {
  for (let current = node.parent; current && current !== root; current = current.parent) {
    if (
      current.type === "CallExpression" &&
      current.callee.type === "Identifier" &&
      names.includes(current.callee.name)
    )
      return true;
  }
  return false;
}

/** The list whose `.length` `node` reads, as a node: `ids` in `ids.length`, `where.ids` in `where.ids.length`. */
function lengthOf(node) {
  const isLength = node?.type === "MemberExpression" && !node.computed && node.property.name === "length";
  return isLength ? node.object : undefined;
}

/**
 * Every module under `tree` (a repo path), by its name without the extension: `FeatsService` → its paths. Read again
 * for each test file, not cached: an editor's language server lints for as long as it runs, and a module added since
 * must count.
 */
function modulesIn(root, tree) {
  const byName = new Map();
  const walk = (dir) => {
    if (!fs.existsSync(path.join(root, dir))) return;
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) {
        walk(`${rel}/`);
      } else if (/\.(tsx?|mjs)$/.test(entry.name) && !/\.d\.m?ts$/.test(entry.name)) {
        const name = entry.name.replace(/\.(tsx?|mjs)$/, "");
        byName.set(name, [...(byName.get(name) ?? []), rel]);
      }
    }
  };
  walk(tree);
  return byName;
}

/** A parameter's binding: `session: Session`, a constructor's `private session: Session`, or one with a default. */
function parameter(param) {
  let binding = param.type === "TSParameterProperty" ? param.parameter : param;
  if (binding.type === "AssignmentPattern") binding = binding.left;
  return binding.type === "Identifier" ? binding : null;
}

/** A route's path, written as a string or a template literal (its fixed parts). */
function pathOf(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked).join("");
  return null;
}

/** Whether a function's body reads `this`, which a declaration would rebind. */
function readsThis(node) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(readsThis);
  if (node.type === "ThisExpression") return true;
  if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") return false;
  return Object.entries(node).some(
    ([key, child]) => key !== "parent" && child && typeof child === "object" && readsThis(child),
  );
}

/** Whether `node`'s subtree reads the variable `name` whole (passes, spreads or returns it), not only its fields. */
function readsWhole(node, name) {
  if (node.type === "Identifier" && node.name === name) {
    const parent = node.parent;
    if (parent?.type === "VariableDeclarator" && (parent.id === node || parent.id.type === "ObjectPattern"))
      return false;
    if (parent?.type === "MemberExpression" && !parent.computed) return false;
    return !(parent?.type === "Property" && parent.key === node && !parent.shorthand);
  }
  return Object.entries(node).some(
    ([key, value]) =>
      key !== "parent" &&
      (Array.isArray(value) ? value : [value]).some(
        (child) => typeof child?.type === "string" && readsWhole(child, name),
      ),
  );
}

/** The statement a guard `return`s with, alone: `return [];` or `{ return []; }`. */
function returnedBy(statement) {
  if (statement.type === "BlockStatement" && statement.body.length === 1) return returnedBy(statement.body[0]);
  return statement.type === "ReturnStatement" ? statement : undefined;
}

/** The `return` statements of `fn` itself, not of the functions inside it. */
function* returnsOf(node, fn = node) {
  if (node !== fn && /Function(Expression|Declaration)$/.test(node.type)) return;
  if (node.type === "ReturnStatement") yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value])
      if (typeof child?.type === "string") yield* returnsOf(child, fn);
  }
}

/** A `c.req.valid(target)` call's target, if `node` is one. */
function validTargetOf(node) {
  const callee = node?.type === "CallExpression" ? node.callee : null;
  if (callee?.type !== "MemberExpression" || callee.property.name !== "valid") return null;
  const request = callee.object;
  if (request.type !== "MemberExpression" || request.property.name !== "req" || request.object.name !== "c")
    return null;
  return node.arguments[0]?.value ?? null;
}

export default {
  "no-parent-imports": { meta: { type: "suggestion", fixable: "code" }, create: createNoParentImports },
  "no-helpers-modules": { meta: { type: "suggestion" }, create: createNoHelpersModules },
  "repository-instances": { meta: { type: "problem" }, create: createRepositoryInstances },
  "route-conventions": { meta: { type: "problem" }, create: createRouteConventions },
  environment: { meta: { type: "problem" }, create: createEnvironment },
  "no-disable-comments": { meta: { type: "problem" }, create: createNoDisableComments },
  "writes-in-transactions": { meta: { type: "problem" }, create: createWritesInTransactions },
  "empty-list-reads": { meta: { type: "suggestion" }, create: createEmptyListReads },
  "no-null-reads": { meta: { type: "suggestion" }, create: createNoNullReads },
  "order-through-repository": { meta: { type: "suggestion" }, create: createOrderThroughRepository },
  "shared-runtime": { meta: { type: "problem" }, create: createSharedRuntime },
  "engine-classes": { meta: { type: "problem" }, create: createEngineClasses },
  "engine-sync": { meta: { type: "problem" }, create: createEngineSync },
  "session-param": { meta: { type: "suggestion" }, create: createSessionParam },
  "test-placement": { meta: { type: "suggestion" }, create: createTestPlacement },
  "policy-shape": { meta: { type: "problem" }, create: createPolicyShape },
  "class-file-names": { meta: { type: "suggestion" }, create: createClassFileNames },
  "concern-shape": { meta: { type: "suggestion" }, create: createConcernShape },
  "include-order": { meta: { type: "suggestion", fixable: "code" }, create: createIncludeOrder },
  "error-names": { meta: { type: "suggestion" }, create: createErrorNames },
  "function-declarations": { meta: { type: "suggestion", fixable: "code" }, create: createFunctionDeclarations },
};
