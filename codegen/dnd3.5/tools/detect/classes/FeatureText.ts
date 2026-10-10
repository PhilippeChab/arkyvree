/**
 * A class feature's text, read for what it offers: a pick (its choice language), a pool's options, a list of existing feats to pick
 * from, or feats it's treated as having.
 */

import { normalizeWs } from "@/codegen/core/text/whitespace.ts";

/** Patterns indicating the character makes a selection from a pool */
const CHOICE_PATTERN =
  /\b(choose|chooses|select|selects|picks?|chosen|drawn from|from the following|from those given|from among)\b/i;

/** What makes a pool's option one a character picks more than once. */
const STACKABLE_PATTERNS = [
  /can be selected .* second time/i,
  /can be taken multiple times/i,
  /selected more than one time/i,
  /selected more than once/i,
  /can be selected more than once/i,
  /this ability can be selected more than once/i,
  /changes .* are cumulative/i,
];

function detectStackable(description: string): boolean {
  return STACKABLE_PATTERNS.some((p) => p.test(description));
}

/**
 * A class feature's text (its description, as the caller normalized it), read for what it offers: a choice
 * (`offersChoice`), a pool's options, a list of existing feats to pick from, or feats it's treated as having.
 */
export class FeatureText {
  constructor(readonly text: string) {}

  /** A bonus feat list: "from the following list: Feat1, Feat2, ...". */
  bonusFeatList(): string[] | undefined {
    // Match patterns like "from the following list: X, Y, Z" or "choose one feat from the following list: X, Y, Z"
    const match = this.text.match(/(?:from the following list|from the following feats)[:\s]+(.+?)(?:\.\s|$)/i);
    if (!match) return undefined;

    const listText = match[1];
    // Split on commas, handling parenthetical qualifiers like "Spell Focus (enchantment, necromancy, or transmutation only)"
    const feats: string[] = [];
    let current = "";
    let parenDepth = 0;
    for (const char of listText) {
      if (char === "(") {
        parenDepth++;
      } else if (char === ")") {
        parenDepth--;
      } else if (char === "," && parenDepth === 0) {
        const cleaned = current.replace(/^\s*(?:and|or)\s+/i, "").trim();
        if (cleaned) feats.push(cleaned);
        current = "";
        continue;
      }
      current += char;
    }
    // Last item (may have trailing period or "and" prefix)
    const last = current
      .replace(/^\s*(?:and|or)\s+/i, "")
      .replace(/\.\s*$/, "")
      .trim();
    if (last) feats.push(last);

    return feats.length >= 2 ? feats : undefined;
  }

  /** Whether the text offers a choice: its player picks from a pool. */
  offersChoice(): boolean {
    return CHOICE_PATTERN.test(this.text);
  }

  /** Parse per-level bonus feat choices from description like:
   *  "At 1st level... select either X or Y. At 2nd level... select either A or B."
   *  Returns an array of { level, feats } entries, or undefined if no per-level pattern found. */
  perLevelBonusFeatLists(): { feats: string[]; level: number }[] | undefined {
    // Match "At Xth level" followed by feat choices, capturing up to the next period
    const pattern = /At (\d+)(?:st|nd|rd|th) level[^.]*?(?:select|choose)\s+(?:either\s+)?(.+?)\./gi;
    const results: { feats: string[]; level: number }[] = [];

    let m;
    while ((m = pattern.exec(this.text)) !== null) {
      const level = parseInt(m[1], 10);
      // Strip trailing "as a bonus feat" and similar
      const featText = m[2].replace(/\s+as a bonus feat\s*/i, "").trim();
      // Split on " or " and ", " — handles "X or Y" and "X, Y, or Z"
      const feats = featText
        .split(/,\s*(?:or\s+)?|\s+or\s+/i)
        .map((f) => f.replace(/^\s*(?:and|or)\s+/i, "").trim())
        .filter(Boolean);
      if (feats.length >= 2) results.push({ level, feats });
    }

    return results.length > 0 ? results : undefined;
  }

  /**
   * A pool feature's description, split into its options: "Name (Ex): description text" or "Name: description text",
   * each stackable when its text says so; and its intro, the text before the first.
   */
  poolSubOptions(): { intro: string; options: { description: string; name: string; stackable?: true }[] } | undefined {
    // Match "Name (Ex/Su/Sp):" or "Name:" where Name is title-cased words (may include hyphens, apostrophes)
    const pattern = /(?:^|\.\s+)([A-Z][A-Za-z'-]+(?:\s+[A-Za-z'-]+)*)\s*(?:\((?:Ex|Su|Sp)\)\s*)?:\s*/g;
    const matches: { index: number; matchLength: number; name: string }[] = [];

    let m;
    while ((m = pattern.exec(this.text)) !== null)
      matches.push({ name: m[1], index: m.index, matchLength: m[0].length });

    if (matches.length < 2) return undefined;

    // Extract intro (text before first match)
    const introEnd = matches[0].index;
    const intro = this.text
      .slice(0, introEnd)
      .replace(/\.\s*$/, "")
      .trim();

    const options: { description: string; name: string; stackable?: true }[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].matchLength;
      const end = i + 1 < matches.length ? matches[i + 1].index : this.text.length;
      const desc = normalizeWs(this.text.slice(start, end).replace(/\.\s*$/, ""));
      options.push({ name: matches[i].name, description: desc, ...(detectStackable(desc) ? { stackable: true } : {}) });
    }

    return { intro, options };
  }

  /** Parse "treated as having the X feat" patterns from a description.
   *  Returns feat names if >= 2 found (choice), undefined otherwise.
   *  The >= 2 threshold excludes single auto-grants (samurai, exotic weapon master). */
  treatedAsHavingFeats(): string[] | undefined {
    const pattern = /treated as having the (.+?) feat/gi;
    const feats: string[] = [];
    let m;
    while ((m = pattern.exec(this.text)) !== null) feats.push(m[1]);

    return feats.length >= 2 ? feats : undefined;
  }
}
