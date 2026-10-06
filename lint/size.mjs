/**
 * `function-length`: a function in the server or `shared/` holds at most 80 of its own lines (blank and comment lines
 * aside, its nested functions' lines counted where they're written), so a long one splits into named steps. A concern's
 * wrapper (`function X<B extends Constructor>(Base)`) counts nothing: its class's methods count each.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

const FUNCTIONS = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

export const MAX_OWN_LINES = 80;

function isConcern(fn) {
  return (
    fn.typeParameters?.params[0]?.constraint?.type === "TSTypeReference" &&
    fn.typeParameters.params[0].constraint.typeName.name === "Constructor"
  );
}

/** A function's name, for the message: its own, its variable's, its method's or its property's. */
function nameOf(fn) {
  if (fn.id?.name) return fn.id.name;
  const parent = fn.parent;
  if (parent?.type === "VariableDeclarator") return parent.id.name;
  if (parent?.type === "MethodDefinition" || parent?.type === "Property") return parent.key.name ?? "(anonymous)";
  return "(anonymous)";
}

function createFunctionLength(context) {
  const file = repoPath(context.filename);
  if (!/^(server|shared)\//.test(file) || !file.endsWith(".ts")) return {};
  const text = context.sourceCode.text;
  const lines = text.split("\n");
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const counts = (line) => {
    const t = lines[line].trim();
    return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  };
  // Each open function: the lines of the functions nested in it, which it doesn't count.
  const stack = [];
  const enter = (fn) => stack.push({ fn, nested: [] });
  const exit = (fn) => {
    const { nested } = stack.pop();
    const body = fn.body;
    if (body?.type !== "BlockStatement") return;
    const [first, last] = [lineOf(body.start), lineOf(body.end)];
    // The parent leaves out this one's inner lines: its first and last stay with the line they share.
    stack.at(-1)?.nested.push([first + 1, last - 1]);
    if (isConcern(fn)) return;
    let own = 0;
    for (let line = first; line <= last; line++) {
      if (counts(line) && !nested.some(([a, b]) => line >= a && line <= b)) own++;
    }
    if (own > MAX_OWN_LINES) {
      context.report({
        node: fn.id ?? fn,
        message: `\`${nameOf(fn)}\` holds ${own} of its own lines, more than ${MAX_OWN_LINES}: split it into named steps.`,
      });
    }
  };
  return Object.fromEntries(
    FUNCTIONS.flatMap((type) => [
      [type, enter],
      [`${type}:exit`, exit],
    ]),
  );
}

export default {
  "function-length": { meta: { type: "suggestion" }, create: createFunctionLength },
};
