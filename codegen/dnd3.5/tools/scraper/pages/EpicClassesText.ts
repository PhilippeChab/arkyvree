import { capitalizeTitle } from "@/codegen/dnd3.5/tools/text/names.ts";
import type { EpicClassEntry } from "@/codegen/dnd3.5/tools/types/epicClasses.ts";

/** A class's bonus feat list: "Epic Barbarian Bonus Feat List: Armor Skin, …". */
const BONUS_FEAT_LIST = /^Epic [A-Za-z]+ Bonus Feat List: ?/;

/** Where the page's classes end: its psionic classes, which the app hasn't. */
const END = /^EPIC PSIONIC CLASS PROGRESSIONS$|^FAMILIARS AT EPIC LEVEL$/;

/** A paragraph of a class's feature: its name, then its rule ("Barbarian Rage: The epic barbarian gains…"). */
const FEATURE = /^([A-Z][A-Za-z' ]+?)(?: \((?:Ex|Su|Sp)\))?: (.+)$/;

/** A class's heading: "EPIC BARBARIAN". */
const HEADING = /^EPIC ([A-Z]+)$/;

/** A row of a class's table: its level ("21st"), then its cells. */
const ROW = /^(\d+)(?:st|nd|rd|th)\t?(.*)$/;

/** The lines of a class's block that say nothing of its levels: its hit die, its skill points, its table's title. */
const SKIPPED = /^(?:Hit Die|Skill Points at Each Additional Level):|^Table: /;

/**
 * The SRD's Epic Class Progressions page (`EpicClasses.rtf`), as text (`readRtfText`): each class it continues past 20th
 * level (its core classes, its psionic ones left out), its features' paragraphs, its bonus feat list as written, and its
 * table's Special column by level, each entry as written ("Rage 7/day"), "—" and an empty cell giving none.
 */
export class EpicClassesText {
  constructor(private readonly text: string) {}

  /** A line of a class's block, read into it: its bonus feat list, a feature's paragraph, its table's header or a row. */
  private static add(entry: EpicClassEntry, line: string, table: { special: number }) {
    if (BONUS_FEAT_LIST.test(line)) {
      entry.bonusFeatList = line.replace(BONUS_FEAT_LIST, "").trim();
      return;
    }
    const row = line.match(ROW);
    if (row) {
      const cells = row[2].split("\t");
      entry.table.push({ level: Number(row[1]), special: EpicClassesText.specials(cells[table.special]) });
      return;
    }
    // The table's header names its columns past the level: the Special one is the one read
    if (line.endsWith("\tSpecial")) {
      table.special = line.split("\t").indexOf("Special") - 1;
      return;
    }
    const feature = line.match(FEATURE);
    if (feature && !SKIPPED.test(line)) entry.features.push({ name: feature[1], description: feature[2] });
  }

  /** The entries of a table's Special cell: "Rage 7/day, Trap sense +8, bonus feat" is three. */
  private static specials(cell: string | undefined): string[] {
    if (!cell || cell === "—") return [];
    return cell
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  /** Every class the page continues, in its order. */
  read(): EpicClassEntry[] {
    const classes: EpicClassEntry[] = [];
    let current: EpicClassEntry | undefined;
    const table = { special: 0 };
    for (const line of this.text.split("\n")) {
      if (END.test(line)) break;
      const heading = line.match(HEADING);
      if (heading) {
        current = { name: capitalizeTitle(heading[1]), bonusFeatList: "", features: [], table: [] };
        table.special = 0;
        classes.push(current);
      } else if (current) {
        EpicClassesText.add(current, line, table);
      }
    }
    return classes;
  }
}
