/**
 * How the client tells the user what happens, one way (docs/frontend.md):
 *
 * - `dialog-mounts`: a dialog stays mounted, its `open` showing it, so it fades out as it closes; a dialog about a
 *   record opens through `useDialogState`, which keeps the record while it fades, never an `…Open` flag set beside a
 *   record state of its own, and one that keeps state of its own mounts with that record (`{dialog.target && …}`) and
 *   lets it go once faded.
 * - `menus`: a menu lists its items alone (a panel that opens from a button is a `Popover`), and an action in it is an
 *   `ActionMenuItem`, one line each; a `MenuItem` is one of several to choose, marked `selected`. A menu is sized by
 *   its items and opens where MUI puts it (no width, no anchor of its own), and its delete is "Delete Permanently",
 *   or "Delete" for what a fork inherits, which its Local Changes restore (`restorable ? "Delete" : "Delete
 *   Permanently"`).
 * - `pending-buttons`: a button that starts a request shows it running: its label in a `DiceSpinner`, disabled the
 *   while; so does a contained one disabled while a request it's handed runs (a `pending` prop: Proceed Anyway's).
 * - `page-errors`: a page that couldn't load shows a `PageError`, never an alert of its own: it says why in
 *   `loadFailureMessage`'s words, and its way back is named for where it goes ("Back to Ruleset").
 * - `pickers`: a picker whose options load says so in its open list (`loading`: "Loading…"), never with a spinner in
 *   its field.
 * - `query-errors`: what reads a query shows its failure too: it reads `error` with its `data` (a listbox's `items`).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { calleeName, childElements, elementName, hasAttribute, inClient, parentElement } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** What a `Menu` holds: its items, and the dividers between them */
const MENU_CHILDREN = new Set(["ActionMenuItem", "Divider", "MenuItem"]);

/** What would size or place a `Menu` of its own: its items size it, MUI places it under what opened it */
const MENU_PLACEMENTS = ["PaperProps", "anchorOrigin", "slotProps", "sx", "transformOrigin"];

/** What a page shows when it couldn't load: its `PageError`, or an entity page's, in its column */
const PAGE_ERRORS = new Set(["EntityPageError", "PageError"]);

/**
 * The hooks that read a query: TanStack's, and the app's that hand on its result (`items` for a listbox's). An image's
 * (`useAttachment`) isn't one: an avatar or a portrait shows its placeholder for none, and for one that didn't load.
 */
const QUERY_HOOKS = new Set([
  "useInfiniteQuery",
  "useListboxQuery",
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

/** The props a JSX element's component destructures (`function X({ onProceed, pending })`): none outside one. */
function componentProps(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (!["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(p.type)) continue;
    const [first] = p.params;
    if (first?.type !== "ObjectPattern") return new Set();
    return new Set(
      first.properties.flatMap((property) =>
        property.type === "Property" && property.key.type === "Identifier" ? [property.key.name] : [],
      ),
    );
  }
  return new Set();
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
  // The component's states: a record a dialog acts on (`useState<X | null>(null)`) and an open flag (`useState(false)`)
  const recordSetters = new Set();
  const openSetters = new Set();
  const blocks = [];
  return {
    VariableDeclarator(node) {
      if (node.id.type !== "ArrayPattern" || node.init?.type !== "CallExpression") return;
      if (calleeName(node.init) !== "useState") return;
      const setter = node.id.elements[1];
      const [initial] = node.init.arguments;
      if (setter?.type !== "Identifier" || !initial) return;
      if (isNull(initial)) recordSetters.add(setter.name);
      if (initial.type === "Literal" && initial.value === false && setter.name.endsWith("Open"))
        openSetters.add(setter.name);
    },
    BlockStatement(node) {
      blocks.push(node);
    },
    // An opener that keeps a record beside a flag (`setSelected(row); setDialogOpen(true)`) loses it as it closes
    "Program:exit"() {
      for (const block of blocks) {
        const calls = block.body
          .filter(
            (statement) => statement.type === "ExpressionStatement" && statement.expression.type === "CallExpression",
          )
          .map((statement) => statement.expression)
          .filter((call) => call.callee.type === "Identifier");
        const keeps = calls.some(
          (call) => recordSetters.has(call.callee.name) && call.arguments[0] && !isNull(call.arguments[0]),
        );
        const opens = calls.find(
          (call) =>
            openSetters.has(call.callee.name) &&
            call.arguments[0]?.type === "Literal" &&
            call.arguments[0].value === true,
        );
        if (!keeps || !opens) continue;
        context.report({
          node: opens,
          message:
            "A dialog about a record opens through `useDialogState` (`dialog.openWith(row)`), which keeps the record " +
            "while it fades out, never a flag beside a record of its own.",
        });
      }
    },
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
      if (name === "Menu" && MENU_PLACEMENTS.some((placement) => hasAttribute(node, placement))) {
        context.report({
          node: node.openingElement,
          message: "A menu is sized by its items and opens where MUI puts it: no width, no anchor of its own.",
        });
      }
      if (name === "ActionMenuItem" && deletesForGood(attributeValue(attribute(node, "label")))) {
        context.report({
          node: node.openingElement,
          message:
            'A menu\'s delete says it can\'t be undone, as Archive can: "Delete Permanently"; "Delete" only for what can ' +
            'be restored, on its condition (`restorable ? "Delete" : "Delete Permanently"`).',
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
      const element = elementName(node.parent.parent);
      // Its way back names where it goes: "Back to Ruleset", never a bare "Back"
      if (node.name.name === "backLabel" && PAGE_ERRORS.has(element)) {
        const label = attributeValue(node);
        if (label?.type !== "Literal" || label.value.startsWith("Back to ")) return;
        context.report({
          node,
          message: 'A page error\'s way back is named for where it goes: `backLabel="Back to Ruleset"`.',
        });
        return;
      }
      if (node.name.name !== "message" || element !== "PageError") return;
      if (worded(attributeValue(node))) return;
      context.report({
        node,
        message:
          "A page that couldn't load says why in `loadFailureMessage`'s words (`loadFailureMessage(\"Campaign\", " +
          "error)`): not found, no access, or failed.",
      });
    },
    JSXElement(node) {
      // What a page shows in its place: a strip of its own leaves no way out
      const name = elementName(node);
      if ((name !== "LoadError" && name !== "Alert") || elementName(parentElement(node) ?? node) !== "Container")
        return;
      context.report({
        node: node.openingElement,
        message:
          "A page that couldn't load shows a `PageError` (its reason and its way back), never an alert of its own.",
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
      // It sends the request (`.mutate(`), or it's the action its component's owner hands a request to: a contained
      // button whose click and whose pending flag are its component's props (Proceed Anyway's `onProceed`, `pending`)
      const variant = attributeValue(attribute(node, "variant"));
      const contained = variant?.type === "Literal" && variant.value === "contained";
      const props = componentProps(node);
      const handedOn =
        contained &&
        props.has(attributeValue(onClick)?.name) &&
        [...identifiersIn(attributeValue(disabled))].some((name) => props.has(name));
      const mutates = context.sourceCode.getText(onClick).includes(".mutate(") || handedOn;
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

function createPickers(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "DiceSpinner" && inPickerField(node)) {
        context.report({
          node: node.openingElement,
          message:
            'A picker says it\'s loading in its open list (its `loading`: "Loading…"), never with a spinner in its field.',
        });
        return;
      }
      if (name !== "Autocomplete") return;
      // Options a query loads: it says why there are none (`emptyOptionsText`), and that they're coming
      const noOptions = attributeValue(attribute(node, "noOptionsText"));
      const loads = noOptions?.type === "CallExpression" && calleeName(noOptions) === "emptyOptionsText";
      const spreads = node.openingElement.attributes.some((a) => a.type === "JSXSpreadAttribute");
      if (!loads || spreads || hasAttribute(node, "loading")) return;
      context.report({
        node: node.openingElement,
        message:
          "A picker whose options load says so in its open list: its `loading`, beside its `noOptionsText`, which " +
          "would say there are none.",
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

/**
 * Whether a menu item's label says "Delete" of what can't be restored: written so, or a condition's branch whose other
 * one isn't "Delete Permanently".
 */
function deletesForGood(label) {
  const isDelete = (node) => node?.type === "Literal" && node.value === "Delete";
  if (label?.type !== "ConditionalExpression") return isDelete(label);
  const { consequent, alternate } = label;
  const isForGood = (node) => node?.type === "Literal" && node.value === "Delete Permanently";
  return (isDelete(consequent) && !isForGood(alternate)) || (isDelete(alternate) && !isForGood(consequent));
}

/** Whether a JSX element holds a spinner, at any depth. */
function holdsSpinner(element) {
  return element.children.some(
    (child) => child.type === "JSXElement" && (elementName(child) === "DiceSpinner" || holdsSpinner(child)),
  );
}

/** The names an expression reads: `pending`, `!canSave || pending`. */
function identifiersIn(node) {
  if (!node) return new Set();
  if (node.type === "Identifier") return new Set([node.name]);
  if (node.type === "LogicalExpression") return new Set([...identifiersIn(node.left), ...identifiersIn(node.right)]);
  if (node.type === "UnaryExpression") return identifiersIn(node.argument);
  return new Set();
}

/** Whether a node sits in a picker's field: an `Autocomplete`'s `renderInput`, or an input's adornment. */
function inPickerField(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "JSXAttribute" && p.name.name === "renderInput") return true;
    if (p.type === "Property" && ["endAdornment", "startAdornment"].includes(p.key?.name)) return true;
  }
  return false;
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
  pickers: { meta: { type: "suggestion" }, create: createPickers },
  "query-errors": { meta: { type: "suggestion" }, create: createQueryErrors },
};
