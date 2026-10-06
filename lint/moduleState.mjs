/**
 * `module-state`: state lives in a class. What a module of the server, `shared/` or `database/` keeps between calls is
 * the field of a class whose methods change it, and the class's shared instance is the module's export (`export
 * default new X()`): never a top-level `let`, nor a top-level binding the module changes (a member assigned or deleted,
 * `++`, a container's `set` / `add` / `push`…), nor an instance the module keeps to itself (`const cache = new
 * DependentCache()`, whose state its methods change). A constant is a value (a `Set` it reads, a `RegExp`); an
 * `AsyncLocalStorage`'s `run` scopes a callback, and changes none.
 *
 * Known limits, which static analysis can't follow: a binding changed through an alias (`const m = seen; m.set(…)`) or
 * by a function it's passed to (`put(seen)`).
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

/**
 * The classes whose instance is a value or a context, not state a module keeps: a container's changes are reported as
 * such, and an `AsyncLocalStorage`'s `run` scopes a callback. `Intl`'s formatters too (`new Intl.NumberFormat()`).
 */
const VALUE_CLASSES = new Set(["Set", "Map", "WeakMap", "WeakSet", "RegExp", "URL", "Date", "AsyncLocalStorage"]);

/** What wraps an expression without changing what it refers to: a cast, a non-null assertion, parentheses, a `?.`. */
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
  "ChainExpression",
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

/** The top-level node a binding of the module changes, if `node` changes one: what it changes, and how. */
function changedBinding(node) {
  if (node.type === "AssignmentExpression" && node.left.type !== "Identifier") return rootIdentifier(node.left);
  if (node.type === "UpdateExpression" && node.argument.type !== "Identifier") return rootIdentifier(node.argument);
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

function createModuleState(context) {
  if (!/^(server|shared|database)\//.test(repoPath(context.filename))) return {};
  const advice =
    "State lives in a class: a field of the class whose methods change it, its shared instance the module's export.";
  return {
    Program(program) {
      const constants = new Set();
      const exported = exportedNames(program);
      for (const { declarator, kind, exported: declaredExported } of topLevelDeclarators(program)) {
        for (const name of boundNames(declarator.id)) {
          if (kind === "const") constants.add(name);
          else context.report({ node: declarator, message: `\`${name}\` is state the module keeps. ${advice}` });
        }
        const { id } = declarator;
        let init = declarator.init;
        while (init && WRAPPERS.has(init.type)) init = init.expression;
        if (kind !== "const" || id.type !== "Identifier" || init?.type !== "NewExpression") continue;
        if (declaredExported || exported.has(id.name) || isValueClass(init.callee)) continue;
        context.report({
          node: declarator,
          message: `\`${id.name}\` is an instance the module keeps to itself. ${advice}`,
        });
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

/** The names the module exports by name (`export { a, b }`, `export default a`), which a declaration doesn't say. */
function exportedNames(program) {
  const names = new Set();
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration" && !statement.declaration) {
      for (const specifier of statement.specifiers)
        if (specifier.local.type === "Identifier") names.add(specifier.local.name);
    }
    if (statement.type === "ExportDefaultDeclaration" && statement.declaration?.type === "Identifier") {
      names.add(statement.declaration.name);
    }
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

/** Whether `new` of `callee` makes a value or a context (`VALUE_CLASSES`, `Intl`'s), not state. */
function isValueClass(callee) {
  if (callee.type === "Identifier") return VALUE_CLASSES.has(callee.name);
  return callee.type === "MemberExpression" && callee.object.type === "Identifier" && callee.object.name === "Intl";
}

/** The identifier at the root of `x.a.b` / `x[k]` / `(x as T).a` / `x!.a`, or the identifier itself. */
function rootIdentifier(node) {
  let current = node;
  while (current && (current.type === "MemberExpression" || WRAPPERS.has(current.type))) {
    current = current.type === "MemberExpression" ? current.object : current.expression;
  }
  return current?.type === "Identifier" ? current : undefined;
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
  // A case's declarations are the switch's, braces or not
  if (node.type === "SwitchStatement") {
    for (const statement of node.cases.flatMap((c) => c.consequent)) {
      if (statement.type === "VariableDeclaration") {
        for (const declarator of statement.declarations) for (const name of boundNames(declarator.id)) names.add(name);
      } else if ((statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") && statement.id) {
        names.add(statement.id.name);
      }
    }
  }
  if (/^For(In|Of)?Statement$/.test(node.type) && node.left?.type === "VariableDeclaration") {
    for (const declarator of node.left.declarations) for (const name of boundNames(declarator.id)) names.add(name);
  }
  if (node.type === "ForStatement" && node.init?.type === "VariableDeclaration") {
    for (const declarator of node.init.declarations) for (const name of boundNames(declarator.id)) names.add(name);
  }
  return names;
}

/** Each top-level declaration of the module: its declarator, whether it's a `let` / `var`, and whether it's exported. */
function topLevelDeclarators(program) {
  const declarators = [];
  for (const statement of program.body) {
    const exported = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration";
    const declaration = exported ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations)
      declarators.push({ declarator, kind: declaration.kind, exported });
  }
  return declarators;
}

export default {
  "module-state": { meta: { type: "problem" }, create: createModuleState },
};
