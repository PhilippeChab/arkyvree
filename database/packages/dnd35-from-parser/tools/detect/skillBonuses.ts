import { SKILL_MAP } from "./targets.ts";

/** A skill bonus a text gives: its skill's slug, or none when the name isn't a skill (`name`), and where it was read. */
export type SkillBonus = { value: string; name: string; slug: string | undefined; index: number };

/** A skill's name: capitalized words, a parenthesis allowed ("Knowledge (architecture and engineering)", "Sleight of Hand"). */
const NAME = String.raw`[A-Z][\w'-]*(?:\s+(?:\([^)]*\)|of|the|[A-Z][\w'-]*))*`;
/** Names joined by commas and "and": "Listen, Search, and Spot". */
const LIST = String.raw`${NAME}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)${NAME})*`;

/**
 * "+N [type] bonus on/to [all] [the wearer's/its wearer's/her/his/its/your] X[, Y and Z] check(s)", or one check after
 * another ("Swim checks and Climb checks"). Case matters: a skill's name is capitalized, the words around it aren't.
 */
const SKILL_BONUS = new RegExp(
  String.raw`\+(\d+)\s+(?:([a-z]+)\s+)?bonus (?:on|to) (?:all\s+)?(?:(?:its wearer's|the wearer's|her|his|its|your)\s+)?` +
    String.raw`(${LIST}\s+checks?(?:(?:\s*,\s*|\s+and\s+)${LIST}\s+checks?)*)`,
  "g",
);

/** A list's names: split on commas and "and", but not inside parentheses ("Knowledge (architecture and engineering)"). */
function splitSkillList(list: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") {
      depth++;
    } else if (list[i] === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      const separator = list.slice(i).match(/^(?:\s*,\s*(?:and\s+)?|\s+and\s+)/i);
      if (!separator) continue;
      names.push(list.slice(start, i));
      i += separator[0].length - 1;
      start = i + 1;
    }
  }
  names.push(list.slice(start));
  return names.map((name) => name.trim().replace(/\s+checks?$/i, "")).filter(Boolean);
}

/**
 * The skill bonuses `text` gives, one per skill named, except those `conditional` says apply only sometimes. A size
 * bonus is the creature's size, which the character sheet applies itself, and initiative isn't a skill (its own pattern
 * reads it).
 */
export function readSkillBonuses(text: string, conditional: (match: RegExpExecArray) => boolean): SkillBonus[] {
  const bonuses: SkillBonus[] = [];
  for (const match of text.matchAll(SKILL_BONUS)) {
    if (match[2] === "size" || conditional(match)) continue;
    for (const name of splitSkillList(match[3])) {
      const lower = name.toLowerCase();
      if (lower === "initiative") continue;
      bonuses.push({ value: match[1], name, slug: SKILL_MAP[lower], index: match.index });
    }
  }
  return bonuses;
}
