import type { SourceLine } from "@/engine/core/imports/imported.ts";

/** A tag of a PCGen line and its value: `CLASS:Fighter` is the tag `CLASS` of the value `Fighter`. */
export interface PcgTag {
  tag: string;
  value: string;
}

/** The characters PCGen writes as entities in a value, by the entity (`EntityEncoder`'s). */
const ENTITIES = new Map([
  ["&amp;", "&"],
  ["&colon;", ":"],
  ["&cr;", "\r"],
  ["&lbracket;", "["],
  ["&lf;", "\f"],
  ["&nl;", "\n"],
  ["&pipe;", "|"],
  ["&rbracket;", "]"],
]);

/**
 * A line of a PCGen character file: its tags, `TAG:value` pairs parted by `|`, the first naming what the line holds
 * (`SKILL:Climb|OUTPUTORDER:5|…`). A value in brackets holds tags of its own (`CLASSBOUGHT:[CLASS:Fighter|RANKS:4.0]`),
 * which `nested` reads; a value's escaped characters (`&pipe;`) are decoded once it's split.
 */
export default class PcgLine {
  constructor(readonly line: SourceLine) {
    this.tags = PcgLine.split(line.text);
  }

  /** A value with PCGen's entities decoded. */
  private static decode(value: string) {
    return value.replace(/&[a-z]+;/g, (entity) => ENTITIES.get(entity) ?? entity);
  }

  /** `text` split at each `|` outside brackets into its tags, each split at its first `:`. */
  private static split(text: string): PcgTag[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    // By UTF-16 code unit, as `slice` cuts: a bracket or a `|` is never half of a pair. A bracket opens a value when it
    // opens one (`TAG:[`) or sits in one; PCGen encodes its others, but writes a note as it is, whose `[` holds nothing
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "[" && (depth > 0 || text[index - 1] === ":")) {
        depth++;
      } else if (char === "]" && depth > 0) {
        depth--;
      } else if (char === "|" && depth === 0) {
        parts.push(text.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(text.slice(start));
    return parts
      .filter((part) => part.length > 0)
      .map((part) => {
        const colon = part.indexOf(":");
        if (colon === -1) return { tag: part, value: "" };
        const value = part.slice(colon + 1);
        // A bracketed value keeps its entities until its own tags are split
        return { tag: part.slice(0, colon), value: value.startsWith("[") ? value : PcgLine.decode(value) };
      });
  }

  /** The tags a bracketed value holds (`[CLASS:Fighter|RANKS:4.0]`), none when it holds none. */
  static nested(value: string): PcgTag[] {
    const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
    return inner ? PcgLine.split(inner) : [];
  }

  /** The line's tags, in order: its first names what it holds. */
  readonly tags: PcgTag[];

  /** The value of the line's first tag `tag` past its first (the tag the line is named for), if it has one. */
  find(tag: string): string | undefined {
    return this.tags.slice(1).find((part) => part.tag === tag)?.value;
  }

  /** The values of every tag `tag` of the line, its first too (`LANGUAGE:Common|LANGUAGE:Dwarven`). */
  findAll(tag: string): string[] {
    return this.tags.filter((part) => part.tag === tag).map((part) => part.value);
  }

  /** The tag the line is named for (`SKILL`), which says what it holds. */
  get tag(): string {
    return this.tags[0]?.tag ?? "";
  }

  /** The value of the tag the line is named for (`Climb`). */
  get value(): string {
    return this.tags[0]?.value ?? "";
  }
}
