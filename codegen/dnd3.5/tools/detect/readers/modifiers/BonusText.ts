import { SKILL_SLUGS } from "@/codegen/dnd3.5/tools/terms/skills.ts";
import { PART_SEPARATOR } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";

/** A skill bonus a text gives: its skill's slug, or none when the name isn't a skill (`name`), and where it was read. */
export interface SkillBonus {
  index: number;
  name: string;
  slug: string | undefined;
  value: string;
}

/** An effect used rather than had: "expend/spend one use of…", "three times per day", "as a swift action", "for 1 hour". */
const ACTIVATION =
  /\b(?:ex|s)pend\b|\bper day\b|\/day\b|\btimes? a day\b|\bas an? (?:free|swift|immediate|move|standard|full-round) action\b|\bfor (?:\d+|one|a|an) (?:rounds?|minutes?|hours?)\b/i;

/** A word that makes what its sentence grants apply only sometimes: "+2 on saves against poison", "while raging". */
const CONDITION = /\b(?:against|while|whenever|when|during|versus|if|unless|only|as long as)\b|\bvs\./i;

/**
 * What's worn, held or carried, which conditions nothing: an item "when worn", a feat's "if you are wearing light
 * armor and carrying a light load".
 */
const EQUIPPED =
  /\b(?:when|while|if|as long as)\s+(?:(?:it is|you are|they are|she|he|you)\s+)?(?:worn|wears|wearing|placed|donned|held|holds|holding|grasped|carried|carries|carrying|used|activated|wielded|wields|wielding)\b/gi;

/**
 * The level a class feature comes at, which conditions nothing: the feature is granted at that level ("When she attains
 * 6th level, a dervish gains…", "Upon reaching 9th level").
 */
const LEVEL_REACHED =
  /\b(?:when|once|upon|after)\s+(?:(?:she|he|you|they|it|(?:a|an|the)\s+[a-z]+)\s+)?(?:attains?|attaining|reach(?:es|ing)?)\s+\d+(?:st|nd|rd|th)\s+level\b/gi;

/** A skill's name: capitalized words, a parenthesis allowed ("Knowledge (architecture and engineering)", "Sleight of Hand"). */
const NAME = String.raw`[A-Z][\w'-]*(?:\s+(?:\([^)]*\)|of|the|[A-Z][\w'-]*))*`;

/** Names joined by commas and "and": "Listen, Search, and Spot". */
const LIST = String.raw`${NAME}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)${NAME})*`;

/**
 * What narrows a bonus right after it: "Search checks made to notice…", "a bonus that…", "checks related to…", "saves
 * for resisting poison", "checks for 1 hour". Not "for every three levels", which scales it.
 */
const NARROWED =
  /^(?:\s+(?:that|to|made|related|involving)\b|\s+for\s+(?:\w+ing\b|(?:\d+(?:d\d+)?|one|a|an)\s+(?:rounds?|minutes?|hours?|days?)\b)|,?\s+(?:(?:when|while|if|against|versus)\b|vs\.?\s))/i;
/**
 * "+N [type] bonus on/to [all] [the wearer's/its wearer's/her/his/its/your] X[, Y and Z] check(s)", or one check after
 * another ("Swim checks and Climb checks"). Case matters: a skill's name is capitalized, the words around it aren't.
 */
const SKILL_BONUS = new RegExp(
  String.raw`\+(\d+)\s+(?:([a-z]+)\s+)?bonus (?:on|to) (?:all\s+)?(?:(?:its wearer's|the wearer's|her|his|its|your)\s+)?` +
    String.raw`(${LIST}\s+checks?(?:(?:\s*,\s*|\s+and\s+)${LIST}\s+checks?)*)`,
  "g",
);

/** Someone other than the character, whom what the sentence grants goes to: "all allies within 30 feet gain…". */
const SOMEONE_ELSE = /\b(?:all(?:y|ies)|companions?|cohorts?|familiars?|followers?|mounts?)\b/i;

/**
 * Whether the bonus `text` gives from `start` to `end` isn't a permanent modifier of the character: what it falls under
 * (`scopeOf`) names a condition, other than what's worn or held or the level it comes at, an effect used, or someone
 * else it goes to; or what follows the bonus narrows it.
 */
function isConditionalAt(text: string, start: number, end: number): boolean {
  const scope = scopeOf(text, start, end);
  return (
    CONDITION.test(scope.replace(EQUIPPED, "").replace(LEVEL_REACHED, "")) ||
    ACTIVATION.test(scope) ||
    SOMEONE_ELSE.test(scope) ||
    NARROWED.test(text.slice(end).replace(EQUIPPED, ""))
  );
}

/**
 * The skill bonuses `text` gives, one per skill named, except those `conditional` says apply only sometimes. A size
 * bonus is the creature's size, which the character sheet applies itself, and initiative isn't a skill (its own pattern
 * reads it).
 */
function readSkillBonuses(text: string, conditional: (match: RegExpExecArray) => boolean): SkillBonus[] {
  const bonuses: SkillBonus[] = [];
  for (const match of text.matchAll(SKILL_BONUS)) {
    if (match[2] === "size" || conditional(match)) continue;
    for (const name of splitSkillList(match[3])) {
      const lower = name.toLowerCase();
      if (lower === "initiative") continue;
      bonuses.push({ value: match[1], name, slug: SKILL_SLUGS[lower], index: match.index });
    }
  }
  return bonuses;
}

/**
 * What of `text` the bonus from `start` to `end` falls under: its sentence's opening, before any bonus ("While raging,
 * you gain…"), and its own part, up to the sentence's next bonus. Between two bonuses, what comes before the last comma
 * qualifies the first ("+2 on Fortitude saves against poison, and a +1 on Will saves": the poison isn't the Will
 * save's), and what comes after it joins them both ("…, while a dishonorable one gains a +2…": either one).
 */
function scopeOf(text: string, start: number, end: number): string {
  // A period before a capital or the end, or the separator some scraped texts keep between their parts (a race's traits)
  const boundary = new RegExp(String.raw`\.(?=\s+[A-Z]|\s*$|\s*${PART_SEPARATOR})|${PART_SEPARATOR}`, "g");
  let from = 0;
  let to = text.length;
  for (const match of text.matchAll(boundary)) {
    if (match.index < start) {
      from = match.index + 1;
    } else if (match.index >= end) {
      to = match.index;
      break;
    }
  }
  const bonuses = [...text.slice(from, to).matchAll(/\+\d+/g)].map((match) => from + match.index);
  const previous = bonuses.filter((index) => index < start).at(-1);
  const next = bonuses.find((index) => index >= end);
  /** Where the text between two bonuses splits: at its last comma or semicolon, else at its end. */
  const split = (gapStart: number, gapEnd: number) => {
    const gap = text.slice(gapStart, gapEnd);
    const comma = Math.max(gap.lastIndexOf(","), gap.lastIndexOf(";"));
    return comma < 0 ? gapEnd : gapStart + comma;
  };
  const opening = text.slice(from, Math.min(bonuses[0] ?? start, start));
  const joinedBefore = previous === undefined ? "" : text.slice(split(previous, start), start);
  const own = text.slice(start, next === undefined ? to : next);
  return opening + joinedBefore + own;
}

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
 * A text read for the bonuses it gives the character: what a pattern matches in it, but the bonuses that apply only
 * sometimes (`isConditional`: "+2 on saves against poison", "while raging").
 */
export class BonusText {
  constructor(readonly text: string) {}

  /** The bonuses `pattern` (a global one) matches, but those that apply only sometimes. */
  every(pattern: RegExp): RegExpExecArray[] {
    return [...this.text.matchAll(pattern)].filter((match) => !this.isConditional(match));
  }

  /**
   * The first bonus `pattern` matches, unless it applies only sometimes. `pattern` is a non-global one: a global one's
   * `match` gives every match, with no index to check.
   */
  first(pattern: RegExp): RegExpMatchArray | undefined {
    if (pattern.global) throw new Error(`BonusText.first takes a non-global pattern: ${pattern}`);
    const match = this.text.match(pattern);
    return match && !this.isConditional(match) ? match : undefined;
  }

  /** Whether the bonus `match` read applies only sometimes. */
  isConditional(match: RegExpMatchArray): boolean {
    const start = match.index ?? 0;
    return isConditionalAt(this.text, start, start + match[0].length);
  }

  /** The sentence `index` is in: from the period before it to the one after, a period before a capital or the end. */
  sentenceAt(index: number): string {
    const sentenceBoundary = /\.(?:\s+[A-Z]|\s*$)/g;
    let start = 0;
    let end = this.text.length;
    let m: RegExpExecArray | null;
    while ((m = sentenceBoundary.exec(this.text)) !== null) {
      if (m.index < index) {
        start = m.index + 1;
      } else {
        end = m.index;
        break;
      }
    }
    return this.text.slice(start, end).trim();
  }

  /** The skill bonuses the text gives (`readSkillBonuses`), but those that apply only sometimes. */
  skillBonuses(): SkillBonus[] {
    return readSkillBonuses(this.text, (match) => this.isConditional(match));
  }
}
