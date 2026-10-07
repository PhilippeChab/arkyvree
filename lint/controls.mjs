/**
 * The client's controls, each weighing what it does one way (docs/frontend.md, docs/ui-buttons.md):
 *
 * - `button-intents`: a button in an intent's color (`error`, `warning`, `success`: a destructive, a caution or a
 *   positive action) is contained, as heavy as the action is.
 * - `save-buttons`: an inline form's submit is a `SaveButton`, at the form's end on the right, enabled once something
 *   changes; an auth page's is its `AuthSubmitButton`, and a dialog's its `DialogFooter`'s action.
 * - `roll-buttons`: a roll of every die a step asks for is a labelled `RollAllButton`, never a bare dice icon.
 * - `page-actions`: a page header's action is a `PageActionButton` (a create, or another action given its icon).
 * - `load-more-buttons`: the foot that loads a list's next page is a `LoadMoreButton`, labelled "Load More" wherever
 *   it shows.
 * - `chips`: a chip is one of the family (`components/common`), its role setting its look at the theme's small size,
 *   in a list, a card or a page's header alike: a `RoleChip` (outlined), a `StatusChip` (filled), a `CountChip`
 *   (outlined), a `ValueChip` (outlined red, a link when it names a record) or a `ChoiceChip`; MUI's `Chip` is the
 *   family's alone. A chip is a value or a choice, never an action: a click with a fixed label is a `Button`'s.
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
      if (label?.type !== "Literal") return;
      context.report({
        node: node.openingElement,
        message: "A chip is a value or a choice, never an action: a click with a fixed label is a `Button`'s.",
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
        message: "A roll of every die a step asks for is a labelled `RollAllButton` (`components/characters`).",
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

/** Whether the linted file is `file`, the one module the rule leaves the raw pattern to. */
function inFile(context, file) {
  return repoPath(context.filename) === file;
}

export default {
  "button-intents": { meta: { type: "suggestion" }, create: createButtonIntents },
  chips: { meta: { type: "suggestion" }, create: createChips },
  "help-labels": { meta: { type: "suggestion" }, create: createHelpLabels },
  "load-more-buttons": { meta: { type: "suggestion" }, create: createLoadMoreButtons },
  "page-actions": { meta: { type: "suggestion" }, create: createPageActions },
  "roll-buttons": { meta: { type: "suggestion" }, create: createRollButtons },
  "save-buttons": { meta: { type: "suggestion" }, create: createSaveButtons },
};
