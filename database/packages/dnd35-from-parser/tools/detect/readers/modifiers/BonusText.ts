import { isConditional } from "./conditional.ts";
import { readSkillBonuses, type SkillBonus } from "./skillBonuses.ts";

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
    return isConditional(this.text, start, start + match[0].length);
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
