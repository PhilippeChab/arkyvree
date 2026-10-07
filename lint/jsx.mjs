/** What the client's rules read of a file's JSX and calls: an element's name, its attributes, where a node sits. */

import { repoPath } from "./paths.mjs";

/** The name a call goes by: `navigate(…)`'s `navigate`, `form.reset(…)`'s `reset`, else null. */
export function calleeName(node) {
  const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return null;
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
