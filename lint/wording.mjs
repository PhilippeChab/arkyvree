/**
 * What the client says, said one way (docs/frontend.md):
 *
 * - `label-case`: a label is in Title Case ("Mark All as Read"): a button's, a menu item's, a field's, a dialog's
 *   title and its actions, a tooltip that names an icon button, any element's `aria-label`, any component's
 *   `label` and `title` (but what says a sentence: a chip's value, an empty state's line; an alert's title is a
 *   label), and a page's title (`usePageTitle`).
 * - `toast-wording`: a toast is a phrase ("Ruleset archived"), no final period or "!", no "successfully", no
 *   "Please", never opening on "You have"; an invite is an "invite", never an "invitation"; an error's fallback names
 *   what failed ("Failed to remove item").
 * - `confirm-wording`: a confirmation asks "Are you sure you want to …?", then says what follows; a deletion ends
 *   "This action cannot be undone.", or "You can restore it from Local Changes." for what a fork inherits, each branch
 *   of a message that says either; an archive ends "You can unarchive it at any time from the Archived filter.", the
 *   one way a ruleset, a campaign or a character comes back, or "Only its owner can unarchive it." for who archives
 *   what they don't own (a ruleset's Admin).
 * - `typography-marks`: an ellipsis is "…" and a dash between words "—", never "..." or " - ", a template's
 *   interpolations reading as words (`${pool} - ${level}`); a text cut short is `truncate(text, length)`.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { attributeExpression, calleeName, elementName, inClient, texts, writtenText } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** How an archive's confirmation ends: where the record waits, and that it comes back; or who brings it back */
const ARCHIVE_ENDINGS = [
  "You can unarchive it at any time from the Archived filter.",
  "Only its owner can unarchive it.",
];

/** How a deletion's confirmation ends: for good, or restorable, what a fork inherits (`isRestorableDelete`) */
const DELETE_ENDINGS = ["This action cannot be undone.", "You can restore it from Local Changes."];

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
  /^(ActionMenuItem|AddButton|Button|ChoiceChip|Tab|ToggleButton|DescriptionField|EmailField|FormControlLabel|FormTextField|LinkButton|NameField|OptionToggle|PageActionButton|PasswordField|SelectField|SwitchField|TextField|.*Dialog|Modal)$/;

/** The components whose `label` or `title` is a sentence, not a label: a chip's value, an empty state's */
const SENTENCE_TITLED = /(Chip|^BlankState|^Tooltip)$/;

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
  "per",
  "the",
  "to",
  "vs",
  "with",
]);

function createConfirmWording(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "message") return;
      const element = elementName(node.parent.parent);
      if (element !== "ConfirmDialog" && element !== "DeleteDialog") return;
      const value = attributeExpression(node);
      // A message on a condition is each of its branches
      const branches = value?.type === "ConditionalExpression" ? [value.consequent, value.alternate] : [value];
      const texts = branches.map(writtenText).filter((text) => text !== null);
      const said = (text) =>
        /^Are you sure you want to [^?]+\?/.test(text) &&
        (element !== "DeleteDialog" || DELETE_ENDINGS.some((ending) => text.endsWith(ending))) &&
        (!text.startsWith("Are you sure you want to archive ") ||
          ARCHIVE_ENDINGS.some((ending) => text.endsWith(ending)));
      if (texts.every(said)) return;
      context.report({
        node,
        message:
          'A confirmation asks "Are you sure you want to …?", then says what follows; a deletion ends "This action ' +
          'cannot be undone.", or "You can restore it from Local Changes." for what a fork inherits; an archive ends ' +
          `"${ARCHIVE_ENDINGS[0]}", or "${ARCHIVE_ENDINGS[1]}" for who doesn't own it`,
      });
    },
  };
}

function createLabelCase(context) {
  if (!inClient(context)) return {};
  const report = (node, text) =>
    context.report({
      node,
      message: `A label is in Title Case ("Mark All as Read"): a button's, a menu item's, a field's, a dialog's, a component's \`label\` and \`title\` (not a chip's or an empty state's), an icon button's tooltip, an \`aria-label\`, a page's title: "${text.trim()}".`,
    });
  return {
    CallExpression(node) {
      if (calleeName(node) !== "usePageTitle") return;
      for (const text of texts(node.arguments[0])) if (!inTitleCase(text)) report(node, text);
    },
    JSXText(node) {
      if (labelledBy(node) && /[a-z]/i.test(node.value) && !inTitleCase(node.value)) report(node, node.value);
    },
    JSXAttribute(node) {
      const element = elementName(node.parent.parent) ?? "";
      const name = node.name.name;
      // A component's label or title names what it shows, but a sentence's (a tooltip's describes, unless it names the
      // icon button it wraps)
      const component = /^[A-Z]/.test(element) && !SENTENCE_TITLED.test(element);
      const labels =
        (LABEL_PROPS.has(name) && (LABELLED_BY_PROP.test(element) || component)) || (name === "title" && component);
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
        .find(
          (text) =>
            /[.!]$/.test(text.trim()) ||
            /\b(successfully|please|invitations?)\b/i.test(text) ||
            /^You have\b/.test(text),
        );
      const unnamed = errorFallback && texts(node.arguments[1]).some((text) => !/^Failed to\b/.test(text));
      if (!bad && !unnamed) return;
      context.report({
        node,
        message:
          'A toast is a phrase: "Ruleset archived", "This export expired: generate a new one", no final period ' +
          'or "!", no "successfully" nor "Please", never "You have …"; an invite is an "invite"; an error\'s fallback ' +
          'names what failed ("Failed to remove item").',
      });
    },
  };
}

function createTypographyMarks(context) {
  if (!inClient(context)) return {};
  // `words` is the text with what stands for a word in it, a template's interpolations
  const check = (node, text, words = text) => {
    if (!/\.\.\.(?![\w$({[])/.test(text) && !/(?<=[A-Za-z0-9]) - (?=[A-Za-z])/.test(words)) return;
    context.report({ node, message: 'An ellipsis is "…" and a dash between words "—": never "..." or " - ".' });
  };
  return {
    JSXText(node) {
      check(node, node.value);
    },
    Literal(node) {
      if (typeof node.value === "string" && node.parent.type !== "ImportDeclaration") check(node, node.value);
    },
    TemplateLiteral(node) {
      const quasis = node.quasis.map((quasi) => quasi.value.cooked ?? "");
      // Its text breaks at an interpolation, which reads as a word: `${pool} - ${level}` is a dash between words
      check(node, quasis.join("\n"), quasis.join("x"));
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

export default {
  "confirm-wording": { meta: { type: "suggestion" }, create: createConfirmWording },
  "label-case": { meta: { type: "suggestion" }, create: createLabelCase },
  "toast-wording": { meta: { type: "suggestion" }, create: createToastWording },
  "typography-marks": { meta: { type: "suggestion" }, create: createTypographyMarks },
};
