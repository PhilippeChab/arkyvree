/**
 * One order for every class and every file's declarations: by name (ignoring case), in each of their groups. A router's
 * routes sort by HTTP method and path. `oxlint --fix` puts a file in order.
 *
 * - A class's members, in groups: its constructor, its static fields, its static methods, its readonly fields, its other
 *   fields, then its methods, its private and protected ones before its public ones. In every group, its private
 *   members come first, then its protected ones, then its public ones, so a class's private members stay together. Each
 *   goes by name, its
 *   methods sync before async; a field goes right below a field its initializer reads, which runs as the class is
 *   built (`this.lines`), and `--fix` never moves a field whose initializer runs code against the other fields (what
 *   it calls may read any of them): it suggests it.
 * - A file's types, constants and functions, in each run of them: by name, within the sections `file-layout` gives
 *   them (its own types, then the ones it exports; the same for its constants; its helpers, then its exports), its
 *   functions sync before async. What a constant reads goes right above it: the file reads it as it loads. A function
 *   is hoisted: it goes by name, whatever it calls. `--fix` never swaps two constants whose values run code (a call,
 *   `new`, `await`): it suggests it, which `--fix-suggestions` applies once nothing depends on the order they run in. A
 *   comment set apart by a blank line ends a run: `--fix` would lose its place, and `comment-style` reports it.
 * - A type's members (an interface's, a type literal's): its call and index signatures first, in their order, then its
 *   properties and methods by name, an overload's signatures together. An enum's members go by name, each with its
 *   value, when every one has its value written (an implicit one is its place). A list of names an export gives goes by
 *   name, and an index's re-exports (`export { x } from "./x.ts"`, a run of them) by the module they're from.
 * - A router's routes group by HTTP method (GET, POST, PUT, PATCH, DELETE), then sort by path: a fixed segment
 *   before a parameter, which Hono needs anyway (it matches overlapping routes in the order they're registered).
 *   Its sub-routers (`.route()`) come first, in their own order, then its routes, which must not overlap theirs:
 *   Hono would run the sub-router's first (tests/routers/application.test.ts checks every route answers its own
 *   requests). Its middleware (`.use()`) comes before them all: Hono applies it only to what's registered after it,
 *   so routes that need other middleware are a sub-router of their own. A run of routes ends at any other call.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { declarationOf, rankStatements, runsAtLoad, runsCode } from "./layout.mjs";

/** What a `.use()` after a route or a sub-router is told. */
const LATE_MIDDLEWARE =
  "A router's middleware (`.use()`) comes before its sub-routers and routes: Hono applies it only to what's " +
  "registered after it. Routes that need other middleware are a sub-router of their own.";

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
  for (let n = outermost; n.type === "CallExpression" && n.callee.type === "MemberExpression"; n = n.callee.object)
    calls.unshift(n);

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
          ? "Routes go by HTTP method (GET, POST, PUT, PATCH, DELETE), then by path (a fixed segment before a parameter)."
          : "A router mounts its sub-routers (`.route()`) first, after its middleware, then its own routes.",
      );
    }
    run = [];
  };
  let routed = false;
  for (const call of calls) {
    if (isUse(call) && routed) context.report({ node: call.callee.property, message: LATE_MIDDLEWARE });
    if (isRoute(call) || isMount(call)) {
      run.push(call);
      routed = true;
    } else {
      flush();
    }
  }
  flush();
}

function checkClass(context, body) {
  if (body.body.length < 2) return;
  const text = context.sourceCode.text;
  const [bodyStart] = rangeOf(body);
  // A comment ending the line of the `{`, or of a member, stays with it.
  const headEnd = bodyStart + 1 + trailingComment(text, bodyStart + 1);
  const className = body.parent?.id?.name;
  const asyncNames = new Set(
    body.body.filter((node) => node.value?.async).map((node) => node.key?.name ?? node.key?.value),
  );
  const members = [];
  for (const [index, node] of body.body.entries()) {
    const [codeStart, codeEnd] = rangeOf(node);
    const previousEnd = index === 0 ? headEnd : members[index - 1].end;
    // Its comments, those between the previous member and its code, go with it; the space before them stays in place
    const between = text.slice(previousEnd, codeStart);
    const start = previousEnd + (between.length - between.trimStart().length);
    const end = codeEnd + trailingComment(text, codeEnd);
    const field = isField(node);
    members.push({
      node,
      index,
      name: memberName(node),
      field,
      rank: memberRank(node, asyncNames),
      // What a field's initializer runs as the class is built: code (`new`, a call), and the class's fields it reads
      runs: node.type === "StaticBlock" || (field && runsCode(node.value)),
      reads: field ? fieldReads(node.value, node.static ? className : undefined) : [],
      start,
      end,
    });
  }
  for (const member of members) {
    member.uses = members.filter(
      (other) =>
        other !== member &&
        other.field &&
        other.node.static === member.node.static &&
        member.reads.includes(other.name),
    );
  }
  const { order, cycle } = sortRun(members);
  if (cycle.length > 0) {
    context.report({
      node: cycle[0].node,
      message: `Fields whose initializers read each other (${cycle.map((m) => m.name).join(", ")}): untangle them.`,
    });
    return;
  }
  // A field whose initializer runs code keeps its place against the class's other fields (static or not, as it is)
  // under `--fix`: what it calls (a method, an arrow) may read any of them, which then would or wouldn't be set yet
  const fields = order.filter((member) => member.field || member.node.type === "StaticBlock");
  const safe = fields.every((member, i) =>
    fields
      .slice(i + 1)
      .every(
        (later) =>
          !(member.runs || later.runs) || isStatic(member.node) !== isStatic(later.node) || member.index < later.index,
      ),
  );
  // Each keeps the spacing of the place it takes
  const gaps = members.map((member, i) => text.slice(i === 0 ? headEnd : members[i - 1].end, member.start));
  reportOrder(
    context,
    members,
    order,
    {
      range: [headEnd, members.at(-1).end],
      text: (order) => order.map((member, i) => gaps[i] + text.slice(member.start, member.end)).join(""),
    },
    "Members go in groups: the constructor, the static fields, the static methods, the readonly fields, the other " +
      "fields, then the private and protected methods, then the public ones; in each group, its private members " +
      "first, then its protected ones, then its public ones. Each by name, a field below one " +
      "its initializer reads, methods sync before async." +
      (safe
        ? ""
        : " A field's initializer runs code, which `--fix` never moves against the other fields: move it, or " +
          "`--fix-suggestions` does, once nothing it calls reads a field the move changes."),
    safe,
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

/** An enum's members by name, when each has its value written: an implicit value is the member's place. */
function checkEnum(context, enumNode) {
  const members = enumNode.members ?? enumNode.body?.members ?? [];
  if (members.length < 2 || members.some((member) => !member.initializer)) return;
  checkList(
    context,
    members,
    (member) => [member.id?.name ?? member.id?.value ?? ""],
    "An enum's members go by name, each with its value.",
    context.sourceCode.text.indexOf("{", rangeOf(enumNode.id)[1]) + 1,
  );
}

/** The names an export lists (`export { b, a } from "./x.ts"`), by name. */
function checkExportSpecifiers(context, statement) {
  checkList(
    context,
    statement.specifiers,
    (specifier) => [specifier.exported?.name ?? specifier.exported?.value ?? ""],
    "The names an export lists go by name.",
    context.sourceCode.text.indexOf("{", rangeOf(statement)[0]) + 1,
  );
}

/**
 * Members of one list in order (`rankOf` gives each its place): each with its comments, in the place of another, which
 * keeps its spacing and its separator (a type member's `;`, which the last one of a one-line type has none of).
 */
function checkList(context, nodes, rankOf, message, headEnd) {
  if (nodes.length < 2) return;
  const text = context.sourceCode.text;
  // Where the list starts: after its `{`, or the statement before it, which its caller gives
  const listStart = headEnd;
  const items = [];
  for (const [index, node] of nodes.entries()) {
    const [codeStart, codeEnd] = rangeOf(node);
    const between = text.slice(index === 0 ? listStart : items[index - 1].end, codeStart);
    // Its comments, those right above its code (after a separator and the last blank line), go with it
    const blank = [...between.matchAll(/\n[ \t]*\n/g)].at(-1);
    const attached = (blank ? between.slice(blank.index + blank[0].length) : between)
      .replace(/^\s*[;,]?/, "")
      .trimStart();
    const start = codeStart - attached.length;
    const trailing = trailingComment(text, codeEnd);
    const separator = /[;,]$/.test(text.slice(codeStart, codeEnd)) ? text[codeEnd - 1] : "";
    items.push({ node, index, rank: rankOf(node), start, codeEnd, end: codeEnd + trailing, separator, trailing });
  }
  const sorted = [...items].sort((a, b) => compareRanks(a.rank, b.rank) || a.index - b.index);
  const gaps = items.map((item, i) => (i === 0 ? "" : text.slice(items[i - 1].end, item.start)));
  // A member's text without its separator, which its place gives it back
  const body = (item) =>
    text.slice(item.start, item.codeEnd - item.separator.length) + text.slice(item.codeEnd, item.end);
  reportOrder(
    context,
    items,
    sorted,
    {
      range: [items[0].start, items.at(-1).end],
      text: (order) =>
        order
          .map((item, i) => {
            const own = body(item);
            const comment = item.end - item.codeEnd;
            // Its separator goes before the comment ending its line
            return gaps[i] + own.slice(0, own.length - comment) + items[i].separator + own.slice(own.length - comment);
          })
          .join(""),
    },
    message,
  );
}

/** A file's runs of re-exports (`export { x } from "./x.ts"`), each by the module it's from, a type's after a value's. */
function checkReExports(context, program) {
  let run = [];
  let before = 0;
  const flush = () => {
    checkList(
      context,
      run,
      (statement) => [statement.source.value, statement.exportKind === "type" ? 1 : 0],
      "An index's re-exports go by the module they're from.",
      before,
    );
    run = [];
  };
  for (const statement of program.body) {
    if (/^Export(Named|All)Declaration$/.test(statement.type) && statement.source) {
      run.push(statement);
      continue;
    }
    flush();
    before = rangeOf(statement)[1];
  }
  flush();
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

/** A type's members: its call and index signatures first, in their order, then its properties and methods by name. */
function checkTypeMembers(context, members, headEnd) {
  checkList(
    context,
    members,
    (member) =>
      /^TS(CallSignature|ConstructSignature)Declaration$/.test(member.type)
        ? [0]
        : member.type === "TSIndexSignature"
          ? [1]
          : [2, memberName(member)],
    "A type's members go by name, after its call and index signatures; an overload's signatures stay together.",
    headEnd,
  );
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

/** A run's order: its sub-routers first, as they come, then its routes, sorted. */
function compareRunMembers(a, b) {
  if (a.mount !== b.mount) return a.mount ? -1 : 1;
  return (a.mount ? 0 : compareRoutes(a.route, b.route)) || a.index - b.index;
}

/**
 * Where a class member goes: [rank, visibility, async, name]. The constructor, statics and fields keep their order;
 * private and protected methods (-1), then public ones (0), each private, then protected, then public, sort sync before
 * async, then by name. `asyncNames`: the methods with an async body, whose overload signatures go with it.
 *
 * A class member's names its field initializer reads off the class: `this.lines`, and `Telemetry.provider` when static.
 */
function fieldReads(value, className) {
  const reads = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    // A function's body runs when it's called, not as the class is built
    if (/^(ArrowFunctionExpression|FunctionExpression|ClassExpression)$/.test(node.type)) return;
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      (node.object.type === "ThisExpression" ||
        (className && node.object.type === "Identifier" && node.object.name === className))
    )
      reads.push(node.property.name);
    for (const [key, child] of Object.entries(node))
      if (key !== "parent" && child && typeof child === "object") visit(child);
  };
  visit(value);
  return reads;
}

/** A top-level function statement's declaration, exported or not, or null: a run of them sorts. */
function functionOf(statement) {
  const declaration = declarationOf(statement);
  const isFunction = declaration?.type === "FunctionDeclaration" || declaration?.type === "TSDeclareFunction";
  return isFunction && declaration.id ? declaration : null;
}

/** Whether a class member is a field (a property, a `declare` one or an `accessor` one), not a method. */
function isField(member) {
  return /^(PropertyDefinition|TSAbstractPropertyDefinition|AccessorProperty|TSAbstractAccessorProperty)$/.test(
    member.type,
  );
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

/** A static block is static, though its node has no `static` flag */
function isStatic(member) {
  return member.type === "StaticBlock" || Boolean(member.static);
}

function isUse(call) {
  return call.callee.type === "MemberExpression" && call.callee.property.name === "use";
}

/** A class member's name, as written: its key's (a private one without its `#`); none for a computed one. */
function memberName(member) {
  const name = member.computed ? undefined : (member.key?.name ?? member.key?.value);
  return typeof name === "string" ? name : "";
}

/**
 * A class member's place: its group (the constructor, static fields, static methods, readonly fields, other fields,
 * private and protected methods, public methods), its private members, then its protected ones, then its public ones in
 * every group, then within it, a method's async-ness and its name, a field's name.
 */
function memberRank(member, asyncNames) {
  const name = memberName(member);
  if (member.kind === "constructor") return [-7];
  if (member.type === "TSIndexSignature") return [-8];
  if (member.type === "StaticBlock") return [-6, -1, ""];
  const visibility = visibilityRank(member);
  const async = asyncNames.has(name) ? 1 : 0;
  if (isField(member)) return [member.static ? -6 : member.readonly ? -4 : -3, visibility, name];
  if (member.static) return [-5, visibility, async, name];
  return [visibility === 2 ? 0 : -1, visibility, async, name];
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
  if (item.kind === "type" && /^TS(TypeAlias|Interface)Declaration$/.test(declaration?.type))
    return { kind: "type", node: declaration.id, name: declaration.id.name, rank: [item.rank, declaration.id.name] };

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

/** A member's visibility, as its group orders it: private (a `#name` too) 0, protected 1, public 2. */
function visibilityRank(member) {
  if (member.key?.type === "PrivateIdentifier" || member.accessibility === "private") return 0;
  return member.accessibility === "protected" ? 1 : 2;
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
          ExportNamedDeclaration(statement) {
            if (statement.specifiers?.length > 1) checkExportSpecifiers(context, statement);
          },
          TSEnumDeclaration(enumNode) {
            checkEnum(context, enumNode);
          },
          TSInterfaceBody(body) {
            checkTypeMembers(context, body.body, rangeOf(body)[0] + 1);
          },
          TSTypeLiteral(literal) {
            checkTypeMembers(context, literal.members, rangeOf(literal)[0] + 1);
          },
          Program(program) {
            // A declaration file follows the module it types.
            checkDeclarations(context, program);
            checkReExports(context, program);
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
