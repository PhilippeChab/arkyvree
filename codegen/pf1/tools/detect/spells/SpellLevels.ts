import { CORE_SPELL_LIST_CLASSES } from "@/codegen/pf1/tools/terms/spells.ts";
import { classSpells } from "@/content/pf1/builders/aptitudes/names.ts";

/** A class's level in a level line: its word ("sorcerer", "summoner (unchained)", "sorcerer/wizard") and the level. */
const CLASS_LEVEL = /^(.+?)\s+(\d+)$/;

/**
 * A spell's level line read ("sorcerer 3, wizard 3, magus 3", "sorcerer/wizard 3"): its level on each Core Rulebook
 * class's spell list (`CORE_SPELL_LIST_CLASSES`), by the list's aptitude ("Wizard Spells"). The classes of later books
 * it names are left out (`others`); what it can't read is listed (`unread`).
 */
export class SpellLevels {
  constructor(private readonly line: string) {}

  /** Its classes' levels as written, each a class's word and its level: none for a part it can't read. */
  private parts(): { level?: number; words: string[]; written: string }[] {
    return this.line
      .split(",")
      .map((written) => written.trim())
      .filter(Boolean)
      .map((written) => {
        const [, words, level] = written.match(CLASS_LEVEL) ?? [];
        return words
          ? { level: Number(level), words: words.toLowerCase().split("/"), written }
          : { words: [], written };
      });
  }

  /** Its level on each Core Rulebook class's list, by the list's aptitude: the lowest a list is given, if twice. */
  levels(): Record<string, number> {
    const levels: Record<string, number> = {};
    for (const { level, words } of this.parts()) {
      for (const word of words) {
        const className = CORE_SPELL_LIST_CLASSES[word];
        if (!className || level === undefined) continue;
        const aptitude = classSpells(className);
        levels[aptitude] = Math.min(levels[aptitude] ?? level, level);
      }
    }
    return levels;
  }

  /** The classes it names that the Core Rulebook has none of, by their words ("arcanist", "summoner (unchained)"). */
  others(): string[] {
    return this.parts().flatMap(({ words }) => words.filter((word) => !CORE_SPELL_LIST_CLASSES[word]));
  }

  /** What the line gives that no reading takes: a part with no level, or a line with no Core Rulebook class. */
  unread(): string[] {
    const unparsed = this.parts().filter(({ level }) => level === undefined);
    return [
      ...unparsed.map(({ written }) => `level "${written}"`),
      ...(Object.keys(this.levels()).length === 0 ? [`no Core Rulebook class in level "${this.line}"`] : []),
    ];
  }
}
