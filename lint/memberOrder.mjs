/**
 * One member order for every class and every file's functions: sync before async, then the lifecycle (load, preload,
 * initialize, build, apply, in that order), reads, creates, updates, deletes, then the other actions, by name within
 * each group. A router's routes sort by HTTP method and path. `oxlint --fix` puts a file in order.
 *
 * - A class's methods group by their leading verb (`findOne` reads, `archiveCharacter` deletes): its private and
 *   protected methods first, then its public ones, the sync ones before the async ones in each. The constructor,
 *   statics and fields stay at the top, in their own order (a field's initializer may read an earlier one).
 * - A file's own functions, in each run of them: its helpers, then its exports, as `file-layout` sections them (an
 *   export a helper calls is a helper), each in that order. A function another one calls stays above it (the file
 *   reads bottom-up), so functions never call each other. A comment set apart by a blank line ends a run: `--fix`
 *   would lose its place, and `comment-style` reports it.
 * - A router's routes group by HTTP method (GET, POST, PUT, PATCH, DELETE), then sort by path: a fixed segment
 *   before a parameter, which Hono needs anyway (it matches overlapping routes in the order they're registered).
 *   Its sub-routers (`.route()`) come first, in their own order, then its routes, which must not overlap theirs:
 *   Hono would run the sub-router's first (tests/routers/application.test.ts checks every route answers its own
 *   requests). A run of routes ends at a `.use()` or anything else: middleware applies to what follows it.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { rankStatements } from "./layout.mjs";
import { isToolWritten } from "./paths.mjs";

/**
 * A method's group, by its leading verb: a word followed by a capital or nothing (`get`, `getRuleset`). The lifecycle
 * comes first, in pipeline order rather than by name: a class that sets itself up reads top-down.
 */
const LIFECYCLE = ["load", "preload", "init", "initialize", "build", "apply"];
const VERB_GROUPS = [
  LIFECYCLE,
  ["find", "get", "list", "exists", "count", "search", "has", "is", "resolve", "validate", "download"],
  ["create", "add", "insert", "duplicate", "bulkCreate"],
  ["update", "set", "mark", "replace", "upsert", "backfill"],
  ["delete", "remove", "archive", "unarchive", "hardDelete", "purge"],
];
const ACTIONS = VERB_GROUPS.length;

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete"];

function isMount(call) {
  return call.callee.type === "MemberExpression" && call.callee.property.name === "route";
}

function isRoute(call) {
  return (
    call.callee.type === "MemberExpression" &&
    ROUTE_METHODS.includes(call.callee.property.name) &&
    call.arguments[0]?.type === "Literal" &&
    typeof call.arguments[0].value === "string"
  );
}

/** Two ranks' order, element by element. */
function compareRanks(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    return typeof a[i] === "string" ? (a[i] < b[i] ? -1 : 1) : a[i] - b[i];
  }
  return 0;
}

function compareMembers(a, b) {
  if (a.rank[0] !== b.rank[0]) return a.rank[0] - b.rank[0];
  // The constructor, statics and fields keep their order.
  if (a.rank[0] < -1) return a.index - b.index;
  // A getter and its setter, or an overload's signatures and body, stay in their order.
  return compareRanks(a.rank, b.rank) || a.index - b.index;
}

/** A top-level function statement's declaration, exported or not, or null: a run of them sorts. */
function functionOf(statement) {
  const declaration =
    statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
      ? statement.declaration
      : statement;
  const isFunction = declaration?.type === "FunctionDeclaration" || declaration?.type === "TSDeclareFunction";
  return isFunction && declaration.id ? declaration : null;
}

/** The names `node` reads: what a function calls, or passes on. */
function namesIn(node, names = new Set()) {
  if (node.type === "Identifier" || node.type === "JSXIdentifier") names.add(node.name);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (typeof child?.type === "string") namesIn(child, names);
    }
  }
  return names;
}

function rangeOf(node) {
  return node.range ?? [node.start, node.end];
}

/** Reorders `items` (each with `node`, `start`, `end`): one report, one fix rewriting [from, to). */
function reportOrder(context, items, sorted, render, message) {
  const outOfPlace = items.findIndex((item, i) => item !== sorted[i]);
  if (outOfPlace === -1) return;
  context.report({
    node: items[outOfPlace].node,
    message,
    fix: (fixer) => fixer.replaceTextRange(render.range, render.text(sorted)),
  });
}

/** A path's segments, each a kind (0 fixed, 1 parameter, 2 wildcard) and its text. */
function segments(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => [segment.startsWith(":") ? 1 : segment.includes("*") ? 2 : 0, segment]);
}

/** Two routes' order: by method, then by path, a fixed segment before a parameter, a parameter before a wildcard. */
export function compareRoutes(a, b) {
  const byMethod = ROUTE_METHODS.indexOf(a.method) - ROUTE_METHODS.indexOf(b.method);
  if (byMethod) return byMethod;
  const sa = segments(a.path);
  const sb = segments(b.path);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (!sa[i]) return -1;
    if (!sb[i]) return 1;
    const [kindA, textA] = sa[i];
    const [kindB, textB] = sb[i];
    if (kindA !== kindB) return kindA - kindB;
    if (kindA === 0 && textA !== textB) return textA < textB ? -1 : 1;
  }
  return 0;
}

/** A run's order: its sub-routers first, as they come, then its routes, sorted. */
function compareRunMembers(a, b) {
  if (a.mount !== b.mount) return a.mount ? -1 : 1;
  return (a.mount ? 0 : compareRoutes(a.route, b.route)) || a.index - b.index;
}

/** A run's order: by rank, a function another one calls above it; the functions left calling each other, if any. */
function sortRun(items) {
  const byName = new Map(items.map((item) => [item.name, item]));
  for (const item of items) {
    item.callees = [...item.names].filter((n) => n !== item.name && byName.has(n)).map((n) => byName.get(n));
  }
  const placed = new Set();
  const order = [];
  while (order.length < items.length) {
    const left = items.filter((item) => !placed.has(item));
    const ready = left.filter((item) => item.callees.every((callee) => placed.has(callee)));
    if (ready.length === 0) return { order, cycle: left };
    const next = ready.reduce((best, item) =>
      (compareRanks(item.rank, best.rank) || item.index - best.index) < 0 ? item : best,
    );
    placed.add(next);
    order.push(next);
  }
  return { order, cycle: [] };
}

function checkRun(context, items) {
  if (items.length < 2) return;
  const text = context.sourceCode.text;
  const { order, cycle } = sortRun(items);
  if (cycle.length > 0) {
    context.report({
      node: cycle[0].node,
      message: `Functions that call each other (${cycle.map((item) => item.name).join(", ")}): untangle them, so the file reads bottom-up.`,
    });
    return;
  }
  reportOrder(
    context,
    items,
    order,
    {
      range: [items[0].start, items.at(-1).end],
      text: (order) => order.map((item) => text.slice(item.start, item.end)).join("\n\n"),
    },
    "A file's functions go in order: its helpers, then its exports, each sync before async, then by verb " +
      "group and name, as a class's methods; a function another one calls stays above it.",
  );
}

/** Whether `name` starts with the word `verb`: `find` starts `findOne`, not `finder`. */
export function startsWithVerb(name, verb) {
  return new RegExp(`^${verb}(?=[A-Z0-9]|$)`).test(name);
}

/** A lifecycle method's step (`load` before `build`), or 0 for any other method. */
export function lifecycleStep(name) {
  return LIFECYCLE.findIndex((verb) => startsWithVerb(name, verb)) + 1;
}

/** The comment that ends the line at `pos` (` // note`), which belongs to what ends there: its length, or 0. */
function trailingComment(text, pos) {
  const lineEnd = text.indexOf("\n", pos);
  const rest = text.slice(pos, lineEnd === -1 ? text.length : lineEnd);
  return /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(rest) ? rest.trimEnd().length : 0;
}

function checkChain(context, outermost) {
  const text = context.sourceCode.text;
  const calls = [];
  for (let n = outermost; n.type === "CallExpression" && n.callee.type === "MemberExpression"; n = n.callee.object) {
    calls.unshift(n);
  }
  // Runs of consecutive routes and sub-routers.
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const items = run.map((call, index) => ({
        node: call.callee.property,
        index,
        mount: isMount(call),
        route: isMount(call) ? null : { method: call.callee.property.name, path: call.arguments[0].value },
        // From the line after what it's called on, its comments and `.get(…)`, to the comment ending its own line.
        start: rangeOf(call.callee.object)[1] + trailingComment(text, rangeOf(call.callee.object)[1]),
        codeEnd: rangeOf(call)[1],
        end: rangeOf(call)[1] + trailingComment(text, rangeOf(call)[1]),
      }));
      const sorted = [...items].sort(compareRunMembers);
      const mountsFirst = items.every((item, i) => !item.mount || items.slice(0, i).every((before) => before.mount));
      // What follows the run on its last line (the chain's `;`, a next call) stays right after the last route's
      // code: a comment ending the new last route's line goes after it, not over it.
      const runEnd = items.at(-1).end;
      const lineEnd = text.indexOf("\n", runEnd);
      const after = text.slice(runEnd, lineEnd === -1 ? text.length : lineEnd).trimEnd();
      reportOrder(
        context,
        items,
        sorted,
        {
          range: [items[0].start, runEnd + after.length],
          text: (order) =>
            order
              .map((i, k) =>
                k === order.length - 1
                  ? text.slice(i.start, i.codeEnd) + after + text.slice(i.codeEnd, i.end)
                  : text.slice(i.start, i.end),
              )
              .join(""),
        },
        mountsFirst
          ? "Routes go in CRUD order: GET, POST, PUT, PATCH, DELETE, by path in each (a fixed segment before a parameter)."
          : "A router mounts its sub-routers (`.route()`) first, after its middleware, then its own routes.",
      );
    }
    run = [];
  };
  for (const call of calls) {
    if (isRoute(call) || isMount(call)) run.push(call);
    else flush();
  }
  flush();
}

export function verbGroup(name) {
  const index = VERB_GROUPS.findIndex((verbs) => verbs.some((verb) => startsWithVerb(name, verb)));
  return index === -1 ? ACTIONS : index;
}

/** Where a function goes among its peers: [async, group, lifecycle step, name]. */
function functionRank(name, isAsync) {
  return [isAsync ? 1 : 0, verbGroup(name), lifecycleStep(name), name];
}

/**
 * A file's own functions, run by run: consecutive top-level function declarations, which a comment set apart by a
 * blank line or any other statement ends.
 */
function checkFunctions(context, program) {
  const text = context.sourceCode.text;
  // Its helpers, then what it's for, as `file-layout` ranks them: an export a helper calls is a helper.
  const sections = new Map(rankStatements(program.body).map((item) => [item.statement, item.rank]));
  let run = [];
  let previousEnd = 0;
  for (const statement of program.body) {
    const declaration = functionOf(statement);
    const [start, codeEnd] = rangeOf(statement);
    const end = codeEnd + trailingComment(text, codeEnd);
    const between = text.slice(previousEnd, start);
    previousEnd = end;
    // Its comments: those right above it, after the last blank line.
    const blank = [...between.matchAll(/\n[ \t]*\n/g)].at(-1);
    const attached = (blank ? between.slice(blank.index + blank[0].length) : between).trimStart();
    const heading = between.slice(0, between.length - attached.length);
    if (!declaration || /\/[/*]/.test(heading)) {
      checkRun(context, run);
      run = [];
      if (!declaration) continue;
    }
    const name = declaration.id.name;
    const last = run.at(-1);
    // An overload's signatures and its body are one function.
    if (last?.name === name && last.overload) {
      last.end = end;
      last.overload = declaration.type === "TSDeclareFunction";
      last.rank = [last.rank[0], ...functionRank(name, declaration.async)];
      namesIn(declaration, last.names);
      continue;
    }
    run.push({
      node: declaration.id,
      name,
      index: run.length,
      overload: declaration.type === "TSDeclareFunction",
      rank: [sections.get(statement), ...functionRank(name, declaration.async)],
      names: namesIn(declaration),
      start: start - attached.length,
      end,
    });
  }
  checkRun(context, run);
}

/**
 * Where a class member goes: [rank, async, group, lifecycle step, name]. The constructor (-4), statics (-3) and fields
 * (-2) keep their order; private and protected methods (-1), then public ones (0), sort sync before async, then by
 * verb group (the lifecycle by step), then name. `asyncNames`: the methods with an async body, whose overload
 * signatures go with it.
 */
function memberRank(member, asyncNames) {
  if (member.kind === "constructor") return [-4, 0, 0, 0, ""];
  if (member.static) return [-3, 0, 0, 0, ""];
  if (member.type !== "MethodDefinition" && member.type !== "TSAbstractMethodDefinition") return [-2, 0, 0, 0, ""];
  const name = member.key?.name ?? member.key?.value;
  if (typeof name !== "string") return [-2, 0, 0, 0, ""];
  const isPublic =
    (!member.accessibility || member.accessibility === "public") && member.key?.type !== "PrivateIdentifier";
  return [isPublic ? 0 : -1, ...functionRank(name, asyncNames.has(name))];
}

function checkClass(context, body) {
  const text = context.sourceCode.text;
  const [bodyStart, bodyEnd] = rangeOf(body);
  // A comment ending the line of the `{`, or of a member, stays with it.
  const headEnd = bodyStart + 1 + trailingComment(text, bodyStart + 1);
  const members = [];
  const asyncNames = new Set(
    body.body.filter((node) => node.value?.async).map((node) => node.key?.name ?? node.key?.value),
  );
  for (const [index, node] of body.body.entries()) {
    const [start, memberEnd] = rangeOf(node);
    const end = memberEnd + trailingComment(text, memberEnd);
    const previousEnd = index === 0 ? headEnd : members[index - 1].end;
    // What sits between the previous member and this one: its comments.
    const comments = text.slice(previousEnd, start).trim();
    members.push({ node, index, rank: memberRank(node, asyncNames), start, end, comments });
  }
  const sorted = [...members].sort(compareMembers);
  const indent = " ".repeat(context.sourceCode.getLocFromIndex?.(members[0]?.start ?? 0)?.column ?? 2);
  const tail = text.slice(members.at(-1)?.end ?? headEnd, bodyEnd - 1).trim();
  reportOrder(
    context,
    members,
    sorted,
    {
      range: [bodyStart, bodyEnd],
      text: (order) =>
        text.slice(bodyStart, headEnd) +
        order
          .map(
            (m, i) =>
              (i === 0 ? "\n" : "\n\n") +
              indent +
              (m.comments ? m.comments + "\n" + indent : "") +
              text.slice(m.start, m.end),
          )
          .join("") +
        (tail ? "\n\n" + indent + tail : "") +
        "\n}",
    },
    "Members go in order: sync before async, then the lifecycle (load, preload, initialize, build, apply), reads, " +
      "creates, updates, deletes, then the other actions, by name in each group.",
  );
}

export default {
  meta: { name: "arkyvree" },
  rules: {
    "member-order": {
      meta: { type: "suggestion", fixable: "code" },
      create(context) {
        return {
          ClassBody(body) {
            checkClass(context, body);
          },
          Program(program) {
            // A declaration file follows the module it types.
            if (isToolWritten(context.filename) || /\.d\.[cm]?ts$/.test(context.filename)) return;
            checkFunctions(context, program);
          },
          CallExpression(call) {
            if (!/\/server\/routers\//.test(context.filename)) return;
            const parent = call.parent;
            // Only the outermost call of a chain.
            if (parent?.type === "MemberExpression" && parent.object === call) return;
            if (call.callee.type === "MemberExpression") checkChain(context, call);
          },
        };
      },
    },
  },
};
