/**
 * The tests' conventions (AGENTS.md's Testing), as one rule, `test-conventions`:
 *
 * - every test runs: no `.skip`, `.only`, `.todo` or `.fixme` (Playwright's `test.describe.only` too), and no
 *   `.skipIf` / `.if` that could quietly leave one out;
 * - no mocks: a test runs the real code on the seeded test database (`mock`, `spyOn`, `jest` from `bun:test`, named
 *   or through a namespace);
 * - an e2e test selects by role and accessible name, never by test id (the production build strips MUI's), and takes
 *   `test` from `tests/e2e/fixtures.ts`, which every journey's users come from (`expect` from Playwright's);
 * - a `bun:test` matcher is given an error (`new XError(…)`, or a variable holding one) only if it reads it whole:
 *   `toThrow` compares its message alone, whatever its class, and `toMatchObject` its enumerable fields, never its
 *   message (a plain `Error`, which has none, passes on any object). `toEqual` reads its `name`, its message and its
 *   fields, which `tests/support/errors.test.ts` holds against a Bun upgrade.
 *
 * And `sync-expects`: Bun's matchers are synchronous, `.resolves` / `.rejects` included (they block until the promise
 * settles, and throw), and its types have them return `void`: an `await` before a `bun:test` `expect(…)` waits for
 * nothing and reads as if it did (`--fix` drops it). It only yields a tick, which a test that needs one awaits by name
 * (the promise whose handlers must have run: `await first.catch(…)`). Revisit on a Bun upgrade whose types have a matcher return a
 * promise: the rule then flips back for it, or a failing test would pass unnoticed. Playwright's `expect` (the e2e
 * tests'), whose web-first assertions wait, is another import, which the rule leaves alone.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

/** The matchers that compare an error they're given by its message alone, whatever its class. */
const MESSAGE_MATCHERS = new Set(["toThrow", "toThrowError"]);
const MOCKS = new Set(["mock", "spyOn", "jest"]);
const SKIPPING = new Set(["skip", "only", "todo", "skipIf", "if", "failing", "fixme"]);
const TEST_FUNCTIONS = new Set(["test", "it", "describe"]);

/** An `await`'s keyword and the space after it, short of a parenthesis its argument may open. */
function awaitKeywordOf(node, text) {
  const [start] = rangeOf(node);
  return [start, start + /^await\s*/.exec(text.slice(start, rangeOf(node.argument)[0]))[0].length];
}

/** Why the matcher `node` calls can't read the error it's given whole, if it's given one. */
function blindErrorMatch(node, expectNames) {
  if (node.callee.type !== "MemberExpression" || !isExpectChain(node, expectNames)) return undefined;
  if (!node.arguments[0] || !isErrorInstance(node.arguments[0])) return undefined;
  const matcher = node.callee.property.name;
  if (MESSAGE_MATCHERS.has(matcher)) {
    return (
      `Bun's \`${matcher}\` given an error compares its message alone, never its class: compare the whole error, ` +
      "`.rejects.toEqual(new XError(…))` or `expect(thrownBy(…)).toEqual(new XError(…))`."
    );
  }
  if (matcher === "toMatchObject") {
    return (
      "`toMatchObject` given an error reads its enumerable fields, never its message, and of a plain `Error` nothing: " +
      "compare the whole error with `toEqual`, or name what's checked (`toMatchObject({ code, message })`)."
    );
  }
  return undefined;
}

/**
 * What the `const` `node` names holds, from the blocks around it, nearest first: none for a name a nearer `let` or `var`
 * holds, or a parameter (a plain one, or one with a default), which can hold something else by the time it's read.
 */
function constantValue(node) {
  for (let block = node.parent; block; block = block.parent) {
    const named = (param) => (param.type === "AssignmentPattern" ? param.left : param);
    if (block.params?.some((param) => named(param).type === "Identifier" && named(param).name === node.name))
      return undefined;
    if (!Array.isArray(block.body)) continue;
    for (const statement of block.body) {
      if (statement.type !== "VariableDeclaration") continue;
      const declaration = statement.declarations.find(({ id }) => id.name === node.name);
      if (declaration) return statement.kind === "const" ? declaration.init : undefined;
    }
  }
  return undefined;
}

/** An `await` on a `bun:test` `expect(…)`, whose matchers return no promise: the `await` goes. */
function createSyncExpects(context) {
  const expectNames = new Set();
  return {
    ImportDeclaration(node) {
      if (node.source.value !== "bun:test") return;
      for (const s of node.specifiers ?? [])
        if (s.type === "ImportSpecifier" && s.imported.name === "expect") expectNames.add(s.local.name);
    },
    AwaitExpression(node) {
      if (!isExpectChain(node.argument, expectNames)) return;
      context.report({
        node,
        message: "Bun's matchers are synchronous, `.resolves` / `.rejects` included: an `expect(…)` takes no `await`.",
        fix: (fixer) => fixer.removeRange(awaitKeywordOf(node, context.sourceCode.text)),
      });
    },
  };
}

function createTestConventions(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("tests/")) return {};
  const isE2e = file.startsWith("tests/e2e/");
  const bunTestNamespaces = new Set();
  const expectNames = new Set();
  return {
    // test.skip(…), describe.only(…), test.skipIf(cond)(…), Playwright's test.describe.only(…), test.fixme(…)
    MemberExpression(node) {
      if (node.property.type !== "Identifier") return;
      const name = node.property.name;
      const object =
        node.object.type === "MemberExpression" && node.object.property.name === "describe"
          ? node.object.object
          : node.object;
      if (object.type !== "Identifier") return;
      if (TEST_FUNCTIONS.has(object.name) && SKIPPING.has(name))
        context.report({ node, message: `Every test runs: no \`.${name}\`.` });

      // import * as bt from "bun:test"; bt.mock(…)
      if (bunTestNamespaces.has(object.name) && MOCKS.has(name))
        context.report({ node, message: "No mocks: a test runs the real code on the seeded test database." });
    },
    ImportDeclaration(node) {
      const source = node.source.value;
      for (const s of node.specifiers ?? []) {
        if (source === "bun:test" && s.type === "ImportNamespaceSpecifier") bunTestNamespaces.add(s.local.name);
        if (s.type !== "ImportSpecifier") continue;
        if (source === "bun:test" && s.imported.name === "expect") expectNames.add(s.local.name);
        if (source === "bun:test" && MOCKS.has(s.imported.name))
          context.report({ node: s, message: "No mocks: a test runs the real code on the seeded test database." });

        if (
          isE2e &&
          file.endsWith(".e2e.ts") &&
          source === "@playwright/test" &&
          s.imported.name === "test" &&
          node.importKind !== "type"
        ) {
          context.report({
            node: s,
            message: "An e2e test takes `test` from `tests/e2e/fixtures.ts`, which every journey's users come from.",
          });
        }
      }
    },
    CallExpression(node) {
      if (isE2e && node.callee.type === "MemberExpression" && node.callee.property.name === "getByTestId") {
        context.report({
          node,
          message: "Select by role and accessible name, never by test id: the production build strips them.",
        });
      }
      const blindMatch = blindErrorMatch(node, expectNames);
      if (blindMatch) context.report({ node, message: blindMatch });
    },
    // `[data-testid="${id}"]` too
    TemplateElement(node) {
      if (isE2e && node.value.raw.includes("data-testid")) {
        context.report({
          node,
          message: "Select by role and accessible name, never by test id: the production build strips them.",
        });
      }
    },
    Literal(node) {
      if (isE2e && typeof node.value === "string" && node.value.includes("data-testid")) {
        context.report({
          node,
          message: "Select by role and accessible name, never by test id: the production build strips them.",
        });
      }
    },
  };
}

/** Whether `node` makes an error, `new XError(…)`, or reads a variable that holds one. */
function isErrorInstance(node) {
  const value = node.type === "Identifier" ? constantValue(node) : node;
  if (value?.type !== "NewExpression") return false;
  return (value.callee.property?.name ?? value.callee.name)?.endsWith("Error") === true;
}

/** Whether `node` is an `expect(…)` chain (`.not`, `.rejects`, its matcher) of one of `expectNames`. */
function isExpectChain(node, expectNames) {
  let current = node;
  while (current.type === "CallExpression" || current.type === "MemberExpression") {
    if (current.type === "CallExpression" && current.callee.type === "Identifier")
      return expectNames.has(current.callee.name);
    current = current.type === "CallExpression" ? current.callee : current.object;
  }
  return false;
}

function rangeOf(node) {
  return node.range ?? [node.start, node.end];
}

export default {
  "sync-expects": { meta: { type: "suggestion", fixable: "code" }, create: createSyncExpects },
  "test-conventions": { meta: { type: "problem" }, create: createTestConventions },
};
