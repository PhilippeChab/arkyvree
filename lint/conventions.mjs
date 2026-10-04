/**
 * The conventions AGENTS.md lists, as rules, so code can't drift from them:
 *
 * - `no-parent-imports`: a file imports another folder's module through `@/` (the repo's root), never `../`.
 *   `oxlint --fix` rewrites one. Not in `lint/`, whose plugins node loads without the alias.
 * - `no-helpers-modules`: a helper is a module named for what it does, never a `helpers` or `utils` grab bag, file or
 *   folder (the server, `shared/` and the client; the tests' and seeders' helpers are their own).
 * - `repository-instances`: code uses the repositories' shared instances (`@/server/repositories/index.ts`), which
 *   the request cache wraps; only that file builds one.
 * - `route-conventions`: a route's path params are camelCase (`:modifierId`; `.get`, `.route`, `.on`) and its fixed
 *   segments kebab-case (`/class-levels`; a file's name, `robots.txt`, or `*` too), it answers with its status
 *   (`c.json(body, status)`), its validation
 *   is the app's `zValidator` (`@/server/middlewares/index.ts`, which answers in the API's error envelope), and it lets
 *   an error reach `onError` instead of catching it (`server/routers/api/`; a `finally` alone is fine).
 * - `order-through-repository`: the server's queries sort with a repository's `this.orderBy(column, direction)`, never
 *   drizzle's `asc` / `desc`.
 * - `shared-runtime`: `shared/` runs in the client too, so it uses neither Bun's APIs (`bun`, the `Bun` global) nor
 *   Node's (`node:fs`, `fs`).
 * - `session-param`: a `Session` parameter is named `session` (`_session` when it's unused).
 * - `writes-in-transactions`: a repository write or lock (`methodVerbs.json`'s verbs) outside the repositories takes a
 *   transaction's handle, `tx` (`withTransaction(async (tx) => …)`), never the shared `db`: a write is atomic with the
 *   rest of its request, and a lock holds until its transaction ends. A transaction's queries run one at a time, on its
 *   one connection: never in a `Promise.all` (`tx`, or a handle the function is given, which may be a transaction).
 * - `directive-reasons`: a comment that turns a lint rule off says why, after `--`
 *   (`// oxlint-disable-next-line rule -- why`), so the exception explains itself where it's made.
 * - `environment`: the server reads its environment in `server/environment.ts` only (`readEnv`, `isProduction`…),
 *   which lists every variable: never `process.env` or `Bun.env` elsewhere in the server or `shared/`.
 * - `test-placement`: a test named after a module sits at that module's mirror (`tests/services/…` ↔
 *   `server/services/…`); a test of a behavior across modules is free in its area.
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
import { startsWithVerb } from "./memberOrder.mjs";
import { repoPath, rootOf } from "./paths.mjs";

const noParentImports = {
  meta: { type: "suggestion", fixable: "code" },
  create(context) {
    const file = repoPath(context.filename);
    // Node loads lint/'s plugins as they are, without the `@/` alias the app's bundlers resolve.
    if (file.startsWith("lint/")) return {};
    return onImports((node, spec) => {
      if (!spec.startsWith("../")) return;
      const fixed = `@/${targetOf(file, spec)}`;
      context.report({
        node: node.source,
        message: `Import another folder's module through \`@/\`: \`${fixed}\`, not \`${spec}\`.`,
        fix: (fixer) => fixer.replaceText(node.source, JSON.stringify(fixed)),
      });
    });
  },
};

const HELPER_TREES = ["server/", "shared/", "client/"];
/** A module or folder named for no particular thing: `helpers.ts`, `utils/`. */
const GRAB_BAG = /(^|\/)(helpers|utils?)(\.tsx?$|\/)/;

const noHelpersModules = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    if (!HELPER_TREES.some((t) => file.startsWith(t)) || !GRAB_BAG.test(file)) return {};
    return {
      Program(node) {
        context.report({
          node,
          message:
            "A helper is a module named for what it does (`editableCharacter.ts`, `text.ts`), never a `helpers` or `utils`.",
        });
      },
    };
  },
};

const repositoryInstances = {
  meta: { type: "problem" },
  create(context) {
    if (repoPath(context.filename) === "server/repositories/index.ts") return {};
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
  },
};

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "route"]);

/** A route's path, written as a string or a template literal (its fixed parts). */
function pathOf(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked).join("");
  return null;
}
const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
// kebab-case, a file's name (`sitemap.xml`) or a wildcard
const FIXED_SEGMENT = /^([a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)?|\*)$/;

const routeConventions = {
  meta: { type: "problem" },
  create(context) {
    const file = repoPath(context.filename);
    if (!file.startsWith("server/")) return {};
    const inRouters = file.startsWith("server/routers/");
    const inApi = file.startsWith("server/routers/api/");
    return {
      // .get("/:id/feats/:featId", …)
      CallExpression(node) {
        if (!inRouters) return;
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
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
          if (param !== null && !CAMEL_CASE.test(param)) {
            context.report({ node: route, message: `A path param is camelCase: \`:${param}\` isn't.` });
          } else if (param === null && !FIXED_SEGMENT.test(segment)) {
            context.report({ node: route, message: `A path's fixed segment is kebab-case: \`${segment}\` isn't.` });
          }
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
            message:
              "Validate with `zValidator` from `@/server/middlewares/index.ts`: it answers in the API's envelope.",
          });
        }
      }),
    };
  },
};

const METHOD_VERBS = JSON.parse(
  fs.readFileSync(new URL("../server/repositories/methodVerbs.json", import.meta.url), "utf8"),
);
const WRITE_VERBS = [...METHOD_VERBS.write, ...METHOD_VERBS.lock];

/** A parameter's binding: `session: Session`, a constructor's `private session: Session`, or one with a default. */
function parameter(param) {
  let binding = param.type === "TSParameterProperty" ? param.parameter : param;
  if (binding.type === "AssignmentPattern") binding = binding.left;
  return binding.type === "Identifier" ? binding : null;
}

/** The calls in `node`'s subtree, itself included. */
function* callsIn(node) {
  if (node.type === "CallExpression") yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (typeof child?.type === "string") yield* callsIn(child);
    }
  }
}

/** Whether `name` is a parameter of a function `node` sits in: a handle it's given, which may be a transaction. */
function isParameterOf(node, name) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.params?.some((param) => parameter(param)?.name === name)) return true;
  }
  return false;
}

const CONCURRENT = new Set(["all", "allSettled", "any", "race"]);

const writesInTransactions = {
  meta: { type: "problem" },
  create(context) {
    const file = repoPath(context.filename);
    if (!file.startsWith("server/") || /^server\/(repositories|database)\//.test(file)) return {};
    // The repositories' shared instances this file imports.
    const repositories = new Set();
    return {
      ImportDeclaration(node) {
        if (!String(node.source.value).startsWith("@/server/repositories/")) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") repositories.add(specifier.local.name);
        }
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
  },
};

// An `eslint-disable` / `oxlint-disable` comment's text: its rules, then its reason after `--`.
const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b/;

const directiveReasons = {
  meta: { type: "suggestion" },
  create(context) {
    return {
      Program(program) {
        const text = context.sourceCode.text;
        for (const comment of context.sourceCode.getAllComments()) {
          if (!DIRECTIVE.test(comment.value)) continue;
          // A block comment's reason may wrap to its next line.
          if (/--\s*\S/.test(comment.value)) continue;
          const line = text.slice(0, comment.start).split("\n").length;
          context.report({
            node: program,
            message: `Line ${line}: a comment that turns a rule off says why, after \`--\` (\`// oxlint-disable-next-line rule -- why\`).`,
          });
        }
      },
    };
  },
};

const environment = {
  meta: { type: "problem" },
  create(context) {
    const file = repoPath(context.filename);
    if (!/^(server|shared)\//.test(file) || file === "server/environment.ts") return {};
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
  },
};

const orderThroughRepository = {
  meta: { type: "suggestion" },
  create(context) {
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
      // import * as orm from "drizzle-orm"; orm.desc(…)
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          namespaces.has(node.object.name) &&
          ["asc", "desc"].includes(node.property.name)
        ) {
          context.report({ node, message });
        }
      },
    };
  },
};

const sharedRuntime = {
  meta: { type: "problem" },
  create(context) {
    if (!repoPath(context.filename).startsWith("shared/")) return {};
    return {
      ...onImports((node, spec) => {
        if (spec === "bun" || spec.startsWith("bun:") || isBuiltin(spec)) {
          context.report({ node, message: `\`shared/\` runs in the client too: it doesn't import \`${spec}\`.` });
        }
      }),
      // Bun.file(…) needs no import.
      Identifier(node) {
        const parent = node.parent;
        const isName =
          (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
          (parent?.type === "Property" && parent.key === node && !parent.computed);
        if (node.name === "Bun" && !isName) {
          context.report({ node, message: "`shared/` runs in the client too: it doesn't use `Bun`." });
        }
      },
    };
  },
};

/** Whether a type is `Session`, or a union with it (`Session | null`). */
function isSessionType(type) {
  if (type?.type === "TSUnionType") return type.types.some(isSessionType);
  return type?.type === "TSTypeReference" && type.typeName.type === "Identifier" && type.typeName.name === "Session";
}

const sessionParam = {
  meta: { type: "suggestion" },
  create(context) {
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
  },
};

/** Each test area and the source tree it mirrors. */
const TEST_MIRRORS = [
  ["tests/services/", "server/services/"],
  ["tests/routers/", "server/routers/"],
  ["tests/jobs/", "server/jobs/"],
  ["tests/cache/", "server/cache/"],
  ["tests/rulesets/", "server/rulesets/"],
  ["tests/middlewares/", "server/middlewares/"],
  ["tests/emails/", "server/emails/"],
  ["tests/shared/", "shared/"],
  ["tests/client/", "client/src/"],
  ["tests/lint/", "lint/"],
  ["tests/scripts/", "scripts/"],
];

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
      if (entry.isDirectory()) walk(`${rel}/`);
      else if (/\.(tsx?|mjs)$/.test(entry.name) && !/\.d\.m?ts$/.test(entry.name)) {
        const name = entry.name.replace(/\.(tsx?|mjs)$/, "");
        byName.set(name, [...(byName.get(name) ?? []), rel]);
      }
    }
  };
  walk(tree);
  return byName;
}

const testPlacement = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    const mirror = TEST_MIRRORS.find(([tests]) => file.startsWith(tests));
    const extension = /\.test\.tsx?$/.exec(file)?.[0];
    if (!mirror || !extension) return {};
    const [tests, tree] = mirror;
    const name = path.posix.basename(file, extension);
    const mirrored = `${tree}${path.posix.dirname(file.slice(tests.length))}/`.replace(/\/\.\/$/, "/");
    const modules = modulesIn(rootOf(context.filename), tree).get(name);
    return {
      Program(node) {
        if (modules) {
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
  },
};

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

/** Whether a function takes its base class as a concern does: `<B extends Constructor<…>>(Base: B)`. */
const isConcern = (fn) =>
  fn.typeParameters?.params[0]?.constraint?.type === "TSTypeReference" &&
  fn.typeParameters.params[0].constraint.typeName.name === "Constructor";

const concernShape = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    return {
      FunctionDeclaration(fn) {
        if (!fn.id || !isConcern(fn) || fn.parent?.type !== "ExportNamedDeclaration") return;
        const name = fn.id.name;
        if (path.posix.basename(file).replace(/\.tsx?$/, "") !== name) {
          context.report({ node: fn.id, message: `A concern sits in a file of its name: \`${name}.ts\`.` });
        }
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
  },
};

export const rules = {
  "no-parent-imports": noParentImports,
  "no-helpers-modules": noHelpersModules,
  "repository-instances": repositoryInstances,
  "route-conventions": routeConventions,
  environment,
  "directive-reasons": directiveReasons,
  "writes-in-transactions": writesInTransactions,
  "order-through-repository": orderThroughRepository,
  "shared-runtime": sharedRuntime,
  "session-param": sessionParam,
  "test-placement": testPlacement,
  "concern-shape": concernShape,
};
