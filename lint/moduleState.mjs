/**
 * `module-state`: state lives in a class. What a module of the server or `shared/` keeps between calls is the field of
 * a class whose methods change it, and the class's shared instance is the module's export (`export default new X()`):
 * never a top-level `let`, nor a top-level binding the module changes (a member assigned or deleted, `++`, a container's
 * `set` / `add` / `push`…). A constant is a value; an `AsyncLocalStorage`'s `run` scopes a callback, and changes none.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

/** The methods that change the object they're called on: a container's (Map, Set, Array) and a context's. */
const MUTATORS = new Set([
  "set",
  "add",
  "delete",
  "clear",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  "enterWith",
  "disable",
]);

/** The names a declaration binds: an identifier, or each one a destructuring pattern holds. */
function boundNames(pattern) {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((p) => boundNames(p.type === "RestElement" ? p.argument : p.value));
    case "ArrayPattern":
      return pattern.elements.flatMap((e) => boundNames(e));
    case "RestElement":
      return boundNames(pattern.argument);
    case "AssignmentPattern":
      return boundNames(pattern.left);
    default:
      return [];
  }
}

/** The identifier at the root of `x.a.b` / `x[k]`, or the identifier itself. */
function rootIdentifier(node) {
  let current = node;
  while (current?.type === "MemberExpression") current = current.object;
  while (current?.type === "TSNonNullExpression") current = current.expression;
  return current?.type === "Identifier" ? current : undefined;
}

/** The top-level node a binding of the module changes, if `node` changes one: what it changes, and how. */
function changedBinding(node) {
  if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression") return rootIdentifier(node.left);
  if (node.type === "UpdateExpression" && node.argument.type === "MemberExpression") {
    return rootIdentifier(node.argument);
  }
  if (node.type === "UnaryExpression" && node.operator === "delete") return rootIdentifier(node.argument);
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed) {
    if (MUTATORS.has(node.callee.property.name)) return rootIdentifier(node.callee.object);
    const { object, property } = node.callee;
    if (object.type === "Identifier" && object.name === "Object" && property.name === "assign") {
      return rootIdentifier(node.arguments[0]);
    }
  }
  return undefined;
}

/** The names a node declares in the scope it opens: a function's parameters, a block's own declarations. */
function scopeNames(node) {
  const names = new Set();
  const isFunction = /Function/.test(node.type);
  if (isFunction) for (const param of node.params ?? []) for (const name of boundNames(param)) names.add(name);
  const body = isFunction ? node.body?.body : node.type === "BlockStatement" ? node.body : undefined;
  for (const statement of Array.isArray(body) ? body : []) {
    if (statement.type === "VariableDeclaration") {
      for (const declarator of statement.declarations) for (const name of boundNames(declarator.id)) names.add(name);
    } else if ((statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") && statement.id) {
      names.add(statement.id.name);
    }
  }
  if (node.type === "CatchClause") for (const name of boundNames(node.param)) names.add(name);
  if (/^For(In|Of)?Statement$/.test(node.type) && node.left?.type === "VariableDeclaration") {
    for (const declarator of node.left.declarations) for (const name of boundNames(declarator.id)) names.add(name);
  }
  if (node.type === "ForStatement" && node.init?.type === "VariableDeclaration") {
    for (const declarator of node.init.declarations) for (const name of boundNames(declarator.id)) names.add(name);
  }
  return names;
}

/** Walks the module's code: each change to a top-level binding that no inner scope shadows. */
function findChanges(program, bindings) {
  const changes = [];
  const visit = (node, shadowed) => {
    if (!node || typeof node.type !== "string") return;
    const inner = scopeNames(node);
    const scope = inner.size > 0 ? new Set([...shadowed, ...inner]) : shadowed;
    const changed = changedBinding(node);
    if (changed && bindings.has(changed.name) && !scope.has(changed.name)) changes.push(changed);
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent") continue;
      if (Array.isArray(value)) for (const child of value) visit(child, scope);
      else if (value && typeof value === "object") visit(value, scope);
    }
  };
  for (const statement of program.body) visit(statement, new Set());
  return changes;
}

/** Each top-level declaration of the module: its declarator, and whether it's a `let` / `var`. */
function topLevelDeclarators(program) {
  const declarators = [];
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) declarators.push({ declarator, kind: declaration.kind });
  }
  return declarators;
}

function createModuleState(context) {
  if (!/^(server|shared)\//.test(repoPath(context.filename))) return {};
  const advice =
    "State lives in a class: a field of the class whose methods change it, its shared instance the module's export.";
  return {
    Program(program) {
      const constants = new Set();
      for (const { declarator, kind } of topLevelDeclarators(program)) {
        for (const name of boundNames(declarator.id)) {
          if (kind === "const") constants.add(name);
          else context.report({ node: declarator, message: `\`${name}\` is state the module keeps. ${advice}` });
        }
      }
      for (const identifier of findChanges(program, constants)) {
        context.report({
          node: identifier,
          message: `\`${identifier.name}\` is state the module keeps: the module changes it. ${advice}`,
        });
      }
    },
  };
}

export default {
  "module-state": { meta: { type: "problem" }, create: createModuleState },
};
