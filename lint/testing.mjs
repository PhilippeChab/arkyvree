/**
 * The tests' conventions (AGENTS.md's Testing), as one rule, `test-conventions`:
 *
 * - every test runs: no `.skip`, `.only`, `.todo` or `.fixme` (Playwright's `test.describe.only` too), and no
 *   `.skipIf` / `.if` that could quietly leave one out;
 * - no mocks: a test runs the real code on the seeded test database (`mock`, `spyOn`, `jest` from `bun:test`, named
 *   or through a namespace);
 * - an e2e test selects by role and accessible name, never by test id (the production build strips MUI's), and takes
 *   `test` / `expect` from `tests/e2e/fixtures.ts`, which every journey's users come from.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */
import { repoPath } from "./paths.mjs";

const SKIPPING = new Set(["skip", "only", "todo", "skipIf", "if", "failing", "fixme"]);
const TEST_FUNCTIONS = new Set(["test", "it", "describe"]);
const MOCKS = new Set(["mock", "spyOn", "jest"]);

const testConventions = {
  meta: { type: "problem" },
  create(context) {
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
        if (TEST_FUNCTIONS.has(object.name) && SKIPPING.has(name)) {
          context.report({ node, message: `Every test runs: no \`.${name}\`.` });
        }
        // import * as bt from "bun:test"; bt.mock(…)
        if (bunTestNamespaces.has(object.name) && MOCKS.has(name)) {
          context.report({ node, message: "No mocks: a test runs the real code on the seeded test database." });
        }
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        for (const s of node.specifiers ?? []) {
          if (source === "bun:test" && s.type === "ImportNamespaceSpecifier") bunTestNamespaces.add(s.local.name);
          if (s.type !== "ImportSpecifier") continue;
          if (source === "bun:test" && MOCKS.has(s.imported.name)) {
            context.report({ node: s, message: "No mocks: a test runs the real code on the seeded test database." });
          }
          if (
            isE2e &&
            file.endsWith(".e2e.ts") &&
            source === "@playwright/test" &&
            ["test", "expect"].includes(s.imported.name) &&
            node.importKind !== "type"
          ) {
            context.report({ node: s, message: "An e2e test takes `test` and `expect` from `tests/e2e/fixtures.ts`." });
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
  },
};

export const rules = { "test-conventions": testConventions };
