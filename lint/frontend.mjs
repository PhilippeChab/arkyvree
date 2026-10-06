/**
 * The client's conventions (AGENTS.md's Frontend Architecture), as rules:
 *
 * - `accessible-icon-buttons`: an `IconButton` has an accessible name: an `aria-label` (or `aria-labelledby`), or a
 *   `Tooltip` right around it. A tooltip around a `<span>` (a disabled button's), or one with `describeChild`, doesn't
 *   name the button. The attributes are written out: a spread (`{...buttonProps}`) doesn't count, whatever it holds.
 * - `dialog-conventions`: a `Dialog` goes full screen on a phone (`fullScreen={isMobile}`), and a form is never in a
 *   `Modal`, which skips the guard that keeps a dirty form open (`FormDialog`, `CreateDialog` and `EditDialog` have it).
 * - `query-keys`: every query key comes from `lib/queryKeys.ts`: a key written as an array starts by spreading one
 *   (`[...queryKeys.rulesets.section(id, "feats"), search]`).
 * - `client-apis`: a mutation runs with `.mutate()` and its callbacks, never `.mutateAsync()`, and a loader is a
 *   `DiceSpinner`, never MUI's `CircularProgress`.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

/** Whether a JSX element has the attribute `name`. */
function hasAttribute(node, name) {
  return node.openingElement.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** A JSX element's name: `IconButton`, `Dialog`. */
function elementName(node) {
  return node.openingElement.name.type === "JSXIdentifier" ? node.openingElement.name.name : null;
}

function inClient(context) {
  return repoPath(context.filename).startsWith("client/src/");
}

function createClientApis(context) {
  if (!inClient(context)) return {};
  const muiNamespaces = new Set();
  return {
    CallExpression(node) {
      if (node.callee.type === "MemberExpression" && node.callee.property.name === "mutateAsync") {
        context.report({
          node,
          message: "Run a mutation with `.mutate()` and its `onSuccess` / `onError`, not `.mutateAsync()`.",
        });
      }
    },
    // const { mutateAsync } = useMutation(…)
    Property(node) {
      if (node.parent?.type === "ObjectPattern" && node.key.type === "Identifier" && node.key.name === "mutateAsync") {
        context.report({
          node,
          message: "Run a mutation with `.mutate()` and its `onSuccess` / `onError`, not `.mutateAsync()`.",
        });
      }
    },
    // <Mui.CircularProgress />
    JSXMemberExpression(node) {
      if (node.property.name === "CircularProgress" && muiNamespaces.has(node.object.name)) {
        context.report({
          node,
          message: "A loader is a `DiceSpinner` (`components/common`), never `CircularProgress`.",
        });
      }
    },
    ImportDeclaration(node) {
      if (!String(node.source.value).startsWith("@mui/material")) return;
      for (const s of node.specifiers ?? []) if (s.type === "ImportNamespaceSpecifier") muiNamespaces.add(s.local.name);
      const named = (node.specifiers ?? []).some(
        (s) => s.type === "ImportSpecifier" && s.imported.name === "CircularProgress",
      );
      if (named || node.source.value === "@mui/material/CircularProgress") {
        context.report({
          node,
          message: "A loader is a `DiceSpinner` (`components/common`), never `CircularProgress`.",
        });
      }
    },
  };
}

function createQueryKeyRule(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/lib/queryKeys.ts") return {};
  return {
    Property(node) {
      if (node.key.type !== "Identifier" || node.key.name !== "queryKey" || node.value.type !== "ArrayExpression")
        return;
      if (node.value.elements[0]?.type === "SpreadElement") return;
      context.report({
        node: node.value,
        message: "A query key comes from `lib/queryKeys.ts`: spread one first (`[...queryKeys.x.y(id), filter]`).",
      });
    },
  };
}

/** The nearest JSX element around `node`. */
function parentElement(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === "JSXElement") return p;
  return null;
}

function createAccessibleIconButtons(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      if (hasAttribute(node, "aria-label") || hasAttribute(node, "aria-labelledby")) return;
      // A tooltip names its child, but not with `describeChild`, which makes its title a description.
      const parent = parentElement(node);
      if (parent && elementName(parent) === "Tooltip" && !hasAttribute(parent, "describeChild")) return;
      context.report({
        node: node.openingElement,
        message:
          "An icon-only `IconButton` takes an `aria-label`, or a `Tooltip` right around it (not around a `<span>`).",
      });
    },
  };
}

function createDialogConventions(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Dialog" && !hasAttribute(node, "fullScreen")) {
        context.report({
          node: node.openingElement,
          message: "A `Dialog` goes full screen on a phone: `fullScreen={isMobile}`.",
        });
      }
      // component="form", or component={"form"}
      const valueOf = (a) => (a.value?.type === "JSXExpressionContainer" ? a.value.expression.value : a.value?.value);
      const isForm =
        name === "form" ||
        node.openingElement.attributes.some(
          (a) => a.type === "JSXAttribute" && a.name.name === "component" && valueOf(a) === "form",
        );
      if (!isForm) return;
      for (let p = parentElement(node); p; p = parentElement(p)) {
        if (elementName(p) === "Modal") {
          context.report({
            node: node.openingElement,
            message:
              "A form goes in a `FormDialog` (or `CreateDialog` / `EditDialog`), never a `Modal`: it would close and lose a dirty form.",
          });
          return;
        }
      }
    },
  };
}

export default {
  "accessible-icon-buttons": { meta: { type: "problem" }, create: createAccessibleIconButtons },
  "dialog-conventions": { meta: { type: "problem" }, create: createDialogConventions },
  "query-keys": { meta: { type: "suggestion" }, create: createQueryKeyRule },
  "client-apis": { meta: { type: "suggestion" }, create: createClientApis },
};
