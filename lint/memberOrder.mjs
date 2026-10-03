/**
 * One member order for the routers, the services and the repositories: reads, creates, updates, deletes, then the
 * other actions, by name within each group. `oxlint --fix` puts a file in order.
 *
 * - A service's or a repository's methods group by their leading verb (`findOne` reads, `archiveCharacter` deletes).
 *   The constructor and the `private` / `protected` helpers stay at the top, in their own order.
 * - A router's routes group by HTTP method (GET, POST, PUT, PATCH, DELETE), then sort by path: a fixed segment
 *   before a parameter, which Hono needs anyway (it matches overlapping routes in the order they're registered).
 *   A run of routes ends at a `.use()`, `.route()` or anything else: middleware applies to what follows it.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

/** A method's group, by its leading verb: a word followed by a capital or nothing (`get`, `getRuleset`). */
const VERB_GROUPS = [
  ["find", "get", "list", "exists", "count", "search", "has"],
  ["create", "add", "insert", "duplicate", "bulkCreate"],
  ["update", "set", "mark", "replace", "upsert", "backfill"],
  ["delete", "remove", "archive", "unarchive", "hardDelete", "purge"],
];
const ACTIONS = VERB_GROUPS.length;

export function verbGroup(name) {
  const index = VERB_GROUPS.findIndex((verbs) => verbs.some((verb) => new RegExp(`^${verb}(?=[A-Z0-9]|$)`).test(name)));
  return index === -1 ? ACTIONS : index;
}

/** Where a class member goes: [rank, name]. Members ranked below 0 keep their order, at the top. */
export function memberRank(member) {
  if (member.kind === "constructor") return [-3, ""];
  if (member.static) return [-2, ""];
  const isPublic = !member.accessibility || member.accessibility === "public";
  if (!isPublic || member.key?.type === "PrivateIdentifier") return [-1, ""];
  const name = member.key?.name ?? member.key?.value;
  if (typeof name !== "string") return [-1, ""];
  return [verbGroup(name), name];
}

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete"];

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

const compareMembers = (a, b) => {
  const [rankA, nameA] = a.rank;
  const [rankB, nameB] = b.rank;
  if (rankA !== rankB) return rankA - rankB;
  if (rankA < 0) return a.index - b.index;
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  return a.index - b.index;
};

const rangeOf = (node) => node.range ?? [node.start, node.end];

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
  const members = body.body.map((node, index) => {
    const [start, end] = rangeOf(node);
    const previousEnd = index === 0 ? rangeOf(body)[0] + 1 : rangeOf(body.body[index - 1])[1];
    // What sits between the previous member and this one: its comments.
    const comments = text.slice(previousEnd, start).trim();
    return { node, index, rank: memberRank(node), start, end, comments };
  });
  const sorted = [...members].sort(compareMembers);
  const [bodyStart, bodyEnd] = rangeOf(body);
  const indent = " ".repeat(context.sourceCode.getLocFromIndex?.(members[0]?.start ?? 0)?.column ?? 2);
  const tail = text.slice(members.at(-1)?.end ?? bodyStart + 1, bodyEnd - 1).trim();
  reportOrder(
    context,
    members,
    sorted,
    {
      range: [bodyStart, bodyEnd],
      text: (order) =>
        "{" +
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
    "Members go in CRUD order: reads, creates, updates, deletes, then the other actions, by name in each group.",
  );
}

const isRoute = (call) =>
  call.callee.type === "MemberExpression" &&
  ROUTE_METHODS.includes(call.callee.property.name) &&
  call.arguments[0]?.type === "Literal" &&
  typeof call.arguments[0].value === "string";

function checkChain(context, outermost) {
  const text = context.sourceCode.text;
  const calls = [];
  for (let n = outermost; n.type === "CallExpression" && n.callee.type === "MemberExpression"; n = n.callee.object) {
    calls.unshift(n);
  }
  // Runs of consecutive routes.
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const items = run.map((call, index) => ({
        node: call.callee.property,
        index,
        route: { method: call.callee.property.name, path: call.arguments[0].value },
        // From the end of what it's called on: the newline, comments and `.get(…)`.
        start: rangeOf(call.callee.object)[1],
        end: rangeOf(call)[1],
      }));
      const sorted = [...items].sort((a, b) => compareRoutes(a.route, b.route) || a.index - b.index);
      reportOrder(
        context,
        items,
        sorted,
        {
          range: [items[0].start, items.at(-1).end],
          text: (order) => order.map((i) => text.slice(i.start, i.end)).join(""),
        },
        "Routes go in CRUD order: GET, POST, PUT, PATCH, DELETE, by path in each (a fixed segment before a parameter).",
      );
    }
    run = [];
  };
  for (const call of calls) {
    if (isRoute(call)) run.push(call);
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
            const name = body.parent?.id?.name ?? "";
            if (/(Service|Repository)$/.test(name)) checkClass(context, body);
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
