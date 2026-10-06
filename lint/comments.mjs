/**
 * `comment-style`: comments are written one way. A top-level declaration's description is a `/** … *\/` right above it,
 * and a file may open with one describing the file. In code, a comment is `//`, right above or at the end of the line
 * it explains. Nothing else: no comment set apart from what it describes at a file's top (a heading, a banner, an
 * orphan), no separator line (`// -----`, `// ── … ──`), no `/* … *\/`. A tool's directive keeps the tool's syntax (`//
 * oxfmt-ignore`, a disable comment, `@ts-expect-error`), and so does a JSX comment (`{/* … *\/}`), JSX's only kind.
 * `oxlint --fix` writes what it can the right way; a heading and a comment set apart are placed by hand: on what they
 * describe, in the file's opening comment, or gone.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { isToolWritten } from "./paths.mjs";

/** A tool reads it: its syntax is the tool's */
const DIRECTIVE = /^\s*(?:(?:eslint|oxlint)-(?:disable|enable)|@ts-|oxfmt-ignore|prettier-ignore)|^\/ <reference/;
/** A line of rule characters: `-----`, `═══` */
const SEPARATOR = /^\s*[-─━=═*#~_]{3,}\s*$/;
/** A title between rule characters: `── Title ──` */
const DECORATED = /^\s*[-─━=═~_]{2,}\s*(.*?)\s*[-─━=═~_]{2,}\s*$/;
/** The formatter's width, which a doc comment wraps to */
const WIDTH = 120;
const DECLARATIONS = new Set([
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "VariableDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "ExportDefaultDeclaration",
]);

/** Whether a top-level statement declares or exports something: what a `/** … *\/` describes. */
function isDeclaration(statement) {
  if (statement.type === "ExportNamedDeclaration")
    return statement.declaration !== null || statement.specifiers.length > 0;
  return DECLARATIONS.has(statement.type) || statement.type === "ExportAllDeclaration";
}

/** Whether a comment is a doc comment, `/** … *\/`. */
function isDoc(comment) {
  return comment.type === "Block" && comment.value.startsWith("*");
}

function rangeOf(node) {
  return node.range ?? [node.start, node.end];
}

/** Whether a comment is alone on its lines: nothing but spaces before it on its first, after it on its last. */
function isAlone(text, comment) {
  const [start, end] = rangeOf(comment);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  return (
    !/\S/.test(text.slice(lineStart, start)) && !/\S/.test(text.slice(end, lineEnd === -1 ? text.length : lineEnd))
  );
}

/** A comment's words, line by line: a separator's none, a decorated title's title, a block's without its stars. */
function wordsOf(comment) {
  if (comment.type === "Line") {
    if (SEPARATOR.test(comment.value)) return [];
    return [DECORATED.test(comment.value) ? " " + DECORATED.exec(comment.value)[1] : comment.value];
  }
  const lines = comment.value.split("\n").map((line) => line.replace(/^\s*\*? ?/, "").trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.map((line) => " " + line);
}

/**
 * `lines` wrapped to `width`: a paragraph's lines joined and wrapped again, a list item, a table row, a tag or an
 * indented line kept as it is.
 */
function wrap(lines, width) {
  const wrapped = [];
  let words = [];
  const flush = () => {
    let line = "";
    for (const word of words) {
      if (line && line.length + 1 + word.length > width) {
        wrapped.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) wrapped.push(line);
    words = [];
  };
  for (const line of lines) {
    if (line.trim() && !/^(\s|[-*•+|>#@]|\d+[.)]\s)/.test(line)) {
      // A capital after a line that ends no sentence starts a new one: on a line of its own
      if (/^[A-Z]/.test(line) && words.length && !/[a-z0-9.,;:!?—–-]$/.test(words.at(-1))) flush();
      words.push(...line.split(/\s+/).filter(Boolean));
      continue;
    }
    flush();
    wrapped.push(line);
  }
  flush();
  return wrapped;
}

/** A doc comment holding `lines`, at `indent`, wrapped to the formatter's 120 columns. */
function docComment(lines, indent) {
  const kept = wrap(
    lines.map((line) => line.trimEnd().replace(/^ /, "")),
    WIDTH - indent.length - " * ".length,
  );
  while (kept.length && !kept.at(-1).trim()) kept.pop();
  if (kept.length === 1 && indent.length + kept[0].length + "/**  */".length <= WIDTH) return `/** ${kept[0]} */`;
  return ["/**", ...kept.map((line) => (line.trim() ? ` * ${line}` : " *"))].join(`\n${indent}`) + `\n${indent} */`;
}

/** A stack's comments as one doc comment: each comment's words, a blank line between two. */
function mergedDoc(stack, indent) {
  const lines = [];
  for (const comment of stack) {
    const words = wordsOf(comment);
    if (words.length === 0) continue;
    if (lines.length && comment.type === "Block") lines.push("");
    else if (lines.length && stack[stack.indexOf(comment) - 1]?.type === "Block") lines.push("");
    lines.push(...words);
  }
  return docComment(lines, indent);
}

function createCommentStyle(context) {
  // What a tool writes keeps the tool's layout
  if (isToolWritten(context.filename)) return {};
  return {
    Program(program) {
      const text = context.sourceCode.text;
      const statements = program.body;
      const all = context.sourceCode.getAllComments();
      const directives = all.filter((comment) => DIRECTIVE.test(comment.value));
      // A JSX comment, `{/* … */}`, is JSX's only kind
      const isJsx = (comment) => text[rangeOf(comment)[0] - 1] === "{" && text[rangeOf(comment)[1]] === "}";
      // A `#!` line is the shell's
      const comments = all.filter(
        (comment) =>
          (comment.type === "Line" || comment.type === "Block") && !DIRECTIVE.test(comment.value) && !isJsx(comment),
      );
      /** Whether only spaces, a line break at most, and directives sit between `from` and `to`: what's attached. */
      const isAdjacent = (from, to) => {
        let between = text.slice(from, to);
        for (const directive of directives) {
          const [ds, de] = rangeOf(directive);
          if (ds >= from && de <= to) between = between.replace(text.slice(ds, de), "\0");
        }
        // A directive's own line is no gap
        between = between.replace(/\n[ \t]*\0[ \t]*(?=\n)/g, "");
        return !/\n[ \t]*\n/.test(between) && !/\S/.test(between);
      };
      const inside = (comment) =>
        statements.some((st) => rangeOf(st)[0] < rangeOf(comment)[0] && rangeOf(comment)[1] <= rangeOf(st)[1]);
      // At the end of a statement's line: that statement's
      const trailing = (comment) => {
        const previous = statements.findLast((st) => rangeOf(st)[1] <= rangeOf(comment)[0]);
        return previous && !text.slice(rangeOf(previous)[1], rangeOf(comment)[0]).includes("\n");
      };
      const topLevel = comments.filter((comment) => !inside(comment) && !trailing(comment));
      const isHeading = (comment) =>
        comment.type === "Line" && (SEPARATOR.test(comment.value) || DECORATED.test(comment.value));
      // In code: a separator goes, a decorated title is plain words, a block is `//`
      for (const comment of comments) {
        const [s, e] = rangeOf(comment);
        if (topLevel.includes(comment)) continue;
        if (comment.type === "Line" && SEPARATOR.test(comment.value)) {
          const lineStart = text.lastIndexOf("\n", s - 1) + 1;
          context.report({
            node: comment,
            message: "A comment is words: no separator line.",
            fix: isAlone(text, comment) ? (fixer) => fixer.removeRange([lineStart, e + 1]) : undefined,
          });
        } else if (comment.type === "Line" && DECORATED.test(comment.value)) {
          const title = DECORATED.exec(comment.value)[1];
          context.report({
            node: comment,
            message: `A comment is words: \`${title}\`, not decorated.`,
            fix: (fixer) => fixer.replaceTextRange([s, e], `// ${title}`),
          });
        } else if (isAlone(text, comment) && /^[ \t]*\n[ \t]*\n/.test(text.slice(e))) {
          context.report({
            node: comment,
            message: "A comment sits right on the code it explains: none stands apart (a heading, an orphan).",
          });
        } else if (comment.type === "Block" && !isDoc(comment)) {
          const indent = text.slice(text.lastIndexOf("\n", s - 1) + 1, s);
          const lines = wordsOf(comment);
          context.report({
            node: comment,
            message: "A comment in code is `//`, not `/* … */`.",
            fix:
              isAlone(text, comment) && /^\s*$/.test(indent)
                ? (fixer) => fixer.replaceTextRange([s, e], lines.map((l) => `//${l}`).join(`\n${indent}`))
                : undefined,
          });
        }
      }
      // A file's top: comments stacked right on the statement they describe, the file's opening one, or apart
      const stacks = [];
      for (const comment of topLevel) {
        const last = stacks.at(-1)?.at(-1);
        if (last && isAdjacent(rangeOf(last)[1], rangeOf(comment)[0])) stacks.at(-1).push(comment);
        else stacks.push([comment]);
      }
      const firstStatement = statements[0] ? rangeOf(statements[0])[0] : text.length;
      for (const [index, stack] of stacks.entries()) {
        const start = rangeOf(stack[0])[0];
        const end = rangeOf(stack.at(-1))[1];
        const worded = stack.filter((comment) => wordsOf(comment).length > 0);
        if (worded.length === 0) {
          // A run of separators alone: they go
          for (const comment of stack) {
            const lineStart = text.lastIndexOf("\n", rangeOf(comment)[0] - 1) + 1;
            context.report({
              node: comment,
              message: "A comment is words: no separator line.",
              fix: isAlone(text, comment)
                ? (fixer) => fixer.removeRange([lineStart, rangeOf(comment)[1] + 1])
                : undefined,
            });
          }
          continue;
        }
        if (stack.some(isHeading)) {
          // A heading's words aren't what follows it: placed by hand
          context.report({
            node: worded[0],
            message:
              "A file isn't split into sections by headings (`// ── X ──`, a title between `// -----` lines): a " +
              "section of its own is a module of its own, and a comment sits right on what it describes.",
          });
          continue;
        }
        const next = statements.find((st) => rangeOf(st)[0] >= end);
        const attached = next && isAdjacent(end, rangeOf(next)[0]);
        const opening = index === 0 && start < firstStatement;
        const indent = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
        const oneDoc = worded.length === 1 && isDoc(worded[0]);
        if (attached && isDeclaration(next)) {
          if (oneDoc && stack.length === 1) continue;
          context.report({
            node: worded[0],
            message: "A declaration's description is one `/** … */` right above it.",
            fix: (fixer) => fixer.replaceTextRange([start, end], mergedDoc(stack, indent)),
          });
        } else if (opening) {
          if (oneDoc && stack.length === 1 && !attached) continue;
          context.report({
            node: worded[0],
            message: attached
              ? "A file's opening comment stands apart, a blank line under it: on an import, sorting the imports moves it."
              : "A file opens with one `/** … */` describing it.",
            fix: (fixer) => fixer.replaceTextRange([start, end], mergedDoc(stack, indent) + (attached ? "\n" : "")),
          });
        } else if (attached && next.type === "ImportDeclaration") {
          context.report({
            node: worded[0],
            message:
              "A comment among the imports moves when they're sorted: what describes the file opens it, apart from them.",
          });
        } else if (attached) {
          // On a statement: `//`, as in code
          for (const comment of stack) {
            if (comment.type !== "Block") continue;
            const [s, e] = rangeOf(comment);
            context.report({
              node: comment,
              message: isDoc(comment)
                ? "A `/** … */` describes a declaration: on a statement, a comment is `//`."
                : "A comment in code is `//`, not `/* … */`.",
              fix: (fixer) =>
                fixer.replaceTextRange(
                  [s, e],
                  wordsOf(comment)
                    .map((l) => `//${l}`)
                    .join(`\n${indent}`),
                ),
            });
          }
        } else {
          context.report({
            node: worded[0],
            message:
              "A comment sits right on what it describes, or in the file's opening comment: none stands apart (a " +
              "heading, a banner, an orphan).",
          });
        }
      }
    },
  };
}

export default {
  "comment-style": { meta: { type: "suggestion", fixable: "code" }, create: createCommentStyle },
};
