/**
 * `file-layout`: a file reads in one order, so its parts are always where you look for them: its imports, its types,
 * its constants, its helpers, then what the file is for (its exports, its class, a test file's `describe` and `test`
 * blocks, an index's re-exports). A helper is a function the file keeps to itself, or a constant one builds, or an
 * export another helper calls; a test file's helper never sits in a `describe`. A top-level side effect (a script's
 * call, an `await`) is the file's purpose too, and a declaration after one is a step of its run, keeping its place.
 * `oxlint --fix` puts a file in order, each statement above what uses it, and lifts a helper out of a `describe` when it
 * uses nothing the block declares and its name is free (the report says what to change otherwise). What a tool writes
 * keeps the tool's layout: the parser's `generated/`, drizzle's schema and relations.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

const TOOL_WRITTEN = /(^|\/)generated\/|^drizzle\/(schema|relations)\.ts$/;

const FUNCTION_VALUES = new Set(["ArrowFunctionExpression", "FunctionExpression", "ClassExpression"]);

const SUITE_CALLS = new Set(["describe", "test", "it", "beforeAll", "beforeEach", "afterAll", "afterEach"]);

// The groups, in a file's order
const RANK = { type: 1, constant: 2, helper: 3, main: 4 };

// What a type position holds: never an order a value needs
const TYPE_KEYS = new Set(["typeAnnotation", "returnType", "typeParameters", "typeArguments", "superTypeArguments"]);

const MESSAGE =
  "A file reads in order: its imports, its types, its constants, its helpers, then what it's for (its exports, " +
  "its class, its tests). `oxlint --fix` orders it.";

const LOOPS = new Set(["ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement"]);

const rangeOf = (node) => node.range ?? [node.start, node.end];

/** A top-level statement's declaration: an export's, or itself. */
const declarationOf = (statement) =>
  statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
    ? statement.declaration
    : statement;

const holdsFunction = (node) =>
  node?.type === "FunctionDeclaration" ||
  node?.type === "TSDeclareFunction" ||
  (node?.type === "VariableDeclaration" && node.declarations.some((d) => FUNCTION_VALUES.has(d.init?.type)));

/** The function a call starts from: `describe` in `describe.each(cases)(…)`. */
function calleeOf(expression) {
  let node = expression;
  while (node?.type === "CallExpression" || node?.type === "MemberExpression") {
    node = node.type === "CallExpression" ? node.callee : node.object;
  }
  return node?.type === "Identifier" ? node.name : undefined;
}

/** Whether a node calls `describe`, `test` or a hook somewhere inside it. */
function hasSuiteCall(node) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(hasSuiteCall);
  if (node.type === "CallExpression" && SUITE_CALLS.has(calleeOf(node))) return true;
  return Object.entries(node).some(
    ([key, child]) => key !== "parent" && child && typeof child === "object" && hasSuiteCall(child),
  );
}

/** What a top-level statement is: an import, a type, a constant, a helper, the file's purpose, or a side effect. */
function kindOf(statement) {
  if (statement.type === "ImportDeclaration" || statement.type === "TSImportEqualsDeclaration") return "import";
  if (statement.type === "ExportAllDeclaration") return "main";
  if (statement.type === "ExportNamedDeclaration" && !statement.declaration) return "main";
  if (statement.type === "TSModuleDeclaration") return "type";
  const declaration = declarationOf(statement);
  if (declaration?.type === "TSTypeAliasDeclaration" || declaration?.type === "TSInterfaceDeclaration") return "type";
  if (statement.type === "ExportDefaultDeclaration" || declaration?.type === "ClassDeclaration") return "main";
  if (declaration?.type === "TSEnumDeclaration") return "constant";
  if (holdsFunction(declaration)) return statement.type === "ExportNamedDeclaration" ? "main" : "helper";
  if (declaration?.type === "VariableDeclaration") return "constant";
  if (statement.type === "ExpressionStatement" && SUITE_CALLS.has(calleeOf(statement.expression))) return "main";
  // A loop declaring tests (`for (const c of cases) test(…)`) is a test file's purpose too
  if (LOOPS.has(statement.type) && hasSuiteCall(statement.body)) return "main";
  return "effect";
}

/** The names a pattern binds: `a`, `{ a, b: c }`, `[a, ...b]`. */
function boundNames(pattern, into = []) {
  if (!pattern) return into;
  if (pattern.type === "Identifier") into.push(pattern.name);
  else if (pattern.type === "ObjectPattern")
    for (const p of pattern.properties) boundNames(p.value ?? p.argument, into);
  else if (pattern.type === "ArrayPattern") for (const e of pattern.elements) boundNames(e, into);
  else if (pattern.type === "RestElement") boundNames(pattern.argument, into);
  else if (pattern.type === "AssignmentPattern") boundNames(pattern.left, into);
  return into;
}

/** The names a top-level statement declares. */
function declaredNames(statement) {
  const declaration = declarationOf(statement);
  if (!declaration) return [];
  if (declaration.type === "VariableDeclaration") return declaration.declarations.flatMap((d) => boundNames(d.id));
  return declaration.id?.name ? [declaration.id.name] : [];
}

/** The names a node reads as values: not a member's or a key's name, nor anything in a type. */
function readNames(node, into = new Set(), types = false) {
  if (!node || typeof node !== "object") return into;
  if (Array.isArray(node)) {
    for (const child of node) readNames(child, into, types);
    return into;
  }
  if (!types && typeof node.type === "string" && node.type.startsWith("TS") && !("expression" in node)) return into;
  // A component a JSX element renders is read by its name too (`<PrivateRoute />`)
  if (node.type === "Identifier" || node.type === "JSXIdentifier") into.add(node.name);
  for (const [key, child] of Object.entries(node)) {
    if (key === "parent" || (!types && TYPE_KEYS.has(key))) continue;
    if (key === "property" && node.type === "MemberExpression" && !node.computed) continue;
    if (key === "key" && !node.computed && /Property|MethodDefinition/.test(node.type)) continue;
    if (child && typeof child === "object") readNames(child, into, types);
  }
  return into;
}

/** The end of a statement, with the comment ending its line (` // note`). */
function endOf(text, statement) {
  const [, end] = rangeOf(statement);
  const lineEnd = text.indexOf("\n", end);
  const rest = text.slice(end, lineEnd === -1 ? text.length : lineEnd);
  return /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(rest) ? end + rest.trimEnd().length : end;
}

const holdsOrClass = (item) =>
  holdsFunction(declarationOf(item.statement)) || declarationOf(item.statement)?.type === "ClassDeclaration";

/** Whether a statement awaits at the top level: a step of a script's run (`const rows = await query(…)`). */
function awaits(node) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(awaits);
  if (node.type === "AwaitExpression") return true;
  if (FUNCTION_VALUES.has(node.type) || node.type === "FunctionDeclaration") return false;
  return Object.entries(node).some(
    ([key, child]) => key !== "parent" && child && typeof child === "object" && awaits(child),
  );
}

/**
 * Each statement's group, which its dependencies can move: an export a helper calls is a helper, and a statement sits
 * in no earlier group than a value it reads (a constant one of the file's functions builds sits with them).
 */
function rankStatements(statements) {
  // After a side effect, a declaration is a step of the run (a script's connection, a table a loop fills): it keeps
  // its place among the effects
  let afterEffect = false;
  const items = statements.map((statement, index) => {
    let kind = kindOf(statement);
    if (kind === "constant" && (afterEffect || awaits(statement))) kind = "effect";
    if (kind === "effect") afterEffect = true;
    return { statement, index, kind, rank: RANK[kind] ?? RANK.main, names: declaredNames(statement) };
  });
  const declaredBy = new Map(items.flatMap((item) => item.names.map((name) => [name, item])));
  for (const item of items) {
    item.reads = item.kind === "type" ? [] : [...readNames(item.statement)].map((n) => declaredBy.get(n));
    item.reads = item.reads.filter((dep) => dep && dep !== item && dep.kind !== "type");
  }
  const lifted = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const item of items) {
      for (const dep of item.reads) {
        // A helper's building block is a helper too, once: what it reads may still rank it later
        if (item.rank === RANK.helper && dep.rank === RANK.main && holdsOrClass(dep) && !lifted.has(dep)) {
          lifted.add(dep);
          dep.rank = RANK.helper;
          changed = true;
        }
        if (dep.rank > item.rank) {
          item.rank = dep.rank;
          changed = true;
        }
      }
    }
  }
  return items;
}

/** The file's statements reordered by group, each with its comments, or none when a reader must place them. */
function reorder(text, statements, items) {
  const firstBody = items.findIndex((item) => item.kind !== "import");
  if (items.slice(firstBody).some((item) => item.kind === "import")) return undefined;
  const body = items.slice(firstBody);
  const sorted = [...body].sort((a, b) => a.rank - b.rank || a.index - b.index);
  // A file's `#!` line stays its first
  const head = text.startsWith("#!") ? text.indexOf("\n") + 1 : 0;
  // Each statement's chunk: from the end of the one before it (its comments come along) to its own end
  const chunk = (item) =>
    text.slice(item.index === 0 ? head : endOf(text, statements[item.index - 1]), endOf(text, item.statement));
  const start = firstBody === 0 ? head : endOf(text, statements[firstBody - 1]);
  const lead = firstBody === 0 ? "" : "\n\n";
  return {
    range: [start, endOf(text, statements.at(-1))],
    // The first keeps the file's head (a blank line after the imports); one that opened the file gets its own
    text: sorted
      .map((item, i) => {
        const text = chunk(item);
        if (i === 0) return lead + text.replace(/^\s*\n/, "");
        return /^\s*\n/.test(text) ? text : `\n\n${text}`;
      })
      .join(""),
  };
}

/** The names the functions and blocks around a nested statement declare: what a helper lifted out would lose. */
function enclosingNames(ancestors, statement) {
  const names = new Set();
  for (const node of ancestors) {
    for (const param of node.params ?? []) for (const n of boundNames(param)) names.add(n);
  }
  for (const block of ancestors.filter((a) => a.type === "BlockStatement")) {
    for (const s of block.body ?? []) {
      if (s === statement) continue;
      if (s.type === "VariableDeclaration")
        for (const d of s.declarations) for (const n of boundNames(d.id)) names.add(n);
      if (s.type === "FunctionDeclaration" && s.id) names.add(s.id.name);
    }
  }
  return names;
}

/** The nodes around a node, the program first. */
function ancestorsOf(node) {
  const ancestors = [];
  for (let n = node.parent; n; n = n.parent) ancestors.unshift(n);
  return ancestors;
}

/** Its own comment's start: the comment lines right above a statement's line. */
function attachedStart(text, lineStart) {
  let from = lineStart;
  while (from > 0) {
    const previous = text.lastIndexOf("\n", from - 2) + 1;
    const line = text.slice(previous, from - 1);
    if (line.trim() === "" || !/^\s*(\/\/|\/\*|\*)/.test(line)) break;
    from = previous;
  }
  return from;
}

/** Whether a statement sits right in a `describe`'s callback: not in a test's, nor any deeper. */
function isInDescribe(statement) {
  const block = statement.parent;
  const callback = block?.type === "BlockStatement" ? block.parent : undefined;
  const call = callback?.parent;
  return (
    (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") &&
    call?.type === "CallExpression" &&
    calleeOf(call) === "describe"
  );
}

/** The names a file declares at its top, its imports' included. */
function topLevelNames(program) {
  const names = new Set();
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") for (const spec of statement.specifiers) names.add(spec.local.name);
    else for (const n of declaredNames(statement)) names.add(n);
  }
  return names;
}

/** The names of every helper a file declares in its `describe` blocks, a name twice when two blocks share it. */
function describeHelperNames(program) {
  const names = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (
      (node.type === "FunctionDeclaration" || node.type === "VariableDeclaration") &&
      holdsFunction(node) &&
      isInDescribe(node)
    ) {
      names.push(...declaredNames(node));
    }
    for (const [key, child] of Object.entries(node))
      if (key !== "parent" && child && typeof child === "object") visit(child);
  };
  visit(program.body);
  return names;
}

/** A helper in a `describe`: reported, and lifted above the top-level statement holding it when it can be. */
function checkNested(context, text, statement) {
  if (!holdsFunction(statement) || !isInDescribe(statement)) return;
  const ancestors = ancestorsOf(statement);
  const program = ancestors[0];
  const top = ancestors[1];
  const reads = readNames(statement, new Set(), true);
  const local = enclosingNames(ancestors, statement);
  // Lifted as it is: it reads nothing its blocks declare, and its name is free at the top and in the other blocks
  const name = declaredNames(statement)[0];
  const taken = topLevelNames(program);
  const twins = describeHelperNames(program).filter((n) => n === name).length;
  // Its own parameters shadow the blocks' names
  const fn = statement.type === "VariableDeclaration" ? statement.declarations[0]?.init : statement;
  const own = new Set((fn?.params ?? []).flatMap((param) => boundNames(param)));
  const uses = [...local].filter((n) => !own.has(n) && reads.has(n));
  const liftable = uses.length === 0 && !taken.has(name) && twins === 1;
  // Why it stays, when it does: what to change before it can move
  const why = uses.length
    ? ` It uses ${uses.map((n) => `\`${n}\``).join(", ")} from its block: pass ${uses.length > 1 ? "them" : "it"} in.`
    : liftable
      ? ""
      : ` Its name \`${name}\` is taken at the top or in another block: rename it.`;
  const [start] = rangeOf(statement);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const indent = start - lineStart;
  const from = attachedStart(text, lineStart);
  const end = endOf(text, statement);
  const lifted = text
    .slice(from, end)
    .split("\n")
    .map((line) => (line.slice(0, indent).trim() === "" ? line.slice(indent) : line))
    .join("\n");
  const index = program.body.indexOf(top);
  const insertAt = index <= 0 ? 0 : endOf(text, program.body[index - 1]);
  context.report({
    node: statement,
    message: `A test file's helpers sit at its top, never in a \`describe\`. \`oxlint --fix\` lifts one there.${why}`,
    ...(liftable && {
      fix: (fixer) => [
        fixer.removeRange([from - 1, end]),
        fixer.insertTextAfterRange([insertAt, insertAt], index <= 0 ? lifted + "\n\n" : "\n\n" + lifted),
      ],
    }),
  });
}

const fileLayout = {
  meta: { type: "suggestion", fixable: "code" },
  create(context) {
    // What a tool writes keeps the tool's layout: the parser's output, drizzle's schema and relations
    if (TOOL_WRITTEN.test(repoPath(context.filename))) return {};
    const text = context.sourceCode.text;
    return {
      Program(node) {
        const statements = node.body;
        const items = rankStatements(statements);
        const firstBody = items.findIndex((item) => item.kind !== "import");
        if (firstBody === -1) return;
        const misplaced = [];
        let highest = 0;
        for (const item of items.slice(firstBody)) {
          if (item.kind === "import" || item.rank < highest) misplaced.push(item);
          highest = Math.max(highest, item.rank);
        }
        if (misplaced.length === 0) return;
        const order = reorder(text, statements, items);
        context.report({
          node: declarationOf(misplaced[0].statement) ?? misplaced[0].statement,
          message: MESSAGE,
          ...(order && { fix: (fixer) => fixer.replaceTextRange(order.range, order.text) }),
        });
      },
      FunctionDeclaration: (statement) => checkNested(context, text, statement),
      VariableDeclaration: (statement) => checkNested(context, text, statement),
    };
  },
};

export const rules = { "file-layout": fileLayout };
