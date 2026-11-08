/**
 * The client's controls, each weighing what it does one way (docs/frontend.md, docs/ui-buttons.md):
 *
 * - `button-intents`: a button in an intent's color (`error`, `warning`, `success`: a destructive, a caution or a
 *   positive action) is contained, as heavy as the action is; a menu's item or a row's action that deletes or removes
 *   ("Delete …", "Remove …") is destructive.
 * - `save-buttons`: an inline form's submit is a `SaveButton`, at the form's end on the right, enabled once something
 *   changes; an auth page's is its `AuthSubmitButton`, and a dialog's its `DialogFooter`'s action.
 * - `chips`: a chip is one of the family (`components/common`), its role setting its look at the theme's small size, in
 *   a list, a card or a page's header alike: a `RoleChip` (outlined), a `StatusChip` (filled), a `CountChip`
 *   (outlined), a `ValueChip` (outlined red, a link through its `to` when it names a record, never a link in its label)
 *   or a `ChoiceChip`, but an advancement wizard's pick, a `PickChip` (filled, at the medium size); MUI's `Chip` is the
 *   family's alone (`Chips.tsx`). A chip is a value or a choice, never an action: a click with a fixed label, or one
 *   that opens something (a menu, a popover), is a `Button`'s, but a count's, which opens the list of what it counts (a
 *   ruleset header's "3 extensions").
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { attribute, attributeExpression, elementName, hasAttribute, inClient } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** The module that draws MUI's chip: the family, each of its roles setting its look. */
const CHIP_OWNER = "client/src/components/common/Chips.tsx";

/** The chips of a role (a choice's is `ChoiceChip`, which a click picks). */
const CHIP_ROLES = new Set(["Chip", "CountChip", "PickChip", "RoleChip", "StatusChip", "ValueChip"]);

/** The actions that take an intent (`components/common/intent.ts`): a menu's item, a row's action */
const INTENT_ACTIONS = new Set(["ActionMenuItem", "RowAction"]);

/** The colors that carry an action's intent (docs/ui-buttons.md): destructive, caution, positive. */
const INTENT_COLORS = new Set(["error", "success", "warning"]);

/** The modules that write a submit of their own: the inline forms' and the auth pages'. */
const SUBMIT_OWNERS = new Set([
  "client/src/components/common/SaveButton.tsx",
  "client/src/pages/auth/components/AuthSubmitButton.tsx",
]);

function createButtonIntents(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (INTENT_ACTIONS.has(elementName(node))) {
        if (!removes(attributeExpression(attribute(node, "label")))) return;
        const intent = attributeExpression(attribute(node, "intent"));
        if (intent?.type === "Literal" && intent.value === "destructive") return;
        context.report({
          node: node.openingElement,
          message: 'An action that deletes or removes ("Delete …", "Remove …") is destructive: `intent="destructive"`.',
        });
        return;
      }
      if (elementName(node) !== "Button") return;
      const color = attributeExpression(attribute(node, "color"));
      if (color?.type !== "Literal" || !INTENT_COLORS.has(color.value)) return;
      const variant = attributeExpression(attribute(node, "variant"));
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
  const owner = repoPath(context.filename) === CHIP_OWNER;
  return {
    JSXAttribute(node) {
      if (node.name.name !== "label" || !CHIP_ROLES.has(elementName(node.parent.parent))) return;
      if (!holdsLink(attributeExpression(node))) return;
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
          "a `StatusChip`, a `CountChip`, a `ValueChip`, a `PickChip` or a `ChoiceChip`.",
      });
    },
    JSXElement(node) {
      if (!CHIP_ROLES.has(elementName(node)) || !hasAttribute(node, "onClick")) return;
      const label = attributeExpression(attribute(node, "label"));
      // A click that opens something (a menu, a popover, a dialog: `menu.openMenu`, `setOpen(true)`) is an action's,
      // but a count's, which opens the list of what it counts
      const click = context.sourceCode.getText(attributeExpression(attribute(node, "onClick")));
      const opens = /\bopen|set\w*Open\(/.test(click);
      if (label?.type !== "Literal" && (!opens || elementName(node) === "CountChip")) return;
      context.report({
        node: node.openingElement,
        message:
          "A chip is a value or a choice, never an action: a click with a fixed label, or one that opens something " +
          "(but a count's, which opens what it counts), is a `Button`'s.",
      });
    },
  };
}

function createSaveButtons(context) {
  if (!inClient(context) || SUBMIT_OWNERS.has(repoPath(context.filename))) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Button") return;
      const type = attributeExpression(attribute(node, "type"));
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
  const component = attributeExpression(attribute(node, "component"));
  if (
    ["Link", "MuiLink"].includes(elementName(node)) ||
    (component?.type === "Identifier" && component.name === "Link")
  )
    return true;
  return node.children.some(holdsLink);
}

/** Whether a label says the action deletes or removes: every way it's written does ("Delete", "Remove Level"). */
function removes(label) {
  if (label?.type === "ConditionalExpression") return removes(label.consequent) && removes(label.alternate);
  return label?.type === "Literal" && /^(Delete|Remove)\b/.test(String(label.value));
}

export default {
  "button-intents": { meta: { type: "suggestion" }, create: createButtonIntents },
  chips: { meta: { type: "suggestion" }, create: createChips },
  "save-buttons": { meta: { type: "suggestion" }, create: createSaveButtons },
};
