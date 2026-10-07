/**
 * What the client says, said one way (docs/frontend.md):
 *
 * - `label-case`: a label is in Title Case ("Mark All as Read"): a button's, a menu item's, a field's, a dialog's
 *   title and its actions, a tooltip that names an icon button, and any element's `aria-label`.
 * - `toast-wording`: a toast is a phrase ("Ruleset archived"), no final period or "!", no "successfully", no
 *   "Please"; an error's fallback names what failed ("Failed to remove item").
 * - `confirm-wording`: a confirmation asks "Are you sure you want to …?", then says what follows; a deletion ends
 *   "This action cannot be undone."
 * - `typography-marks`: an ellipsis is "…" and a dash between words "—", never "..." or " - "; a text cut short is
 *   `truncate(text, length)`.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { calleeName, elementName, inClient } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** What lays a label out without being one: its row, its box, its spinner while pending */
const LABEL_LAYOUT = new Set(["Box", "DiceSpinner", "Stack", "Typography", "span"]);

/** The props that hold an action's label or a field's name */
const LABEL_PROPS = new Set(["backLabel", "cancelLabel", "confirmLabel", "label", "submitLabel"]);

/** The elements whose text is an action's label: a button, a menu item, a toggle, a tab, a dialog's title */
const LABELLED = new Set([
  "ActionMenuItem",
  "AddButton",
  "Button",
  "DialogTitle",
  "LinkButton",
  "MenuItem",
  "Tab",
  "ToggleButton",
]);

/** The elements whose `label` names them: the actions, the fields, the dialogs */
const LABELLED_BY_PROP =
  /^(ActionMenuItem|AddButton|Button|ChoiceChip|Tab|ToggleButton|DescriptionField|EmailField|FormControlLabel|FormTextField|LinkButton|NameField|PageActionButton|PasswordField|SelectField|SwitchField|TextField|.*Dialog|Modal)$/;

/** The words a Title Case label leaves lowercase, but first */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

/** What a JSX attribute holds: its expression, or its string. */
function attributeExpression(node) {
  return node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
}

function createConfirmWording(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "message") return;
      const element = elementName(node.parent.parent);
      if (element !== "ConfirmDialog" && element !== "DeleteDialog") return;
      const text = writtenText(attributeExpression(node));
      if (text === null) return;
      const asks = /^Are you sure you want to [^?]+\?/.test(text);
      const final = element !== "DeleteDialog" || text.endsWith("This action cannot be undone.");
      if (asks && final) return;
      context.report({
        node,
        message:
          'A confirmation asks "Are you sure you want to …?", then says what follows; a deletion ends "This action ' +
          'cannot be undone."',
      });
    },
  };
}

function createLabelCase(context) {
  if (!inClient(context)) return {};
  const report = (node, text) =>
    context.report({
      node,
      message: `A label is in Title Case ("Mark All as Read"): a button's, a menu item's, a field's, a dialog's, an icon button's tooltip, an \`aria-label\`: "${text.trim()}".`,
    });
  return {
    JSXText(node) {
      if (labelledBy(node) && /[a-z]/i.test(node.value) && !inTitleCase(node.value)) report(node, node.value);
    },
    JSXAttribute(node) {
      const element = elementName(node.parent.parent) ?? "";
      const name = node.name.name;
      const labels =
        (LABEL_PROPS.has(name) && LABELLED_BY_PROP.test(element)) ||
        (name === "title" && /(Dialog|^Modal)$/.test(element));
      const namesIcon = name === "title" && element === "Tooltip" && wrapsIconButton(node.parent.parent);
      if (!labels && !namesIcon && name !== "aria-label") return;
      for (const text of texts(attributeExpression(node))) if (!inTitleCase(text)) report(node, text);
    },
  };
}

function createToastWording(context) {
  if (!inClient(context)) return {};
  return {
    CallExpression(node) {
      const callee = node.callee;
      const isToast =
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "snackbar" &&
        ["error", "info", "success", "warning"].includes(callee.property.name);
      if (!isToast) return;
      const errorFallback = callee.property.name === "error" && node.arguments.length > 1;
      const bad = node.arguments
        .flatMap(texts)
        .find((text) => /[.!]$/.test(text.trim()) || /\bsuccessfully\b/i.test(text) || /^Please\b/.test(text));
      const unnamed = errorFallback && texts(node.arguments[1]).some((text) => !/^Failed to\b/.test(text));
      if (!bad && !unnamed) return;
      context.report({
        node,
        message:
          'A toast is a phrase: "Ruleset archived", "This export expired: generate a new one", no final period ' +
          'or "!", no "successfully" nor "Please"; an error\'s fallback names what failed ("Failed to remove item").',
      });
    },
  };
}

function createTypographyMarks(context) {
  if (!inClient(context)) return {};
  const check = (node, text) => {
    if (!/\.\.\.(?![\w$({[])|(?<=[A-Za-z0-9]) - (?=[A-Za-z])/.test(text)) return;
    context.report({ node, message: 'An ellipsis is "…" and a dash between words "—": never "..." or " - ".' });
  };
  return {
    JSXText(node) {
      check(node, node.value);
    },
    Literal(node) {
      if (typeof node.value === "string" && node.parent.type !== "ImportDeclaration") check(node, node.value);
    },
    TemplateElement(node) {
      check(node, node.value.cooked ?? "");
    },
    TemplateLiteral(node) {
      if (repoPath(context.filename) === "client/src/lib/truncate.ts") return;
      const cut = node.expressions.some(
        (expression, index) =>
          expression.type === "CallExpression" &&
          ["slice", "substring"].includes(calleeName(expression)) &&
          node.quasis[index + 1]?.value.cooked?.startsWith("…"),
      );
      if (!cut) return;
      context.report({
        node,
        message: 'A text cut short is `truncate(text, length)` (`lib/truncate.ts`), its "…" its own.',
      });
    },
  };
}

/** Whether a label's words are in Title Case: each capitalized, but a small word that isn't first. */
function inTitleCase(text) {
  const words = text
    .trim()
    .split(/\s+/)
    // A die keeps its notation (`d8`, `` `d${hd}` ``)
    .filter((word) => /^[a-z]/i.test(word) && !/^d(\d+|…)$/.test(word));
  return words.every((word, index) => /^[A-Z0-9]/.test(word) || (index > 0 && SMALL_WORDS.has(word.toLowerCase())));
}

/** Whether a text is a label: its element's, or its element's layout's in a labelled one (a title's row, a button's spinner). */
function labelledBy(node) {
  for (let parent = node.parent; parent?.type === "JSXElement"; parent = parent.parent) {
    const name = elementName(parent);
    if (LABELLED.has(name)) return true;
    if (!LABEL_LAYOUT.has(name)) return false;
  }
  return false;
}

/** The texts an expression can hold: a string, a template's (`…` for what it reads), each side of a condition. */
function texts(expression) {
  if (!expression) return [];
  if (expression.type === "ConditionalExpression")
    return [...texts(expression.consequent), ...texts(expression.alternate)];
  if (expression.type === "LogicalExpression") return texts(expression.right);
  const text = writtenText(expression);
  return text === null ? [] : [text];
}

/** Whether a Tooltip names the icon button it wraps: its title is the button's name, not a description. */
function wrapsIconButton(tooltip) {
  if (tooltip.openingElement.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === "describeChild"))
    return false;
  const children = tooltip.children.filter((child) => child.type === "JSXElement");
  const inner =
    children[0] && elementName(children[0]) === "span"
      ? children[0].children.find((c) => c.type === "JSXElement")
      : children[0];
  return !!inner && elementName(inner) === "IconButton";
}

/** What a string or a template says (`…` for what it reads), else null. */
function writtenText(value) {
  if (value?.type === "Literal" && typeof value.value === "string") return value.value;
  if (value?.type === "TemplateLiteral") return value.quasis.map((quasi) => quasi.value.cooked).join("…");
  return null;
}

export default {
  "confirm-wording": { meta: { type: "suggestion" }, create: createConfirmWording },
  "label-case": { meta: { type: "suggestion" }, create: createLabelCase },
  "toast-wording": { meta: { type: "suggestion" }, create: createToastWording },
  "typography-marks": { meta: { type: "suggestion" }, create: createTypographyMarks },
};
