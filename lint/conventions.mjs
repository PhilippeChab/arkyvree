/**
 * The conventions AGENTS.md lists, as rules, so code can't drift from them:
 *
 * - `no-parent-imports`: a file imports another folder's module through `@/` (the repo's root), never `../`.
 *   `oxlint --fix` rewrites one. Not in `lint/`, whose plugins node loads without the alias.
 * - `no-helpers-modules`: a helper is a module named for what it does, never a `helpers` or `utils` grab bag, file or
 *   folder (the server, `shared/` and the client; the tests' and seeders' helpers are their own).
 * - `repository-instances`: code uses the repositories' shared instances (`@/server/repositories/index.ts`), which
 *   the request cache wraps; only that file builds one.
 * - `route-conventions`: a route's path params are camelCase (`:modifierId`; `.get`, `.route`, `.on`), its validation
 *   is the app's `zValidator` (`@/server/middlewares/index.ts`, which answers in the API's error envelope), and it lets
 *   an error reach `onError` instead of catching it (`server/routers/api/`; a `finally` alone is fine).
 * - `order-through-repository`: the server's queries sort with a repository's `this.orderBy(column, direction)`, never
 *   drizzle's `asc` / `desc`.
 * - `shared-runtime`: `shared/` runs in the client too, so it uses neither Bun's APIs (`bun`, the `Bun` global) nor
 *   Node's (`node:fs`, `fs`).
 * - `session-param`: a `Session` parameter is named `session` (`_session` when it's unused).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */
import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import { onImports, targetOf } from "./imports.mjs";
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
        // .get("/:id", …), .route("/:id", sub), .on("GET", "/:id", …)
        const route = ROUTE_METHODS.has(callee.property.name)
          ? node.arguments[0]
          : callee.property.name === "on"
            ? node.arguments[1]
            : null;
        const routePath = pathOf(route);
        if (!routePath?.startsWith("/")) return;
        for (const segment of routePath.split("/")) {
          const param = segment.startsWith(":") ? segment.slice(1).replace(/[{?].*$/, "") : null;
          if (param && !CAMEL_CASE.test(param)) {
            context.report({ node: route, message: `A path param is camelCase: \`:${param}\` isn't.` });
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

/** A parameter's binding: `session: Session`, a constructor's `private session: Session`, or one with a default. */
function parameter(param) {
  let binding = param.type === "TSParameterProperty" ? param.parameter : param;
  if (binding.type === "AssignmentPattern") binding = binding.left;
  return binding.type === "Identifier" ? binding : null;
}

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

const moduleCache = new Map();
/** Every module under `tree` (a repo path), by its name without the extension: `FeatsService` → its paths. */
function modulesIn(root, tree) {
  const key = `${root}:${tree}`;
  if (!moduleCache.has(key)) {
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
    moduleCache.set(key, byName);
  }
  return moduleCache.get(key);
}

const testPlacement = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    const mirror = TEST_MIRRORS.find(([tests]) => file.startsWith(tests));
    if (!mirror || !file.endsWith(".test.ts")) return {};
    const [tests, tree] = mirror;
    const name = path.posix.basename(file, ".test.ts");
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

export const rules = {
  "no-parent-imports": noParentImports,
  "no-helpers-modules": noHelpersModules,
  "repository-instances": repositoryInstances,
  "route-conventions": routeConventions,
  "order-through-repository": orderThroughRepository,
  "shared-runtime": sharedRuntime,
  "session-param": sessionParam,
  "test-placement": testPlacement,
};
