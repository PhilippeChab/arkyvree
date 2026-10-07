/**
 * The client's shared components, each the one way to write its pattern (AGENTS.md's Frontend Architecture):
 *
 * - `dialog-footers`: a dialog's footer is a `DialogFooter` (its way out, then its action or its own steps), never
 *   `DialogActions` written by hand.
 * - `add-buttons`: a button that adds something is an `AddButton`, never a `Button` given the add icon.
 * - `inline-confirms`: a dialog asking before it loses something asks at its top, an `InlineConfirm` (its way out, then
 *   its action); a save's rules warnings are a `ValidationIssuesAlert`. No other alert carries actions, and no
 *   "Are you sure" is written by hand.
 * - `link-buttons`: an action written as a link is a `LinkButton`, never a `MuiLink component="button"`.
 * - `choice-chips`: a chip that is one of several to choose (its look switched by a selection) is a `ChoiceChip`.
 * - `next-page-spinners`: the spinner at the foot of a list that loads its next page as it scrolls is a
 *   `NextPageSpinner`.
 * - `option-tooltips`: the level-up wizard's option tooltip (a description, or the tree of what it asks) is an
 *   `OptionTooltip`.
 * - `anchor-menus`: a menu that opens from what was clicked keeps its anchor through `useAnchorMenu`.
 * - `select-fields`: a select bound to a form's field is a `SelectField`.
 * - `form-validation`: a form is `noValidate`, so its rules check its fields and say why, never the browser; a bound
 *   field that asks the browser to check it (`required`, `type="email"`) has `rules`, and one with native bounds
 *   (`htmlInput: { min, max }`, which its stepper keeps) checks them with `wholeNumberRules`.
 * - `expand-arrows`: a toggle that shows or hides something leads with one arrow, `ExpandArrow`: a heading's is its
 *   `ToggleLabel`, a row's its first cell's, under `toggleProps` (an accordion's is MUI's, which the theme puts first).
 *   No other expand icon, and no arrow-only button but a `ToggleLabel`'s.
 * - `toggle-states`: a button that flips between two states keeps one label, naming what it turns on, and says which
 *   state it's in: `aria-pressed`, or `aria-expanded` when it shows or hides something.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { elementName, hasAttribute, inClient, parentElement } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** The pairs of words whose labels name a state and its opposite, A to Z within each; `Un…` pairs aside. */
const OPPOSITES = new Set(["Close Open", "Collapse Expand", "Hide Show"]);

/** The attribute `name` of a JSX element, when it has one. */
function attribute(element, name) {
  return element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** What a JSX attribute holds: its expression, or its string. */
function attributeValue(found) {
  return found?.value?.type === "JSXExpressionContainer" ? found.value.expression : found?.value;
}

function createAddButtons(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/AddButton.tsx")) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "startIcon") return;
      const value = attributeValue(node);
      if (value?.type !== "JSXElement" || elementName(value) !== "AddIcon") return;
      context.report({ node, message: "A button that adds something is an `AddButton` (`components/common`)." });
    },
  };
}

function createAnchorMenus(context) {
  if (!inClient(context) || inFile(context, "client/src/hooks/useAnchorMenu.ts")) return {};
  return {
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "useState") return;
      const types = node.typeArguments ?? node.typeParameters;
      const text = types ? context.sourceCode.getText(types) : "";
      if (!/\bHTMLElement\b/.test(text) || !/\bnull\b/.test(text) || /Record</.test(text)) return;
      context.report({
        node,
        message: "A menu that opens from what was clicked keeps its anchor through `useAnchorMenu` (`hooks/`).",
      });
    },
  };
}

function createChoiceChips(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/ChoiceChip.tsx")) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Chip" || attributeValue(attribute(node, "variant"))?.type !== "ConditionalExpression")
        return;
      context.report({
        node: node.openingElement,
        message: "A chip that is one of several to choose, its look switched by a selection, is a `ChoiceChip`.",
      });
    },
  };
}

function createDialogFooters(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/DialogFooter.tsx")) return {};
  return {
    ImportSpecifier(node) {
      if (node.imported.name !== "DialogActions" || node.parent.source.value !== "@mui/material") return;
      context.report({
        node,
        message: "A dialog's footer is a `DialogFooter` (its way out, then its action or its own steps).",
      });
    },
  };
}

function createExpandArrows(context) {
  if (!inClient(context)) return {};
  const file = repoPath(context.filename);
  return {
    JSXElement(node) {
      const name = elementName(node);
      const asExpandIcon =
        node.parent?.type === "JSXExpressionContainer" && node.parent.parent?.name?.name === "expandIcon";
      const arrow =
        name === "ExpandLessIcon" ||
        (name === "ExpandMoreIcon" && !asExpandIcon && file !== "client/src/components/common/ExpandArrow.tsx");
      // An arrow-only toggle is a `ToggleLabel`'s (the sidebar's chevron says which way it slides, not what it shows)
      const toggleButton =
        name === "IconButton" &&
        node.children.some((child) => child.type === "JSXElement" && elementName(child) === "ExpandArrow") &&
        file !== "client/src/components/common/ToggleLabel.tsx";
      const clickableToggle =
        hasAttribute(node, "aria-expanded") &&
        node.openingElement.attributes.some(
          (a) => a.type === "JSXSpreadAttribute" && context.sourceCode.getText(a).includes("clickableProps("),
        );
      if (!arrow && !toggleButton && !clickableToggle) return;
      context.report({
        node: node.openingElement,
        message:
          "A toggle leads with one arrow, `ExpandArrow`: a heading's is its `ToggleLabel`, a row's its first cell's " +
          'under `toggleProps(open, onToggle, "row")`; an accordion\'s is its `expandIcon`.',
      });
    },
  };
}

function createFormValidation(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const raw = elementName(node) === "form";
      const component = attributeValue(attribute(node, "component"));
      const asForm = component?.type === "Literal" && component.value === "form";
      if (raw || asForm) {
        if (hasAttribute(node, "noValidate")) return;
        context.report({
          node: node.openingElement,
          message: "A form is `noValidate`: its rules check its fields and say why, never the browser.",
        });
        return;
      }
      const type = attributeValue(attribute(node, "type"));
      const nativeCheck = hasAttribute(node, "required") || (type?.type === "Literal" && type.value === "email");
      if (!hasAttribute(node, "control") || !nativeCheck || hasAttribute(node, "rules")) return;
      context.report({
        node: node.openingElement,
        message:
          "A bound field's checks are its `rules` (`EMAIL_RULES`, `OPTIONAL_EMAIL_RULES`, `requiredRules`): a " +
          "`noValidate` form never runs the browser's.",
      });
    },
    Property(node) {
      if (node.key.type !== "Identifier" || node.key.name !== "htmlInput" || node.value.type !== "ObjectExpression")
        return;
      const bounds = new Set(
        node.value.properties
          .filter((p) => p.type === "Property" && p.key.type === "Identifier")
          .map((p) => p.key.name)
          .filter((name) => ["max", "min", "pattern"].includes(name)),
      );
      const field = parentElement(node);
      if (bounds.size === 0 || !field || !hasAttribute(field, "control")) return;
      // `wholeNumberRules(min, required, max)`: the bounds the field's stepper keeps, checked as the form submits
      const rules = attributeValue(attribute(field, "rules"));
      const checked =
        rules?.type === "CallExpression" &&
        rules.callee.type === "Identifier" &&
        rules.callee.name === "wholeNumberRules" &&
        !bounds.has("pattern") &&
        (!bounds.has("max") || rules.arguments.length >= 3);
      if (checked) return;
      context.report({
        node,
        message:
          "A bound field's bounds are its `rules` (`wholeNumberRules(min, required, max)`, its `max` too): the " +
          "browser's own, which the stepper keeps, never check a `noValidate` form.",
      });
    },
  };
}

function createInlineConfirms(context) {
  const file = repoPath(context.filename);
  const owners = [
    "client/src/components/common/InlineConfirm.tsx",
    "client/src/components/common/ValidationIssuesAlert.tsx",
  ];
  if (!inClient(context) || owners.includes(file)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "AnimatedAlert" || !hasAttribute(node, "action")) return;
      context.report({
        node: node.openingElement,
        message:
          "A dialog asks before a loss with an `InlineConfirm`, and shows a save's rules warnings with a " +
          "`ValidationIssuesAlert`: no other alert carries actions.",
      });
    },
    JSXText(node) {
      if (!/\bAre you sure\b/i.test(node.value) || inConfirmation(node)) return;
      context.report({
        node,
        message:
          "A confirmation is an `InlineConfirm` inside a dialog, a `ConfirmDialog` over a page: never written by hand.",
      });
    },
  };
}

function createLinkButtons(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/LinkButton.tsx")) return {};
  return {
    JSXElement(node) {
      const component = attributeValue(attribute(node, "component"));
      if (elementName(node) !== "MuiLink" || component?.type !== "Literal" || component.value !== "button") return;
      context.report({ node: node.openingElement, message: "An action written as a link is a `LinkButton`." });
    },
  };
}

function createNextPageSpinners(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/NextPageSpinner.tsx")) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "DiceSpinner") return;
      const stack = parentElement(node);
      const list = stack && elementName(stack) === "Stack" ? parentElement(stack) : null;
      if (!list || elementName(list) !== "List") return;
      context.report({
        node: node.openingElement,
        message: "The spinner at the foot of a list that loads its next page is a `NextPageSpinner`.",
      });
    },
  };
}

function createOptionTooltips(context) {
  const file = "client/src/pages/characters/details/components/dnd3.5/OptionTooltip.tsx";
  if (!inClient(context) || inFile(context, file)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Tooltip") return;
      const title = attributeValue(attribute(node, "title"));
      const text = title ? context.sourceCode.getText(title) : "";
      if (!/requirementTree|\.slice\(0,/.test(text)) return;
      context.report({
        node: node.openingElement,
        message: "An option's tooltip (its description, or the tree of what it asks) is an `OptionTooltip`.",
      });
    },
  };
}

function createSelectFields(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/FormFields.tsx")) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (!hasAttribute(node, "select") || (name !== "TextField" && name !== "FormTextField")) return;
      const bound =
        name === "FormTextField" ||
        hasAttribute(node, "inputRef") ||
        node.openingElement.attributes.some((a) => a.type === "JSXSpreadAttribute");
      if (!bound) return;
      context.report({ node: node.openingElement, message: "A select bound to a form's field is a `SelectField`." });
    },
  };
}

function createToggleStates(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      const label = attributeValue(attribute(node, "aria-label"));
      if (flips(label)) {
        context.report({
          node: node.openingElement,
          message:
            "A toggle keeps one label and says its state: `aria-pressed`, or `aria-expanded` when it shows or hides " +
            "something, never a label that flips (`Star` / `Unstar`).",
        });
        return;
      }
      if (!label || firstWord(label) !== "Toggle") return;
      if (hasAttribute(node, "aria-pressed") || hasAttribute(node, "aria-expanded")) return;
      context.report({
        node: node.openingElement,
        message:
          "A toggle names what it turns on and says its state: `aria-pressed`, or `aria-expanded` when it shows or " +
          "hides something.",
      });
    },
  };
}

/** The first word of a label written as a string or a template: `"Star ruleset"`'s `Star`. */
function firstWord(node) {
  const text =
    node.type === "Literal" ? node.value : node.type === "TemplateLiteral" ? node.quasis[0].value.cooked : "";
  return typeof text === "string" ? text.split(/\s/)[0] : "";
}

/** Whether a label flips between a state and its opposite: `open ? "Hide" : "Show"`, alone or opening a template. */
function flips(label) {
  const conditional =
    label?.type === "TemplateLiteral" && label.quasis[0].value.cooked === "" ? label.expressions[0] : label;
  return (
    conditional?.type === "ConditionalExpression" &&
    opposite(firstWord(conditional.consequent), firstWord(conditional.alternate))
  );
}

/** Whether a text is a confirmation's own: a `ConfirmDialog`'s (`DeleteDialog`'s) `message`, an `InlineConfirm`'s question. */
function inConfirmation(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "JSXAttribute" && p.name.name === "message") return true;
    if (p.type === "JSXElement" && ["ConfirmDialog", "DeleteDialog", "InlineConfirm"].includes(elementName(p)))
      return true;
  }
  return false;
}

/** Whether the linted file is `file`, the one module the rule leaves the raw pattern to. */
function inFile(context, file) {
  return repoPath(context.filename) === file;
}

/** Whether two words name a state and its opposite: `Star` and `Unstar`, `Expand` and `Collapse`. */
function opposite(a, b) {
  if (!a || !b) return false;
  const pair = [a, b].sort().join(" ");
  return OPPOSITES.has(pair) || a === `Un${b.toLowerCase()}` || b === `Un${a.toLowerCase()}`;
}

export default {
  "add-buttons": { meta: { type: "suggestion" }, create: createAddButtons },
  "anchor-menus": { meta: { type: "suggestion" }, create: createAnchorMenus },
  "choice-chips": { meta: { type: "suggestion" }, create: createChoiceChips },
  "dialog-footers": { meta: { type: "suggestion" }, create: createDialogFooters },
  "expand-arrows": { meta: { type: "suggestion" }, create: createExpandArrows },
  "form-validation": { meta: { type: "suggestion" }, create: createFormValidation },
  "inline-confirms": { meta: { type: "suggestion" }, create: createInlineConfirms },
  "link-buttons": { meta: { type: "suggestion" }, create: createLinkButtons },
  "next-page-spinners": { meta: { type: "suggestion" }, create: createNextPageSpinners },
  "option-tooltips": { meta: { type: "suggestion" }, create: createOptionTooltips },
  "select-fields": { meta: { type: "suggestion" }, create: createSelectFields },
  "toggle-states": { meta: { type: "suggestion" }, create: createToggleStates },
};
