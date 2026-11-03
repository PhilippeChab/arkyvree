import RulesError from "@/engine/core/RulesError.ts";
import type { ImportedCharacter } from "@/engine/rulesets/dnd3.5/imports/imported.ts";

import PcgFormat2 from "./PcgFormat2.ts";
import PcgLine from "./PcgLine.ts";

/**
 * Each format of PCGen's character files a reader reads, by the version its first line names (`PCGVERSION:2.0`): a
 * format that reads differently gets a reader of its own once a file of it needs one.
 */
const READERS = new Map<string, new (lines: PcgLine[]) => { read(): ImportedCharacter }>([["2.0", PcgFormat2]]);

/**
 * A character file PCGen saved (`.pcg`): plain text, one line per thing, its first naming its format
 * (`PCGVERSION:2.0`) and one the PCGen version that saved it (`VERSION:6.09.08`). Read by its format's reader.
 */
export default class PcgenFile {
  constructor(text: string) {
    // A byte order mark an editor saved it with isn't the first line's
    this.lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line, index) => new PcgLine({ number: index + 1, text: line }))
      .filter((line) => line.line.text.trim().length > 0);
  }

  /**
   * What a file PCGen saved says of itself: its format (`PCGVERSION:2.0`), the PCGen version that saved it
   * (`VERSION:6.09.08`), and the game mode its character is of (`GAMEMODE:35e`), when it names one.
   */
  static describe(text: string): { format: string; rules?: string; version: string } {
    // Read as the file's lines are: a byte order mark an editor saved it with isn't its first line's
    const unmarked = text.replace(/^\uFEFF/, "");
    const tagged = (tag: string) => new RegExp(`^${tag}:(.*)$`, "m").exec(unmarked)?.[1]?.trim() ?? "";
    const rules = tagged("GAMEMODE");
    return { format: tagged("PCGVERSION"), version: tagged("VERSION"), ...(rules && { rules }) };
  }

  /**
   * Whether `text` is a file PCGen saved: it opens on its format's line (after a byte order mark an editor saved it
   * with, as its lines are read), and names the PCGen version that saved it.
   */
  static reads(text: string): boolean {
    return text.replace(/^\uFEFF/, "").startsWith("PCGVERSION:") && /^VERSION:/m.test(text);
  }

  /** Whether a format of PCGen's character files (`2.0`) has a reader. */
  static readsFormat(format: string): boolean {
    return READERS.has(format);
  }

  /** The file's lines, those blank left out, each with its number. */
  private readonly lines: PcgLine[];

  /** The character the file holds, read by its format's reader: refused when no reader reads its format. */
  read(): ImportedCharacter {
    const format = this.lines.find((line) => line.tag === "PCGVERSION")?.value.trim() ?? "";
    const Reader = READERS.get(format);
    if (!Reader) throw new RulesError("unprocessable", `PCGen's character file format ${format} isn't read yet`);
    return new Reader(this.lines).read();
  }
}
