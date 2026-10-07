/**
 * How the client tells the user what happens, one way (AGENTS.md's Frontend Architecture):
 *
 * - `dialog-mounts`: a dialog stays mounted, its `open` showing it, so it fades out as it closes; a dialog about a
 *   record opens through `useDialogState`, which keeps the record while it fades, and one that keeps state of its own
 *   mounts with that record (`{dialog.target && …}`) and lets it go once faded.
 * - `menus`: a menu lists its items alone (a panel that opens from a button is a `Popover`), and an action in it is an
 *   `ActionMenuItem`; a `MenuItem` is one of several to choose, marked `selected`.
 * - `pending-buttons`: a button that starts a request shows it running: its label in a `DiceSpinner`, disabled the
 *   while.
 * - `page-errors`: a page that couldn't load says why in `loadFailureMessage`'s words.
 * - `query-errors`: what reads a query shows its failure too: it reads `error` with its `data` (a listbox's `items`).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { calleeName, elementName, hasAttribute, inClient, parentElement } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** What a `Menu` holds: its items, and the dividers between them */
const MENU_CHILDREN = new Set(["ActionMenuItem", "Divider", "MenuItem"]);

/**
 * The hooks that read a query: TanStack's, and the app's that hand on its result (`items` for a listbox's). An image's
 * (`useAttachment`) isn't one: an avatar or a portrait shows its placeholder for none, and for one that didn't load.
 */
const QUERY_HOOKS = new Set([
  "useInfiniteQuery",
  "useListboxQuery",
  "useOglLicense",
  "useQuery",
  "useRulesetAbilities",
  "useRulesetFeats",
  "useRulesetLanguages",
  "useRulesetSaves",
]);

/** The attribute `name` of a JSX element, when it has one. */
function attribute(element, name) {
  return element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** What a JSX attribute holds: its expression, or its string. */
function attributeValue(found) {
  return found?.value?.type === "JSXExpressionContainer" ? found.value.expression : found?.value;
}

/** The elements a JSX element holds: its own, those of its fragments, and those its conditions show. */
function childElements(node) {
  return node.children.flatMap((child) => {
    if (child.type === "JSXElement") return [child];
    if (child.type === "JSXFragment") return childElements(child);
    if (child.type !== "JSXExpressionContainer") return [];
    const { expression } = child;
    const branches =
      expression.type === "LogicalExpression"
        ? [expression.right]
        : expression.type === "ConditionalExpression"
          ? [expression.consequent, expression.alternate]
          : [expression];
    return branches.filter((branch) => branch.type === "JSXElement");
  });
}

/** The condition a JSX element shows on, when it sits on one: `cond && <X />`, `cond ? <X /> : …`. */
function conditionOf(node) {
  const parent = node.parent?.type === "ParenthesizedExpression" ? node.parent.parent : node.parent;
  if (parent?.type === "LogicalExpression" && parent.right === node) return parent.left;
  if (parent?.type === "ConditionalExpression" && parent.test !== node) return parent.test;
  return null;
}

function createDialogMounts(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/components/common/")) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (!name || !/(Dialog|Modal)$/.test(name) || !hasAttribute(node, "open")) return;
      const condition = conditionOf(node);
      if (condition && !readsTarget(condition)) {
        context.report({
          node: node.openingElement,
          message:
            "A dialog stays mounted, its `open` showing it, so it fades out as it closes; one that keeps state of its " +
            "own mounts with its `useDialogState` record (`{dialog.target && …}`) and lets it go once faded.",
        });
      }
      const open = attribute(node, "open");
      const value = attributeValue(open);
      const always = !open.value;
      const record =
        (value?.type === "UnaryExpression" && value.operator === "!") ||
        (value?.type === "CallExpression" && calleeName(value) === "Boolean") ||
        (value?.type === "BinaryExpression" && /^[!=]==?$/.test(value.operator) && isNull(value.right));
      if (!always && !record) return;
      context.report({
        node: open,
        message:
          "A dialog about a record opens through `useDialogState` (`open={dialog.open}`, `dialog.target`), which keeps " +
          "the record while it fades out.",
      });
    },
  };
}

function createMenus(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/components/common/ActionMenuItem.tsx") return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Menu" && childElements(node).some((child) => !MENU_CHILDREN.has(elementName(child)))) {
        context.report({
          node: node.openingElement,
          message: "A menu lists its items alone: a panel that opens from a button is a `Popover`.",
        });
      }
      if (name !== "MenuItem" || hasAttribute(node, "selected")) return;
      for (let p = parentElement(node); p; p = parentElement(p)) {
        if (elementName(p) !== "Menu") continue;
        context.report({
          node: node.openingElement,
          message:
            "A menu's action is an `ActionMenuItem` (its icon, its label, its intent); a `MenuItem` is one of " +
            "several to choose, marked `selected`.",
        });
        return;
      }
    },
  };
}

function createPageErrors(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "message" || elementName(node.parent.parent) !== "PageError") return;
      if (worded(attributeValue(node))) return;
      context.report({
        node,
        message:
          "A page that couldn't load says why in `loadFailureMessage`'s words (`loadFailureMessage(\"Campaign\", " +
          "error)`): not found, no access, or failed.",
      });
    },
  };
}

function createPendingButtons(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name !== "Button" && name !== "IconButton") return;
      const onClick = attribute(node, "onClick");
      const disabled = attribute(node, "disabled");
      if (!onClick || !disabled) return;
      const mutates = context.sourceCode.getText(onClick).includes(".mutate(");
      const waits = /isPending|isLoading|pending/.test(context.sourceCode.getText(disabled));
      if (!mutates || !waits || holdsSpinner(node)) return;
      context.report({
        node: node.openingElement,
        message:
          'A button that starts a request shows it running: its label in `<DiceSpinner size="small" loading={…}>`, ' +
          "disabled the while.",
      });
    },
  };
}

function createQueryErrors(context) {
  if (!inClient(context)) return {};
  return {
    VariableDeclarator(node) {
      const init = node.init;
      if (init?.type !== "CallExpression" || !QUERY_HOOKS.has(calleeName(init))) return;
      if (node.id.type === "ObjectPattern") {
        const keys = node.id.properties.flatMap((p) =>
          p.type === "Property" && p.key.type === "Identifier" ? [p.key.name] : [],
        );
        if ((!keys.includes("data") && !keys.includes("items")) || keys.includes("error")) return;
      } else if (node.id.type === "Identifier") {
        const name = node.id.name;
        const text = context.sourceCode.getText();
        if (new RegExp(`\\b${name}\\.error\\b`).test(text)) return;
        if (!new RegExp(`\\b${name}\\.(data|items)\\b`).test(text)) return;
      } else {
        return;
      }
      context.report({
        node,
        message:
          "What reads a query shows its failure too: read its `error` with its `data` and show it (`LoadError` where " +
          "the data shows, `PageError` for a page's record).",
      });
    },
  };
}

/** Whether a JSX element holds a spinner, at any depth. */
function holdsSpinner(element) {
  return element.children.some(
    (child) => child.type === "JSXElement" && (elementName(child) === "DiceSpinner" || holdsSpinner(child)),
  );
}

/** Whether an expression is `null` or `undefined`. */
function isNull(node) {
  return (node.type === "Literal" && node.value === null) || (node.type === "Identifier" && node.name === "undefined");
}

/** Whether a condition reads a `useDialogState`'s record: `dialog.target`. */
function readsTarget(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "MemberExpression" && !node.computed && node.property.name === "target") return true;
  return ["left", "right", "argument", "expression"].some((key) => readsTarget(node[key]));
}

/** Whether a message is `loadFailureMessage`'s: its call, or a condition whose branches are. */
function worded(value) {
  if (value?.type === "ConditionalExpression") return worded(value.consequent) && worded(value.alternate);
  return value?.type === "CallExpression" && calleeName(value) === "loadFailureMessage";
}

export default {
  "dialog-mounts": { meta: { type: "suggestion" }, create: createDialogMounts },
  menus: { meta: { type: "suggestion" }, create: createMenus },
  "page-errors": { meta: { type: "suggestion" }, create: createPageErrors },
  "pending-buttons": { meta: { type: "suggestion" }, create: createPendingButtons },
  "query-errors": { meta: { type: "suggestion" }, create: createQueryErrors },
};
