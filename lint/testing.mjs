/**
 * The tests' conventions (AGENTS.md's Testing), as one rule, `test-conventions`:
 *
 * - every test runs: no `.skip`, `.only`, `.todo` or `.fixme` (Playwright's `test.describe.only` too), and no
 *   `.skipIf` / `.if` that could quietly leave one out;
 * - no mocks: a test runs the real code on the seeded test database (`mock`, `spyOn`, `jest` from `bun:test`, named
 *   or through a namespace);
 * - an e2e test selects by role and accessible name, never by test id (the production build strips MUI's), and takes
 *   `test` from `tests/e2e/fixtures.ts`, which every journey's users come from (`expect` from Playwright's).
 *
 * And `sync-expects`: Bun's matchers are synchronous, `.resolves` / `.rejects` included (they block until the promise
 * settles, and throw), and its types have them return `void`: an `await` before a `bun:test` `expect(…)` waits for
 * nothing and reads as if it did (`--fix` drops it). Revisit on a Bun upgrade whose types have a matcher return a
 * promise: the rule then flips back for it, or a failing test would pass unnoticed. Playwright's `expect` (the e2e
 * tests'), whose web-first assertions wait, is another import, which the rule leaves alone.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

const MOCKS = new Set(["mock", "spyOn", "jest"]);
const SKIPPING = new Set(["skip", "only", "todo", "skipIf", "if", "failing", "fixme"]);
const TEST_FUNCTIONS = new Set(["test", "it", "describe"]);

/** An `await`'s keyword and the space after it, short of a parenthesis its argument may open. */
function awaitKeywordOf(node, text) {
  const [start] = rangeOf(node);
  return [start, start + /^await\s*/.exec(text.slice(start, rangeOf(node.argument)[0]))[0].length];
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
