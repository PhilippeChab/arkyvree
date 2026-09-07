/**
 * Template expression parser for modifier values.
 *
 * Syntax:
 *   [path.to.value]            — resolved from holders via traversePathInit
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
 * Returned value type is always `number` after evaluation (paths must resolve
 * to numbers; non-numeric paths throw at evaluation).
 */

import type { Holders, TargetPathsTraverser } from "@/server/rulesets/types.ts";

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
};

type Token =
  | { type: "NUMBER"; value: number }
  | { type: "IDENT"; value: string }
  | { type: "PATH"; value: string }
  | { type: "PUNC"; value: "(" | ")" | "," | "+" | "-" | "*" | "/" };

class Tokenizer {
  private pos = 0;
  constructor(private readonly src: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\n") { this.pos++; continue; }
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
        if (!/^[0-9]+(\.[0-9]+)?$/.test(literal)) {
          throw new Error(`Invalid numeric literal: "${literal}"`);
        }
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

type AstNode =
  | { type: "number"; value: number }
  | { type: "path"; value: string }
  | { type: "call"; name: string; args: AstNode[] }
  | { type: "binop"; op: "+" | "-" | "*" | "/"; left: AstNode; right: AstNode }
  | { type: "unary"; op: "-"; arg: AstNode };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    const node = this.parseExpr();
    if (this.pos !== this.tokens.length) throw new Error(`Unexpected trailing tokens at ${this.pos}`);
    return node;
  }

  // Pratt-style precedence: + - lowest, * / next, unary - tightest before primary
  private parseExpr(): AstNode { return this.parseAddSub(); }

  private parseAddSub(): AstNode {
    let left = this.parseMulDiv();
    while (this.peekPunc("+") || this.peekPunc("-")) {
      const op = (this.tokens[this.pos++] as { type: "PUNC"; value: "+" | "-" }).value;
      const right = this.parseMulDiv();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  private parseMulDiv(): AstNode {
    let left = this.parseUnary();
    while (this.peekPunc("*") || this.peekPunc("/")) {
      const op = (this.tokens[this.pos++] as { type: "PUNC"; value: "*" | "/" }).value;
      const right = this.parseUnary();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    if (this.peekPunc("-")) {
      this.pos++;
      return { type: "unary", op: "-", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.type === "NUMBER") { this.pos++; return { type: "number", value: tok.value }; }
    if (tok.type === "PATH") { this.pos++; return { type: "path", value: tok.value }; }
    if (tok.type === "IDENT") {
      this.pos++;
      if (this.peekPunc("(")) {
        this.pos++; // consume (
        const args: AstNode[] = [];
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

  private peekPunc(c: string): boolean {
    const t = this.tokens[this.pos];
    return !!t && t.type === "PUNC" && t.value === c;
  }
}

/**
 * Parse and evaluate a template expression. Returns the resolved value, or
 * `null` if any path fails to resolve (warning sent via onWarning).
 *
 * A pure single-path expression returns whatever the path resolves to (so
 * existing string/boolean-valued templates keep working). Any compound
 * expression (arithmetic, function calls) requires numeric operands and
 * returns a number.
 */
export function evaluateTemplateExpression(
  expression: string,
  holders: Holders,
  targetPaths: TargetPathsTraverser,
  onWarning?: (warning: string) => void,
): number | string | boolean | null {
  let ast: AstNode;
  try {
    const tokens = new Tokenizer(expression).tokenize();
    ast = new Parser(tokens).parse();
  } catch (e) {
    onWarning?.(`Failed to parse template "${expression}": ${(e as Error).message}`);
    return null;
  }

  const resolvePath = (path: string): number | string | boolean | null => {
    const results = targetPaths.traversePathInit(path, holders);
    if (results.length === 0 || results[0].error) {
      onWarning?.(`Path "${path}" could not be resolved`);
      return null;
    }
    // Wildcard paths expand to multiple results — silently using the first
    // is order-dependent. Refuse to guess and warn instead.
    if (results.length > 1) {
      onWarning?.(`Path "${path}" expanded to ${results.length} results; template expressions don't aggregate wildcards`);
      return null;
    }
    return results[0].data as number | string | boolean | null;
  };

  const evNumeric = (node: AstNode): number | null => {
    switch (node.type) {
      case "number": return node.value;
      case "path": {
        const v = resolvePath(node.value);
        if (typeof v !== "number") {
          onWarning?.(`Path "${node.value}" did not resolve to a number (got ${typeof v})`);
          return null;
        }
        return v;
      }
      case "call": {
        // `Object.hasOwn` ensures we only resolve to deliberately-registered
        // functions and not inherited prototype methods (constructor, valueOf,
        // __proto__, etc.) that would otherwise be reachable via FUNCTIONS[name].
        if (!Object.hasOwn(FUNCTIONS, node.name)) {
          onWarning?.(`Unknown function "${node.name}"`);
          return null;
        }
        const fn = FUNCTIONS[node.name];
        const args: number[] = [];
        for (const a of node.args) {
          const v = evNumeric(a);
          if (v === null) return null;
          args.push(v);
        }
        return fn(...args);
      }
      case "binop": {
        const l = evNumeric(node.left);
        const r = evNumeric(node.right);
        if (l === null || r === null) return null;
        switch (node.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/": return r === 0 ? null : l / r;
        }
        return null;
      }
      case "unary": {
        const a = evNumeric(node.arg);
        return a === null ? null : -a;
      }
    }
  };

  // Pure single-path expression — pass through whatever type the path resolves to.
  if (ast.type === "path") return resolvePath(ast.value);
  return evNumeric(ast);
}

/**
 * True if the modifier value is a template (wrapped in `{{ }}`) with
 * non-empty inner content. Empty `{{ }}` is treated as a no-op so an
 * unfinished form submission doesn't generate compose-time warnings.
 */
export function isTemplateValue(value: string): boolean {
  return value.startsWith("{{") && value.endsWith("}}") && value.slice(2, -2).trim().length > 0;
}

/** Strip the leading `{{` and trailing `}}` and return the inner expression. */
export function extractTemplateExpression(value: string): string | null {
  const match = value.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
  return match?.[1] ?? null;
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
