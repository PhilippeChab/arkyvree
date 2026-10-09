/**
 * The client's controls, each weighing what it does one way (docs/frontend.md, docs/ui-buttons.md):
 *
 * - `button-intents`: a button in an intent's color (`error`, `warning`, `success`: a destructive, a caution or a
 *   positive action) is contained, as heavy as the action is; a menu's item or a row's action that deletes or removes
 *   ("Delete …", "Remove …") is destructive.
 * - `save-buttons`: an inline form's submit is a `SaveButton`, at the form's end on the right, enabled once something
 *   changes; an auth page's is its `AuthSubmitButton`, and a dialog's its `DialogFooter`'s action.
 * - `roll-buttons`: a roll of every die a step asks for is a labelled `RollAllButton`, never a bare dice icon.
 * - `dice-rolls`: a roll shows through `useDiceRoll`, timed by `DICE_ROLL`: never a timer of its own that rolls.
 * - `page-actions`: a page header's action is a `PageActionButton` (a create, or another action given its icon).
 * - `load-more-buttons`: the foot that loads a list's next page is a `LoadMoreButton`, labelled "Load More" wherever
 *   it shows.
 * - `chips`: a chip is one of the family (`components/common`), its role setting its look at the theme's small size,
 *   in a list, a card or a page's header alike: a `RoleChip` (outlined), a `StatusChip` (filled), a `CountChip`
 *   (outlined), a `ValueChip` (outlined red, a link through its `to` when it names a record, never a link in its
 *   label) or a `ChoiceChip`; MUI's `Chip` is the
 *   family's alone. A chip is a value or a choice, never an action: a click with a fixed label, or one that opens
 *   something (a menu, a popover), is a `Button`'s.
 * - `help-labels`: help is a `HelpLabel` wherever it's given (its question-mark icon, at 16px): never a help icon in a
 *   tooltip of its own, nor a "What's this?".
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { elementName, hasAttribute, inClient, parentElement } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** The modules that draw MUI's chip: the family, each of its roles setting its look. */
const CHIP_OWNERS = new Set(["client/src/components/common/ChoiceChip.tsx", "client/src/components/common/Chips.tsx"]);

/** The chips of a role (a choice's is `ChoiceChip`, which a click picks). */
const CHIP_ROLES = new Set(["Chip", "CountChip", "RoleChip", "StatusChip", "ValueChip"]);

/** The module that shows a roll as it tumbles, its timers its own. */
const DICE_ROLL_OWNER = "client/src/pages/characters/useDiceRoll.ts";

/** The actions that take an intent (`components/common/intent.ts`): a menu's item, a row's action */
const INTENT_ACTIONS = new Set(["ActionMenuItem", "RowAction"]);

/** The colors that carry an action's intent (docs/ui-buttons.md): destructive, caution, positive. */
const INTENT_COLORS = new Set(["error", "success", "warning"]);

/** The modules that write a submit of their own: the inline forms' and the auth pages'. */
const SUBMIT_OWNERS = new Set([
  "client/src/components/auth/AuthSubmitButton.tsx",
  "client/src/components/common/SaveButton.tsx",
]);

/** The attribute `name` of a JSX element, when it has one. */
function attribute(element, name) {
  return element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** What a JSX attribute holds: its expression, or its string. */
function attributeValue(found) {
  return found?.value?.type === "JSXExpressionContainer" ? found.value.expression : found?.value;
}

function createButtonIntents(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (INTENT_ACTIONS.has(elementName(node))) {
        if (!removes(attributeValue(attribute(node, "label")))) return;
        const intent = attributeValue(attribute(node, "intent"));
        if (intent?.type === "Literal" && intent.value === "destructive") return;
        context.report({
          node: node.openingElement,
          message: 'An action that deletes or removes ("Delete …", "Remove …") is destructive: `intent="destructive"`.',
        });
        return;
      }
      if (elementName(node) !== "Button") return;
      const color = attributeValue(attribute(node, "color"));
      if (color?.type !== "Literal" || !INTENT_COLORS.has(color.value)) return;
      const variant = attributeValue(attribute(node, "variant"));
      if (variant?.type === "Literal" && variant.value === "contained") return;
      context.report({
        node: node.openingElement,
        message:
          'A destructive, caution or positive action is contained (`variant="contained"`), as heavy as it is ' +
          "(docs/ui-buttons.md).",
      });
    },
  };
}

function createChips(context) {
  if (!inClient(context)) return {};
  const owner = CHIP_OWNERS.has(repoPath(context.filename));
  return {
    JSXAttribute(node) {
      if (node.name.name !== "label" || !CHIP_ROLES.has(elementName(node.parent.parent))) return;
      if (!holdsLink(attributeValue(node))) return;
      context.report({
        node,
        message: "A chip that names a record links through its `to` (`ValueChip`), never a link in its label.",
      });
    },
    ImportSpecifier(node) {
      if (owner || node.imported.name !== "Chip" || node.parent.source.value !== "@mui/material") return;
      context.report({
        node,
        message:
          "A chip is one of the family (`components/common`), its role setting its look and its size: a `RoleChip`, " +
          "a `StatusChip`, a `CountChip`, a `ValueChip` or a `ChoiceChip`.",
      });
    },
    JSXElement(node) {
      if (!CHIP_ROLES.has(elementName(node)) || !hasAttribute(node, "onClick")) return;
      const label = attributeValue(attribute(node, "label"));
      // A click that opens something (a menu, a popover, a dialog: `menu.openMenu`, `setOpen(true)`) is an action's
      const click = context.sourceCode.getText(attributeValue(attribute(node, "onClick")));
      if (label?.type !== "Literal" && !/\bopen|set\w*Open\(/.test(click)) return;
      context.report({
        node: node.openingElement,
        message:
          "A chip is a value or a choice, never an action: a click with a fixed label, or one that opens something, " +
          "is a `Button`'s.",
      });
    },
  };
}

function createDiceRolls(context) {
  if (!inClient(context) || inFile(context, DICE_ROLL_OWNER)) return {};
  return {
    CallExpression(node) {
      if (!isRollCall(node) || !inTimer(node)) return;
      context.report({
        node,
        message:
          "A roll shows through `useDiceRoll` (`pages/characters`), timed by `DICE_ROLL`: never a timer of its own " +
          "that rolls.",
      });
    },
  };
}

function createHelpLabels(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/HelpLabel.tsx")) return {};
  const message = "Help is a `HelpLabel` wherever it's given: its label, then the help icon whose tooltip explains it.";
  return {
    JSXElement(node) {
      if (elementName(node) !== "HelpIcon") return;
      for (let p = parentElement(node); p; p = parentElement(p)) {
        if (elementName(p) !== "Tooltip") continue;
        context.report({ node: node.openingElement, message });
        return;
      }
    },
    JSXText(node) {
      if (/\bWhat['’]s this\?/i.test(node.value)) context.report({ node, message });
    },
  };
}

function createLoadMoreButtons(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/LoadMoreButton.tsx")) return {};
  const message = 'The foot that loads a list\'s next page is a `LoadMoreButton`, labelled "Load More" everywhere.';
  return {
    JSXText(node) {
      if (/^\s*Load More\b/.test(node.value)) context.report({ node, message });
    },
    Literal(node) {
      if (typeof node.value === "string" && /^Load More\b/.test(node.value)) context.report({ node, message });
    },
  };
}

function createPageActions(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "action" || elementName(node.parent.parent) !== "PageHeader") return;
      const value = attributeValue(node);
      if (value?.type !== "JSXElement" || elementName(value) === "PageActionButton") return;
      context.report({
        node,
        message:
          "A page header's action is a `PageActionButton`: a create, or another action given its `icon` and " +
          "`pending`.",
      });
    },
  };
}

function createRollButtons(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      const label = attributeValue(attribute(node, "aria-label"));
      if (label?.type !== "Literal" || !/^Roll All\b/.test(String(label.value))) return;
      context.report({
        node: node.openingElement,
        message: "A roll of every die a step asks for is a labelled `RollAllButton` (`pages/characters`).",
      });
    },
  };
}

function createSaveButtons(context) {
  if (!inClient(context) || SUBMIT_OWNERS.has(repoPath(context.filename))) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Button") return;
      const type = attributeValue(attribute(node, "type"));
      if (type?.type !== "Literal" || type.value !== "submit") return;
      context.report({
        node: node.openingElement,
        message:
          "An inline form's submit is a `SaveButton` (at its end on the right, enabled once something changes); a " +
          "dialog's is its `DialogFooter`'s action.",
      });
    },
  };
}

/** Whether `node`, an expression or an element, holds a link: React Router's or MUI's, or an element made one. */
function holdsLink(node) {
  if (!node) return false;
  if (node.type === "ParenthesizedExpression") return holdsLink(node.expression);
  if (node.type === "ConditionalExpression") return holdsLink(node.consequent) || holdsLink(node.alternate);
  if (node.type === "LogicalExpression") return holdsLink(node.right);
  if (node.type === "JSXFragment") return node.children.some(holdsLink);
  if (node.type === "JSXExpressionContainer") return holdsLink(node.expression);
  if (node.type !== "JSXElement") return false;
  const component = attributeValue(attribute(node, "component"));
  if (
    ["Link", "MuiLink"].includes(elementName(node)) ||
    (component?.type === "Identifier" && component.name === "Link")
  )
    return true;
  return node.children.some(holdsLink);
}

/** Whether the linted file is `file`, the one module the rule leaves the raw pattern to. */
function inFile(context, file) {
  return repoPath(context.filename) === file;
}

/** Whether a call runs in a timer's callback: `setInterval(() => …)`, `setTimeout(function () { … })`. */
function inTimer(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type !== "ArrowFunctionExpression" && p.type !== "FunctionExpression") continue;
    const call = p.parent;
    if (call?.type !== "CallExpression" || call.arguments[0] !== p) continue;
    const name = call.callee.type === "MemberExpression" ? call.callee.property.name : call.callee.name;
    if (name === "setInterval" || name === "setTimeout") return true;
  }
  return false;
}

/** Whether a call rolls: a die's (`rollDie`), a roll method's (`roll()`, `rollScore()`), or a random number's. */
function isRollCall(node) {
  const callee = node.callee;
  const name = callee.type === "MemberExpression" && !callee.computed ? callee.property.name : callee.name;
  if (callee.type === "MemberExpression" && callee.object.name === "Math") return name === "random";
  return /^roll(?:[A-Z]|$)/.test(name ?? "");
}

/** Whether a label says the action deletes or removes: every way it's written does ("Delete", "Remove Level"). */
function removes(label) {
  if (label?.type === "ConditionalExpression") return removes(label.consequent) && removes(label.alternate);
  return label?.type === "Literal" && /^(Delete|Remove)\b/.test(String(label.value));
}

export default {
  "button-intents": { meta: { type: "suggestion" }, create: createButtonIntents },
  chips: { meta: { type: "suggestion" }, create: createChips },
  "dice-rolls": { meta: { type: "suggestion" }, create: createDiceRolls },
  "help-labels": { meta: { type: "suggestion" }, create: createHelpLabels },
  "load-more-buttons": { meta: { type: "suggestion" }, create: createLoadMoreButtons },
  "page-actions": { meta: { type: "suggestion" }, create: createPageActions },
  "roll-buttons": { meta: { type: "suggestion" }, create: createRollButtons },
  "save-buttons": { meta: { type: "suggestion" }, create: createSaveButtons },
};
