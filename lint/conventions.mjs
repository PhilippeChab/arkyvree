/**
 * The conventions AGENTS.md lists, as rules, so code can't drift from them:
 *
 * - `no-parent-imports`: a file imports another folder's module through `@/` (the repo's root), never `../`.
 *   `oxlint --fix` rewrites one.
 * - `no-helpers-modules`: a helper is a module named for what it does, never a `helpers.ts` grab bag (the server,
 *   `shared/` and the client; the tests' and seeders' helpers are their own).
 * - `repository-instances`: code uses the repositories' shared instances (`@/server/repositories/index.ts`), which
 *   the request cache wraps; only that file builds one.
 * - `route-conventions`: a route's path params are camelCase (`:modifierId`), its validation is the app's `zValidator`
 *   (`@/server/middlewares/index.ts`, which answers in the API's error envelope), and it lets an error reach
 *   `onError` instead of catching it (`server/routers/api/`).
 * - `order-through-repository`: the server's queries sort with a repository's `this.orderBy(column, direction)`, never
 *   drizzle's `asc` / `desc`.
 * - `shared-runtime`: `shared/` runs in the client too, so it imports neither Bun's APIs nor Node's.
 * - `session-param`: a `Session` parameter is named `session` (`_session` when it's unused).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */
import path from "node:path";

import { onImports, targetOf } from "./imports.mjs";
import { repoPath } from "./paths.mjs";

const noParentImports = {
  meta: { type: "suggestion", fixable: "code" },
  create(context) {
    const file = repoPath(context.filename);
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

const noHelpersModules = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    if (!HELPER_TREES.some((t) => file.startsWith(t)) || !/^helpers\.tsx?$/.test(path.posix.basename(file))) return {};
    return {
      Program(node) {
        context.report({
          node,
          message: "A helper is a module named for what it does (`editableCharacter.ts`), never a `helpers.ts`.",
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

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
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
        if (callee.type !== "MemberExpression" || !ROUTE_METHODS.has(callee.property.name)) return;
        const [route] = node.arguments;
        if (route?.type !== "Literal" || typeof route.value !== "string" || !route.value.startsWith("/")) return;
        for (const segment of route.value.split("/")) {
          const param = segment.startsWith(":") ? segment.slice(1).replace(/[{?].*$/, "") : null;
          if (param && !CAMEL_CASE.test(param)) {
            context.report({ node: route, message: `A path param is camelCase: \`:${param}\` isn't.` });
          }
        }
      },
      TryStatement(node) {
        if (!inApi) return;
        context.report({
          node,
          message: "A route lets an error reach the app's `onError`, which answers in the API's envelope: no try.",
        });
      },
      ImportDeclaration(node) {
        if (node.source.value === "@hono/zod-validator" && !file.startsWith("server/middlewares/")) {
          context.report({
            node,
            message:
              "Validate with `zValidator` from `@/server/middlewares/index.ts`: it answers in the API's envelope.",
          });
        }
      },
    };
  },
};

const orderThroughRepository = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    if (!file.startsWith("server/") || file === "server/repositories/BaseRepository.ts") return {};
    return {
      ImportDeclaration(node) {
        if (node.source.value !== "drizzle-orm") return;
        for (const s of node.specifiers ?? []) {
          if (s.type === "ImportSpecifier" && ["asc", "desc"].includes(s.imported.name)) {
            context.report({
              node: s,
              message: "Sort with the repository's `this.orderBy(column, direction)`, not drizzle's `asc` / `desc`.",
            });
          }
        }
      },
    };
  },
};

const sharedRuntime = {
  meta: { type: "problem" },
  create(context) {
    if (!repoPath(context.filename).startsWith("shared/")) return {};
    return onImports((node, spec) => {
      if (spec === "bun" || spec.startsWith("bun:") || spec.startsWith("node:")) {
        context.report({
          node,
          message: `\`shared/\` runs in the client too: it doesn't import \`${spec}\`.`,
        });
      }
    });
  },
};

/** A parameter's binding and its type annotation: `session: Session`, or a constructor's `private session: Session`. */
function parameter(param) {
  const binding = param.type === "TSParameterProperty" ? param.parameter : param;
  return binding.type === "Identifier" ? binding : null;
}

const sessionParam = {
  meta: { type: "suggestion" },
  create(context) {
    if (!repoPath(context.filename).startsWith("server/")) return {};
    const check = (fn) => {
      for (const param of fn.params) {
        const binding = parameter(param);
        const type = binding?.typeAnnotation?.typeAnnotation;
        if (
          type?.type === "TSTypeReference" &&
          type.typeName.type === "Identifier" &&
          type.typeName.name === "Session" &&
          !["session", "_session"].includes(binding.name)
        ) {
          context.report({
            node: binding,
            message: `A \`Session\` parameter is named \`session\`, not \`${binding.name}\`.`,
          });
        }
      }
    };
    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check };
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
};
