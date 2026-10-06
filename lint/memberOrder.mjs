/**
 * One member order for every class and every router: the lifecycle (load, preload, initialize, build, apply, in that
 * order), reads, creates, updates, deletes, then the other actions, by name within each group. `oxlint --fix` puts a
 * file in order.
 *
 * - A class's methods group by their leading verb (`findOne` reads, `archiveCharacter` deletes): its private and
 *   protected methods first, then its public ones. The constructor, statics and fields stay at the top, in their own
 *   order (a field's initializer may read an earlier one).
 * - A router's routes group by HTTP method (GET, POST, PUT, PATCH, DELETE), then sort by path: a fixed segment
 *   before a parameter, which Hono needs anyway (it matches overlapping routes in the order they're registered).
 *   Its sub-routers (`.route()`) come first, in their own order, then its routes, which must not overlap theirs:
 *   Hono would run the sub-router's first (tests/routers/application.test.ts checks every route answers its own
 *   requests). A run of routes ends at a `.use()` or anything else: middleware applies to what follows it.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

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

/** Whether `name` starts with the word `verb`: `find` starts `findOne`, not `finder`. */
export function startsWithVerb(name, verb) {
  return new RegExp(`^${verb}(?=[A-Z0-9]|$)`).test(name);
}

/** A lifecycle method's step (`load` before `build`), or 0 for any other method. */
export function lifecycleStep(name) {
  return LIFECYCLE.findIndex((verb) => startsWithVerb(name, verb)) + 1;
}

export function verbGroup(name) {
  const index = VERB_GROUPS.findIndex((verbs) => verbs.some((verb) => startsWithVerb(name, verb)));
  return index === -1 ? ACTIONS : index;
}

/**
 * Where a class member goes: [rank, group, lifecycle step, name]. The constructor (-4), statics (-3) and fields (-2)
 * keep their order; private and protected methods (-1), then public ones (0), sort by verb group (the lifecycle by
 * step), then name.
 */
function memberRank(member) {
  if (member.kind === "constructor") return [-4, 0, 0, ""];
  if (member.static) return [-3, 0, 0, ""];
  if (member.type !== "MethodDefinition" && member.type !== "TSAbstractMethodDefinition") return [-2, 0, 0, ""];
  const name = member.key?.name ?? member.key?.value;
  if (typeof name !== "string") return [-2, 0, 0, ""];
  const isPublic =
    (!member.accessibility || member.accessibility === "public") && member.key?.type !== "PrivateIdentifier";
  return [isPublic ? 0 : -1, verbGroup(name), lifecycleStep(name), name];
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

function compareMembers(a, b) {
  const [rankA, groupA, stepA, nameA] = a.rank;
  const [rankB, groupB, stepB, nameB] = b.rank;
  if (rankA !== rankB) return rankA - rankB;
  // The constructor, statics and fields keep their order.
  if (rankA < -1) return a.index - b.index;
  if (groupA !== groupB) return groupA - groupB;
  if (stepA !== stepB) return stepA - stepB;
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  // A getter and its setter, or an overload's signatures and body, stay in their order.
  return a.index - b.index;
}

function rangeOf(node) {
  return node.range ?? [node.start, node.end];
}

/** The comment that ends the line at `pos` (` // note`), which belongs to what ends there: its length, or 0. */
function trailingComment(text, pos) {
  const lineEnd = text.indexOf("\n", pos);
  const rest = text.slice(pos, lineEnd === -1 ? text.length : lineEnd);
  return /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(rest) ? rest.trimEnd().length : 0;
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

function checkClass(context, body) {
  const text = context.sourceCode.text;
  const [bodyStart, bodyEnd] = rangeOf(body);
  // A comment ending the line of the `{`, or of a member, stays with it.
  const headEnd = bodyStart + 1 + trailingComment(text, bodyStart + 1);
  const members = [];
  for (const [index, node] of body.body.entries()) {
    const [start, memberEnd] = rangeOf(node);
    const end = memberEnd + trailingComment(text, memberEnd);
    const previousEnd = index === 0 ? headEnd : members[index - 1].end;
    // What sits between the previous member and this one: its comments.
    const comments = text.slice(previousEnd, start).trim();
    members.push({ node, index, rank: memberRank(node), start, end, comments });
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
    "Members go in order: the lifecycle (load, preload, initialize, build, apply), reads, creates, updates, " +
      "deletes, then the other actions, by name in each group.",
  );
}

function isMount(call) {
  return call.callee.type === "MemberExpression" && call.callee.property.name === "route";
}

/** A run's order: its sub-routers first, as they come, then its routes, sorted. */
function compareRunMembers(a, b) {
  if (a.mount !== b.mount) return a.mount ? -1 : 1;
  return (a.mount ? 0 : compareRoutes(a.route, b.route)) || a.index - b.index;
}

function isRoute(call) {
  return (
    call.callee.type === "MemberExpression" &&
    ROUTE_METHODS.includes(call.callee.property.name) &&
    call.arguments[0]?.type === "Literal" &&
    typeof call.arguments[0].value === "string"
  );
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
