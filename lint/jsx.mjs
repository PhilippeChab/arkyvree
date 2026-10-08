/** What the client's rules read of a file's JSX and calls: an element's name, its attributes, where a node sits. */

import { repoPath } from "./paths.mjs";

/** What a JSX attribute holds: its expression, or its string. */
export function attributeExpression(node) {
  return node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
}

/** The name a call goes by: `navigate(…)`'s `navigate`, `form.reset(…)`'s `reset`, else null. */
export function calleeName(node) {
  const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return null;
}

/** The elements a JSX element holds: its own, those of its fragments, and those its conditions show. */
export function childElements(node) {
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
    return branches
      .map((branch) => (branch.type === "ParenthesizedExpression" ? branch.expression : branch))
      .filter((branch) => branch.type === "JSXElement");
  });
}

/** A JSX element's name: `IconButton`, `Dialog`; null for a member (`step.icon`) or a namespaced one. */
export function elementName(node) {
  return node.openingElement.name.type === "JSXIdentifier" ? node.openingElement.name.name : null;
}

/** Whether a JSX element has the attribute `name`. */
export function hasAttribute(node, name) {
  return node.openingElement.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** Whether the linted file is the client's. */
export function inClient(context) {
  return repoPath(context.filename).startsWith("client/src/");
}

/** The nearest JSX element around `node`. */
export function parentElement(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === "JSXElement") return p;
  return null;
}

/** The texts an expression can hold: a string, a template's (`…` for what it reads), each side of a condition. */
export function texts(expression) {
  if (!expression) return [];
  if (expression.type === "ConditionalExpression")
    return [...texts(expression.consequent), ...texts(expression.alternate)];
  if (expression.type === "LogicalExpression") return texts(expression.right);
  const text = writtenText(expression);
  return text === null ? [] : [text];
}

/** What a string or a template says (`…` for what it reads), else null. */
export function writtenText(value) {
  if (value?.type === "Literal" && typeof value.value === "string") return value.value;
  if (value?.type === "TemplateLiteral") return value.quasis.map((quasi) => quasi.value.cooked).join("…");
  return null;
}
