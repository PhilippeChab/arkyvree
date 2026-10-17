import type { ImportedCharacter } from "@/engine/core/imports/imported.ts";
import RulesError from "@/engine/core/RulesError.ts";

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

  /** The game mode a file PCGen saved names (`GAMEMODE:35e`), if it names one: the rules its character is of. */
  static gameModeOf(text: string): string | undefined {
    return /^GAMEMODE:(.*)$/m.exec(text)?.[1]?.trim() || undefined;
  }

  /** Whether `text` is a file PCGen saved: it opens on its format's line, and names the PCGen version that saved it. */
  static reads(text: string): boolean {
    return text.trimStart().startsWith("PCGVERSION:") && /^VERSION:/m.test(text);
  }

  /** The file's lines, those blank left out, each with its number. */
  private readonly lines: PcgLine[];

  /** The character the file holds, read by its format's reader: refused when no reader reads its format. */
  read(): ImportedCharacter {
    const format = this.lines.find((line) => line.tag === "PCGVERSION")?.value ?? "";
    const Reader = READERS.get(format);
    if (!Reader) throw new RulesError("unprocessable", `PCGen's character file format ${format} isn't read yet`);
    return new Reader(this.lines).read();
  }
}
