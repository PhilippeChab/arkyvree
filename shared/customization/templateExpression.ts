/**
 * The template expression syntax of modifier and requirement values, which the server evaluates and both sides read:
 *   [path.to.value]            — a value of the sheet, resolved by the engine
 *   123, -4, 0.5               — number literals
 *   name(arg1, arg2, ...)      — function call (min, max, floor, ceil, abs)
 *   a + b, a - b, a * b, a / b — infix arithmetic with standard precedence
 *   ( expr )                   — grouping
 *
 * Example:
 *   {{ floor([classes.ranger.level] / 2) }}
 *   {{ max(0, [classes.beastmaster.level] + 3) }}
 *   {{ min(max(1, [classes.hexblade.level] - 3), 20) }}
 *
 * A single path reads a value of any type; anything else computes a number from numbers.
 */

type Token =
  | { type: "NUMBER"; value: number }
  | { type: "IDENT"; value: string }
  | { type: "PATH"; value: string }
  | { type: "PUNC"; value: "(" | ")" | "," | "+" | "-" | "*" | "/" };

export type TemplateNode =
  | { type: "number"; value: number }
  | { type: "path"; value: string }
  | { args: TemplateNode[]; name: string; type: "call" }
  | { left: TemplateNode; op: "+" | "-" | "*" | "/"; right: TemplateNode; type: "binop" }
  | { arg: TemplateNode; op: "-"; type: "unary" };

/** The functions a template calls, each on numbers. */
export const TEMPLATE_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
};

/** The first path or function of a compound expression a template can't compute a number with, if any. */
function numericError(node: TemplateNode, readable: ReadonlyMap<string, string>): string | null {
  switch (node.type) {
    case "number":
      return null;
    case "path": {
      const type = readable.get(node.value);
      if (!type) return `${node.value} isn't a path a template can read`;
      return type === "number" ? null : `${node.value} is a ${type}: arithmetic takes numbers`;
    }
    case "call":
      if (!Object.hasOwn(TEMPLATE_FUNCTIONS, node.name)) return `Unknown function "${node.name}"`;
      for (const arg of node.args) {
        const error = numericError(arg, readable);
        if (error) return error;
      }
      return null;
    case "binop":
      return numericError(node.left, readable) ?? numericError(node.right, readable);
    case "unary":
      return numericError(node.arg, readable);
  }
}

class Tokenizer {
  constructor(private readonly src: string) {}

  private pos = 0;

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\n") {
        this.pos++;
        continue;
      }
      if (ch === "[") {
        const end = this.src.indexOf("]", this.pos + 1);
        if (end === -1) throw new Error("Unterminated path: missing ]");
        const inner = this.src.slice(this.pos + 1, end).trim();
        if (inner.length === 0) throw new Error("Empty path expression");
        tokens.push({ type: "PATH", value: inner });
        this.pos = end + 1;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let end = this.pos + 1;
        while (end < this.src.length && /[0-9.]/.test(this.src[end])) end++;
        const literal = this.src.slice(this.pos, end);
        // Reject malformed numerics like "5.5.5" — Number() returns NaN which
        // would slip past the numeric type guard downstream.
        if (!/^[0-9]+(\.[0-9]+)?$/.test(literal)) throw new Error(`Invalid numeric literal: "${literal}"`);

        tokens.push({ type: "NUMBER", value: Number(literal) });
        this.pos = end;
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        let end = this.pos + 1;
        // Identifiers include dots so existing single-path templates like
        // {{ [abilities.charisma.modifier] }} keep working as a bare path.
        while (end < this.src.length && /[a-zA-Z0-9_.]/.test(this.src[end])) end++;
        tokens.push({ type: "IDENT", value: this.src.slice(this.pos, end) });
        this.pos = end;
        continue;
      }
      if (ch === "(" || ch === ")" || ch === "," || ch === "+" || ch === "-" || ch === "*" || ch === "/") {
        tokens.push({ type: "PUNC", value: ch });
        this.pos++;
        continue;
      }
      throw new Error(`Unexpected character: ${ch} at position ${this.pos}`);
    }
    return tokens;
  }
}

class Parser {
  constructor(private readonly tokens: Token[]) {}

  private pos = 0;

  private parseAddSub(): TemplateNode {
    let left = this.parseMulDiv();
    while (this.peekPunc("+") || this.peekPunc("-")) {
      const op = (this.tokens[this.pos++] as { type: "PUNC"; value: "+" | "-" }).value;
      const right = this.parseMulDiv();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  // Pratt-style precedence: + - lowest, * / next, unary - tightest before primary
  private parseExpr(): TemplateNode {
    return this.parseAddSub();
  }

  private parseMulDiv(): TemplateNode {
    let left = this.parseUnary();
    while (this.peekPunc("*") || this.peekPunc("/")) {
      const op = (this.tokens[this.pos++] as { type: "PUNC"; value: "*" | "/" }).value;
      const right = this.parseUnary();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  private parsePrimary(): TemplateNode {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.type === "NUMBER") {
      this.pos++;
      return { type: "number", value: tok.value };
    }
    if (tok.type === "PATH") {
      this.pos++;
      return { type: "path", value: tok.value };
    }
    if (tok.type === "IDENT") {
      this.pos++;
      if (this.peekPunc("(")) {
        this.pos++; // consume (
        const args: TemplateNode[] = [];
        if (!this.peekPunc(")")) {
          args.push(this.parseExpr());
          while (this.peekPunc(",")) {
            this.pos++;
            args.push(this.parseExpr());
          }
        }
        if (!this.peekPunc(")")) throw new Error("Expected )");
        this.pos++;
        return { type: "call", name: tok.value, args };
      }
      // Bare identifier (no parens) is treated as a path. Keeps existing
      // single-path templates like `{{ [abilities.charisma.modifier] }}` working.
      return { type: "path", value: tok.value };
    }
    if (tok.type === "PUNC" && tok.value === "(") {
      this.pos++;
      const node = this.parseExpr();
      if (!this.peekPunc(")")) throw new Error("Expected )");
      this.pos++;
      return node;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  private parseUnary(): TemplateNode {
    if (this.peekPunc("-")) {
      this.pos++;
      return { type: "unary", op: "-", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private peekPunc(c: string): boolean {
    const t = this.tokens[this.pos];
    return !!t && t.type === "PUNC" && t.value === c;
  }

  parse(): TemplateNode {
    const node = this.parseExpr();
    if (this.pos !== this.tokens.length) throw new Error(`Unexpected trailing tokens at ${this.pos}`);
    return node;
  }
}

/** Pull every referenced path out of a template value. Compound expressions
 *  like `{{ floor([classes.ranger.level] / 2) }}` yield each bracketed path;
 *  legacy bare-path values like `{{ x.y.z }}` yield the single path. Used for
 *  write→read chain detection. */
export function extractReferencedPaths(value: string): string[] {
  const inner = extractTemplateExpression(value);
  if (!inner) return [];
  const bracketed: string[] = [];
  inner.replace(/\[([^\]]+)\]/g, (_, group: string) => {
    bracketed.push(group.trim());
    return "";
  });
  if (bracketed.length > 0) return bracketed;
  // No brackets — treat the whole inner as a bare path only if it looks like
  // one. Allow leading `_` to match the tokenizer's IDENT character class.
  return /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(inner) ? [inner] : [];
}

/** Strip the leading `{{` and trailing `}}` and return the inner expression. */
export function extractTemplateExpression(value: string): string | null {
  const match = value.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
  return match?.[1] ?? null;
}

/**
 * The path of a single-path template value, `{{ abilities.charisma.modifier }}` or `{{ [abilities.charisma.modifier] }}`,
 * or null for anything compound (arithmetic, a function call) or not a template.
 */
export function extractTemplatePath(value: string): string | null {
  const inner = extractTemplateExpression(value);
  if (!inner) return null;
  // Strip a single outer pair of brackets.
  const unbracketed = inner.match(/^\[([\s\S]+)\]$/);
  const candidate = (unbracketed ? unbracketed[1] : inner).trim();
  // Only treat as a bare path if it's pure identifier-with-dots — no
  // operators, function calls, brackets, etc.
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(candidate)) return null;
  return candidate;
}

/**
 * What's wrong with a template expression for a value of `targetType`, or null: one it can't parse, a function it
 * doesn't know, a path it can't read (`readable`: the template listing's paths and their types), or a type the value
 * can't take. A single path reads its own type, which must be the target's; anything else computes a number.
 */
export function findTemplateError(
  expression: string,
  readable: ReadonlyMap<string, string>,
  targetType: string,
): string | null {
  const parsed = parseTemplateExpression(expression);
  if ("error" in parsed) return `Failed to parse template "${expression}": ${parsed.error}`;
  const { node } = parsed;
  if (node.type === "path") {
    const type = readable.get(node.value);
    if (!type) return `${node.value} isn't a path a template can read`;
    return type === targetType ? null : `${node.value} is a ${type}, not a ${targetType}`;
  }
  if (targetType !== "number") return `An expression computes a number, not a ${targetType}`;
  return numericError(node, readable);
}

/**
 * True if the modifier value is a template (wrapped in `{{ }}`) with
 * non-empty inner content. Empty `{{ }}` is treated as a no-op so an
 * unfinished form submission doesn't generate compose-time warnings.
 */
export function isTemplateValue(value: string): boolean {
  return value.startsWith("{{") && value.endsWith("}}") && value.slice(2, -2).trim().length > 0;
}

/** A template expression's syntax tree, or why it doesn't parse. */
export function parseTemplateExpression(expression: string): { node: TemplateNode } | { error: string } {
  try {
    return { node: new Parser(new Tokenizer(expression).tokenize()).parse() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
