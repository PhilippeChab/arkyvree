/**
 * `override-keyword`: a class member that implements an abstract member of its base chain says so, `override`, as
 * TypeScript's `noImplicitOverride` makes one that overrides a concrete member: so every override carries the keyword,
 * and `member-order` groups the overrides (what a class gives its base) by it. TypeScript leaves an abstract member's
 * implementation unmarked, so this rule reads the base chain: a class's `extends X` (its module, by its import: a
 * class module is named after its class, `class-file-names`), `extends include(Base, A, B)` (the base and its
 * concerns, `lib/mixins.ts`), and a concern's own base (`Constructor<X>`), through an index's re-exports, each
 * module's abstract members read in its class's body. A base it can't read (a package's) is left to the compiler.
 * `oxlint --fix` writes the keyword (`protected override columnsOf`).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import fs from "node:fs";
import path from "node:path";

import { targetOf } from "./imports.mjs";
import { repoPath, rootOf } from "./paths.mjs";

/** An abstract member's declaration, at a line's start: `protected abstract name(`, `abstract readonly name:`. */
const ABSTRACT_MEMBER =
  /^[ \t]*(?:(?:private|protected|public)\s+)?abstract\s+(?:readonly\s+)?(?:(?:get|set)\s+)?([A-Za-z_$][\w$]*)\s*[(<:?;!]/gm;
/** The abstract members each name reaches, by module and name, once read. */
const abstractsCache = new Map();
/** A member's accessibility, at its start: `override` goes after it. */
const ACCESSIBILITY = /^(?:private|protected|public)\s+/;
/** A module's source, by path, once read. */
const sourceCache = new Map();

/** The abstract members a class's body declares, by name. */
function abstractsIn(body) {
  return new Set([...body.matchAll(ABSTRACT_MEMBER)].map((match) => match[1]));
}

/** The abstract members a class reaches, from its body's and its heritage's (`extends …`) text in its module. */
function abstractsOfClass(root, file, span, seen) {
  const abstracts = abstractsIn(span.body);
  for (const base of heritageNames(span.heritage))
    for (const member of abstractsOfName(root, file, base, seen)) abstracts.add(member);

  return abstracts;
}

/** The abstract members a module's export (`default`, or a name) reaches: its class's own and its bases'. */
function abstractsOfExport(root, file, exported, seen) {
  const source = readSource(root, file);
  if (source === undefined) return new Set();
  if (exported === "default") {
    const name =
      /export\s+default\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(source)?.[1] ??
      /export\s+default\s+([A-Za-z_$][\w$]*)\s*;/.exec(source)?.[1];
    return name ? abstractsOfName(root, file, name, seen) : new Set();
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    for (const specifier of match[1].split(",")) {
      const [imported, local = imported] = specifier
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)
        .map((part) => part.trim());
      const target = targetOf(file, match[2]);
      if (local === exported && target) return abstractsOfExport(root, target, imported, seen);
    }
  }
  return abstractsOfName(root, file, exported, seen);
}

/**
 * The abstract members a name reaches in a module, its class's and its bases' up the chain: a class it declares, a
 * constant holding `include(…)`, a concern it declares, a concern's base (`Constructor<X>`), or what it imports.
 */
function abstractsOfName(root, file, name, seen = new Set()) {
  const key = `${file}#${name}`;
  if (abstractsCache.has(key)) return abstractsCache.get(key);
  if (seen.has(key)) return new Set();
  seen.add(key);
  const abstracts = readAbstracts(root, file, name, seen);
  abstractsCache.set(key, abstracts);
  return abstracts;
}

/** The names a list of `include(…)`'s arguments gives, each without its type arguments. */
function argumentNames(list) {
  return splitTopLevel(list)
    .map((argument) => /^\s*([A-Za-z_$][\w$]*)/.exec(argument)?.[1])
    .filter(Boolean);
}

/** Where a class's body ends: the brace that closes the one at `open`, past strings, templates and comments. */
function closingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === "/" && source[i + 1] === "/") i = endOf(source.indexOf("\n", i), source);
    else if (char === "/" && source[i + 1] === "*") i = endOf(source.indexOf("*/", i) + 1, source);
    else if (char === '"' || char === "'" || char === "`") i = closingQuote(source, i);
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i;
  }
  return source.length;
}

/** Where the parenthesis that opens at `open` closes, past nested ones. */
function closingParen(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) return i;
  }
  return source.length;
}

/** Where a string or a template that opens at `start` closes (a template's `${…}` read through). */
function closingQuote(source, start) {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i;
    else if (quote === "`" && source[i] === "$" && source[i + 1] === "{") i = closingBrace(source, i + 1);
  }
  return source.length;
}

function createOverrideKeyword(context) {
  const root = rootOf(context.filename);
  const file = repoPath(context.filename);
  if (!/\.tsx?$/.test(file)) return {};
  const check = (node) => {
    const names = superNames(node);
    if (names.length === 0) return;
    // What the class's module has now, under `--fix` too
    sourceCache.set(file, context.sourceCode.text);
    const abstracts = new Set(names.flatMap((name) => [...abstractsOfName(root, file, name)]));
    for (const member of node.body.body) {
      const name = memberName(member);
      if (!name || !abstracts.has(name) || member.override || member.static || member.declare) continue;
      if (
        !/^(MethodDefinition|PropertyDefinition|AccessorProperty)$/.test(member.type) ||
        member.kind === "constructor"
      )
        continue;
      const text = context.sourceCode.text.slice(member.start, member.end);
      const at = member.start + (ACCESSIBILITY.exec(text)?.[0].length ?? 0);
      context.report({
        node: member.key,
        message: `\`${name}\` implements an abstract member of its base: it says so, \`override\` (member-order groups a class's overrides).`,
        fix: (fixer) => fixer.insertTextBeforeRange([at, at], "override "),
      });
    }
  };
  return { ClassDeclaration: check, ClassExpression: check };
}

/** An index `indexOf` found, or the text's end when it found none (-1, or 0 past a `+ 1`). */
function endOf(index, source) {
  return index > 0 ? index : source.length;
}

/** A name as a regular expression matches it literally (`$` is an identifier's). */
function escape(name) {
  return name.replace(/\$/g, "\\$");
}

/** A class's span in its module's text: its heritage (`extends …`) and its body, or none when it declares none. */
function findClass(source, name) {
  const match = new RegExp(`(?:^|[\\s;])class\\s+${escape(name)}\\b`).exec(source);
  return match ? spanAt(source, match.index + match[0].length) : undefined;
}

/** The class a concern declares (`function X<B extends Constructor<Y>>(Base: B) { abstract class … }`), and its base. */
function findConcern(source, name) {
  const match = new RegExp(`function\\s+${escape(name)}\\s*<([^>]*(?:>[^(]*)?)\\(`).exec(source);
  if (!match) return undefined;
  const span = spanAt(source, source.indexOf("class", match.index + match[0].length) + "class".length);
  return { base: /Constructor<\s*([A-Za-z_$][\w$]*)/.exec(match[1])?.[1], span };
}

/** The names a class's heritage extends: its base, or `include(…)`'s base and concerns. */
function heritageNames(heritage) {
  const clause = /\bextends\s+([\s\S]*?)(?:\s+implements\b[\s\S]*)?$/.exec(heritage)?.[1];
  if (!clause) return [];
  const call = /^include\s*\(([\s\S]*)\)\s*$/.exec(clause.trim());
  if (call) return argumentNames(call[1]);
  const base = /^([A-Za-z_$][\w$]*)/.exec(clause.trim())?.[1];
  return base ? [base] : [];
}

/** What a module imports as `name`: the module it's from, and the name it's exported by there (`default` for one). */
function importOf(source, name) {
  const pattern = /import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] === name) return { exported: "default", spec: match[3] };
    for (const specifier of (match[2] ?? "").split(",")) {
      const [imported, local = imported] = specifier
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)
        .map((part) => part.trim());
      if (local === name) return { exported: imported, spec: match[3] };
    }
  }
  return undefined;
}

/** A member's name, as its class declares it: none for a computed one or a `#private` one, which overrides nothing. */
function memberName(member) {
  return !member.computed && member.key?.type === "Identifier" ? member.key.name : undefined;
}

/** What a name reaches in a module, by how the module has it: see `abstractsOfName`. */
function readAbstracts(root, file, name, seen) {
  const source = readSource(root, file);
  if (source === undefined) return new Set();
  const span = findClass(source, name);
  if (span) return abstractsOfClass(root, file, span, seen);
  const included = new RegExp(`const\\s+${escape(name)}\\s*=\\s*include\\s*\\(`).exec(source);
  if (included) {
    const open = included.index + included[0].length - 1;
    const names = argumentNames(source.slice(open + 1, closingParen(source, open)));
    return new Set(names.flatMap((base) => [...abstractsOfName(root, file, base, seen)]));
  }
  const concern = findConcern(source, name);
  if (concern) {
    const abstracts = concern.span ? abstractsIn(concern.span.body) : new Set();
    if (concern.base) for (const member of abstractsOfName(root, file, concern.base, seen)) abstracts.add(member);
    return abstracts;
  }
  // A concern's class extends its parameter: what the concern's base (`Constructor<X>`) reaches, the module's own `X`
  // when the parameter shares its name
  const parameter = new RegExp(
    `<[^>]*extends\\s+Constructor<\\s*([A-Za-z_$][\\w$]*)[^(]*\\(\\s*${escape(name)}\\s*:`,
  ).exec(source);
  if (parameter && parameter[1] !== name) return abstractsOfName(root, file, parameter[1], seen);
  const imported = importOf(source, name);
  const target = imported && targetOf(file, imported.spec);
  return target ? abstractsOfExport(root, target, imported.exported, seen) : new Set();
}

/** A module's source, by its path from the repo's root: none for one the repo doesn't have. */
function readSource(root, file) {
  if (!sourceCache.has(file)) {
    const absolute = path.join(root, file);
    sourceCache.set(file, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : undefined);
  }
  return sourceCache.get(file);
}

/** A class's heritage and body, from just past its name: its type parameters skipped, its body's braces matched. */
function spanAt(source, from) {
  let i = from;
  let depth = 0;
  for (; i < source.length; i++) {
    const char = source[i];
    if (char === "<" || char === "(") depth++;
    // An arrow's `=>` closes nothing
    else if ((char === ">" && source[i - 1] !== "=") || char === ")") depth--;
    else if (char === "{" && depth === 0) break;
  }
  const heritage = source.slice(from, i).replace(/^\s*<[\s\S]*?>(?=\s*(?:extends|implements|$))/, "");
  return { body: source.slice(i, closingBrace(source, i) + 1), heritage };
}

/** A list's items at its top level: commas inside `<…>`, `(…)` and `{…}` left alone. */
function splitTopLevel(list) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const char = list[i];
    if ("<({[".includes(char)) {
      depth++;
    } else if (">)}]".includes(char)) {
      depth--;
    } else if (char === "," && depth === 0) {
      items.push(list.slice(start, i));
      start = i + 1;
    }
  }
  items.push(list.slice(start));
  return items.filter((item) => item.trim());
}

/** The names a class extends, read off its node: its base, or `include(…)`'s base and concerns. */
function superNames(node) {
  const superClass = unwrapped(node.superClass);
  if (superClass?.type === "Identifier") return [superClass.name];
  if (superClass?.type !== "CallExpression" || superClass.callee.name !== "include") return [];
  return superClass.arguments
    .map((argument) => unwrapped(argument))
    .filter((argument) => argument.type === "Identifier")
    .map((argument) => argument.name);
}

/** An expression without its type arguments: `X<T>` in `include(X<T>, A)` is `X`. */
function unwrapped(expression) {
  return expression?.type === "TSInstantiationExpression" ? expression.expression : expression;
}

export default {
  "override-keyword": { meta: { type: "suggestion", fixable: "code" }, create: createOverrideKeyword },
};
