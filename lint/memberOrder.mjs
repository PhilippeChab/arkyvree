/**
 * One order for every class and every file's declarations: by name (ignoring case), in each of their groups. A router's
 * routes sort by HTTP method and path. `oxlint --fix` puts a file in order.
 *
 * - A class's methods: its private and protected ones first, then its public ones, the sync ones before the async ones
 *   in each, by name. The constructor, statics and fields stay at the top, in their own order (a field's initializer
 *   may read an earlier one).
 * - A file's types, constants and functions, in each run of them: by name, within the sections `file-layout` gives
 *   them (its own types, then the ones it exports; the same for its constants; its helpers, then its exports, an export
 *   a helper calls being a helper), its functions sync before async. What a constant reads goes right above it: the
 *   file reads it as it loads. A function is hoisted: it goes by name, whatever it calls. `--fix` never swaps two
 *   constants whose values run code (a call, `new`, `await`): it suggests it, which `--fix-suggestions` applies once
 *   nothing depends on the order they run in. A comment set apart by a blank line
 *   ends a run: `--fix` would lose its place, and `comment-style` reports it.
 * - A router's routes group by HTTP method (GET, POST, PUT, PATCH, DELETE), then sort by path: a fixed segment
 *   before a parameter, which Hono needs anyway (it matches overlapping routes in the order they're registered).
 *   Its sub-routers (`.route()`) come first, in their own order, then its routes, which must not overlap theirs:
 *   Hono would run the sub-router's first (tests/routers/application.test.ts checks every route answers its own
 *   requests). A run of routes ends at a `.use()` or anything else: middleware applies to what follows it.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { declarationOf, rankStatements, runsAtLoad } from "./layout.mjs";

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete"];

/** What each kind of run's report says. */
const RUN_ORDERS = {
  constant: "A file's constants go by name: its own, then the ones it exports; what one reads goes right above it.",
  function: "A file's functions go by name: its helpers, then its exports, each sync before async.",
  type: "A file's types go by name: its own, then the ones it exports.",
};

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
    "Members go in order: the private and protected methods, then the public ones, each sync before async, then by name.",
  );
}

/**
 * A file's types, constants and functions, run by run: consecutive top-level declarations of one kind, which a
 * comment set apart by a blank line or any other statement ends.
 */
function checkDeclarations(context, program) {
  const text = context.sourceCode.text;
  // Each statement's section, as `file-layout` ranks it, and what it reads
  const ranked = rankStatements(program.body);
  const runItemOf = new Map();
  let run = [];
  let previousEnd = 0;
  for (const item of ranked) {
    const sortable = sortableOf(item);
    const [start, codeEnd] = rangeOf(item.statement);
    const end = codeEnd + trailingComment(text, codeEnd);
    const between = text.slice(previousEnd, start);
    previousEnd = end;
    // Its comments: those right above it, after the last blank line.
    const blank = [...between.matchAll(/\n[ \t]*\n/g)].at(-1);
    const attached = (blank ? between.slice(blank.index + blank[0].length) : between).trimStart();
    const heading = between.slice(0, between.length - attached.length);
    if (!sortable || sortable.kind !== run[0]?.kind || /\/[/*]/.test(heading)) {
      checkRun(context, run, runItemOf);
      run = [];
      if (!sortable) continue;
    }
    const last = run.at(-1);
    // An overload's signatures and its body are one function.
    if (sortable.kind === "function" && last?.name === sortable.name && last.overload) {
      Object.assign(last, { end, overload: sortable.overload, rank: [last.rank[0], ...sortable.rank.slice(1)] });
      last.statements.push(item);
      runItemOf.set(item, last);
      continue;
    }
    const runItem = { ...sortable, index: run.length, statements: [item], start: start - attached.length, end };
    runItemOf.set(item, runItem);
    run.push(runItem);
  }
  checkRun(context, run, runItemOf);
}

/** A run of a file's types, constants or functions, in order; `runItemOf` finds the run item of what one reads. */
function checkRun(context, items, runItemOf) {
  if (items.length < 2) return;
  const text = context.sourceCode.text;
  for (const item of items) {
    // A constant is read as the file loads; a function, hoisted, goes by name whatever it calls
    const reads =
      item.kind !== "constant"
        ? []
        : item.statements.flatMap((statement) => statement.reads).map((dep) => runItemOf.get(dep));
    item.uses = [...new Set(reads)].filter((dep) => dep && dep !== item && items.includes(dep));
  }
  const { order, cycle } = sortRun(items);
  if (cycle.length > 0) {
    const names = cycle.map((item) => item.name).join(", ");
    context.report({
      node: cycle[0].node,
      message: `Constants that read each other (${names}): untangle them, so the file reads bottom-up.`,
    });
    return;
  }
  // Two constants whose values run code keep their order under `--fix`: it never changes the order code runs in
  const running = order.filter((item) => item.runs);
  const safe = running.every((item, i) => i === 0 || item.index > running[i - 1].index);
  // Each keeps the spacing of the place it takes
  const gaps = items.slice(1).map((item, i) => text.slice(items[i].end, item.start));
  reportOrder(
    context,
    items,
    order,
    {
      range: [items[0].start, items.at(-1).end],
      text: (order) => order.map((item, i) => (i === 0 ? "" : gaps[i - 1]) + text.slice(item.start, item.end)).join(""),
    },
    RUN_ORDERS[items[0].kind] +
      (safe ? "" : " Two of them run code, which `--fix` never reorders: move them, or `--fix-suggestions` does."),
    safe,
  );
}

function compareMembers(a, b) {
  if (a.rank[0] !== b.rank[0]) return a.rank[0] - b.rank[0];
  // The constructor, statics and fields keep their order.
  if (a.rank[0] < -1) return a.index - b.index;
  // A getter and its setter, or an overload's signatures and body, stay in their order.
  return compareRanks(a.rank, b.rank) || a.index - b.index;
}

/** Two names' order: alphabetical, ignoring case, then by case. */
function compareNames(a, b) {
  const [lowerA, lowerB] = [a.toLowerCase(), b.toLowerCase()];
  if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
  return a < b ? -1 : 1;
}

/** Two ranks' order, element by element: numbers by value, names alphabetically. */
function compareRanks(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    return typeof a[i] === "string" ? compareNames(a[i], b[i]) : a[i] - b[i];
  }
  return 0;
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

/** A top-level function statement's declaration, exported or not, or null: a run of them sorts. */
function functionOf(statement) {
  const declaration = declarationOf(statement);
  const isFunction = declaration?.type === "FunctionDeclaration" || declaration?.type === "TSDeclareFunction";
  return isFunction && declaration.id ? declaration : null;
}

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

/**
 * Where a class member goes: [rank, async, name]. The constructor (-4), statics (-3) and fields (-2) keep their order;
 * private and protected methods (-1), then public ones (0), sort sync before async, then by name. `asyncNames`: the
 * methods with an async body, whose overload signatures go with it.
 */
function memberRank(member, asyncNames) {
  if (member.kind === "constructor") return [-4, 0, ""];
  if (member.static) return [-3, 0, ""];
  if (member.type !== "MethodDefinition" && member.type !== "TSAbstractMethodDefinition") return [-2, 0, ""];
  const name = member.key?.name ?? member.key?.value;
  if (typeof name !== "string") return [-2, 0, ""];
  const isPublic =
    (!member.accessibility || member.accessibility === "public") && member.key?.type !== "PrivateIdentifier";
  return [isPublic ? 0 : -1, asyncNames.has(name) ? 1 : 0, name];
}

function rangeOf(node) {
  return node.range ?? [node.start, node.end];
}

/**
 * Reorders `items` (each with `node`, `start`, `end`): one report, with one fix rewriting [from, to). A fix that would
 * change the order code runs in (`safe` false) is a suggestion, which only `--fix-suggestions` applies.
 */
function reportOrder(context, items, sorted, render, message, safe = true) {
  const outOfPlace = items.findIndex((item, i) => item !== sorted[i]);
  if (outOfPlace === -1) return;
  const fix = (fixer) => fixer.replaceTextRange(render.range, render.text(sorted));
  context.report({
    node: items[outOfPlace].node,
    message,
    ...(safe
      ? { fix }
      : { suggest: [{ desc: "Sort them, once nothing depends on the order their values run in", fix }] }),
  });
}

/** A path's segments, each a kind (0 fixed, 1 parameter, 2 wildcard) and its text. */
function segments(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => [segment.startsWith(":") ? 1 : segment.includes("*") ? 2 : 0, segment]);
}

/**
 * What a top-level statement is to a run, as `file-layout` ranks it (`item`): a function, a type or a constant, with
 * its name and its place among its peers ([section, async, name], [section, name]); null for anything else.
 */
function sortableOf(item) {
  const fn = functionOf(item.statement);
  if (fn) {
    const overload = fn.type === "TSDeclareFunction";
    return {
      kind: "function",
      node: fn.id,
      name: fn.id.name,
      overload,
      rank: [item.rank, fn.async ? 1 : 0, fn.id.name],
    };
  }
  const declaration = declarationOf(item.statement);
  if (item.kind === "type" && /^TS(TypeAlias|Interface)Declaration$/.test(declaration?.type)) {
    return { kind: "type", node: declaration.id, name: declaration.id.name, rank: [item.rank, declaration.id.name] };
  }
  if (item.kind === "constant" && item.names.length > 0) {
    const runs = runsAtLoad(item.statement);
    return { kind: "constant", node: declaration, name: item.names[0], runs, rank: [item.rank, item.names[0]] };
  }
  return null;
}

/**
 * A run's order: by rank, each one right below what it uses, which goes up to its first user, in order too; those that
 * use each other, if any.
 */
function sortRun(items) {
  const byRank = (a, b) => compareRanks(a.rank, b.rank) || a.index - b.index;
  const placed = new Set();
  const order = [];
  let cycle = [];
  const place = (item, users) => {
    if (placed.has(item) || cycle.length > 0) return;
    if (users.includes(item)) {
      cycle = users.slice(users.indexOf(item));
      return;
    }
    for (const used of [...item.uses].sort(byRank)) place(used, [...users, item]);
    if (cycle.length > 0) return;
    placed.add(item);
    order.push(item);
  };
  for (const item of [...items].sort(byRank)) place(item, []);
  return { order, cycle };
}

/** The comment that ends the line at `pos` (` // note`), which belongs to what ends there: its length, or 0. */
function trailingComment(text, pos) {
  const lineEnd = text.indexOf("\n", pos);
  const rest = text.slice(pos, lineEnd === -1 ? text.length : lineEnd);
  return /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(rest) ? rest.trimEnd().length : 0;
}

export default {
  meta: { name: "arkyvree" },
  rules: {
    "member-order": {
      meta: { type: "suggestion", fixable: "code", hasSuggestions: true },
      create(context) {
        return {
          ClassBody(body) {
            checkClass(context, body);
          },
          Program(program) {
            // A declaration file follows the module it types.
            checkDeclarations(context, program);
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
