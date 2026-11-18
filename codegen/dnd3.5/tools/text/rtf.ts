/**
 * The text of a Rich Text Format document (the SRD's own files, as Wizards of the Coast published them): its paragraphs
 * a line each, a table's cells split by tabs, its control words and its destinations (fonts, colors, styles, the
 * document's information) left out.
 */

/** A control word, its parameter and the space that ends it: `\par`, `\fs24 `, `\'92`. */
const CONTROL = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\(.)/i;

/**
 * The groups whose text isn't the document's: a destination, its fonts, colors, styles, information and lists' numbering.
 */
const SKIPPED_GROUP =
  /^\{\\(?:\*|(?:fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|rsidtbl|pict|listtext|pntext|pn|latentstyles)\b)/;

/** The control words that stand for a character, and the one each writes. */
const SYMBOLS: Record<string, string> = {
  bullet: "•",
  emdash: "—",
  endash: "–",
  ldblquote: '"',
  line: "\n",
  lquote: "'",
  par: "\n",
  rdblquote: '"',
  row: "\n",
  rquote: "'",
  tab: "\t",
  cell: "\t",
};

/** What a control word (`match`) writes: a character's, a hex escape's (a Windows-1252 byte), or nothing. */
function controlText(match: RegExpMatchArray): string {
  const [, word, , hex, symbol] = match;
  if (word) return SYMBOLS[word] ?? "";
  if (hex) return new TextDecoder("windows-1252").decode(new Uint8Array([parseInt(hex, 16)]));
  // An escaped brace or backslash is itself, a non-breaking space a space, an optional hyphen nothing
  if (symbol === "~") return " ";
  return symbol === "{" || symbol === "}" || symbol === "\\" ? symbol : "";
}

/** The document's text, as written: its groups walked, the skipped ones left out (`SKIPPED_GROUP`). */
function readText(rtf: string): string {
  const out: string[] = [];
  // The depths of the groups being skipped, innermost last
  const skipping: number[] = [];
  let depth = 0;
  let i = 0;
  while (i < rtf.length) {
    const char = rtf[i];
    if (char === "{") {
      depth++;
      if (skipping.length === 0 && SKIPPED_GROUP.test(rtf.slice(i, i + 24))) skipping.push(depth);
      i++;
    } else if (char === "}") {
      if (skipping.at(-1) === depth) skipping.pop();
      depth--;
      i++;
    } else if (char === "\\") {
      const match = rtf.slice(i, i + 40).match(CONTROL);
      const length = match ? match[0].length : 1;
      if (match && skipping.length === 0) out.push(controlText(match));
      i += length;
    } else {
      // A line break in the file is no break in the text
      if (skipping.length === 0 && char !== "\r" && char !== "\n") out.push(char);
      i++;
    }
  }
  return out.join("");
}

/** A document's text: its lines trimmed, their runs of spaces one, blank lines dropped. */
export function readRtfText(rtf: string): string {
  return readText(rtf)
    .split("\n")
    .map((line) =>
      line
        .split("\t")
        .map((cell) => cell.replace(/ +/g, " ").trim())
        .join("\t")
        .replace(/\t+$/, ""),
    )
    .filter((line) => line.length > 0)
    .join("\n");
}
