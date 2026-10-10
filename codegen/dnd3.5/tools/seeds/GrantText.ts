/** What a feat or a class feature grants by itself: a bonded creature and its level, uncanny dodge's AC, the feats its text names. */

import { NUMBER_WORDS } from "@/codegen/dnd3.5/tools/vocabulary/numbers.ts";
import { bonus, setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";

const COMPANION_GRANT_PATTERNS: {
  aptitudeSlug: string;
  bondedKind: string;
  pattern: RegExp;
}[] = [
  { pattern: /^Summon Familiar \((.+)\)$/, aptitudeSlug: "familiarbond", bondedKind: "familiar" },
  { pattern: /^Animal Companion \((.+)\)$/, aptitudeSlug: "animalcompanionbond", bondedKind: "animalcompanion" },
  { pattern: /^Special Mount \((.+)\)$/, aptitudeSlug: "specialmountbond", bondedKind: "mount" },
];

/**
 * Extract the bonded-level contribution formula from a grant feat's SRD
 * description. The formula encodes how this class contributes to the
 * bonded creature's effective level.
 *
 *   "half his ranger level"              → floor(level / 2)
 *   "class level + N" / "level plus N"   → max(0, level + N)
 *   "N levels lower" / "N levels higher" → max(0, level ± N)
 *
 * Falls back to the 1:1 default (`[classes.<slug>.level]`) when no
 * pattern matches. Detection lets us avoid maintaining a hardcoded
 * per-feat override list — the SRD prose IS the spec.
 */
function bondedLevelFormula(description: string, classSlug: string): string {
  const base = `[classes.${classSlug}.level]`;

  // "half ... level" (Ranger)
  if (/\bhalf\b[\w\s'.]*?\blevel\b/i.test(description)) return `floor(${base} / 2)`;

  // "level + N" / "level plus N" (Beastmaster)
  const plusMatch = description.match(/\blevel\s*(?:\+|plus)\s*(\d+)/i);
  if (plusMatch) return `max(0, ${base} + ${plusMatch[1]})`;

  const higherMatch = description.match(/(\d+|\w+)\s+levels?\s+higher/i);
  if (higherMatch) {
    const n = parseInt(higherMatch[1], 10) || NUMBER_WORDS[higherMatch[1].toLowerCase()];
    if (n) return `max(0, ${base} + ${n})`;
  }

  // "N levels lower" (Hexblade)
  const lowerMatch = description.match(/(\d+|\w+)\s+levels?\s+lower/i);
  if (lowerMatch) {
    const n = parseInt(lowerMatch[1], 10) || NUMBER_WORDS[lowerMatch[1].toLowerCase()];
    if (n) return `max(0, ${base} - ${n})`;
  }
  const minusMatch = description.match(/\blevel\s*(?:-|minus)\s*(\d+)/i);
  if (minusMatch) return `max(0, ${base} - ${minusMatch[1]})`;

  return base;
}

/**
 * A feat or a class feature, by its name and its text (its description), read for what it grants by itself: a bonded
 * creature and its level (`companionModifiers`), the feats its text names (`grantedFeatNames`), uncanny dodge's AC.
 */
export class GrantText {
  constructor(
    readonly name: string,
    readonly text = "",
  ) {}

  /**
   * Every class-feature feat matching one of these patterns emits two
   * modifiers: the aptitude grant so the picker UI unlocks, and a template
   * modifier on `bonded.<kind>.level` that adds the granting class's level
   * contribution. Stacking happens for free because each grant feat
   * independently adds to the same `bonded.<kind>.level` accumulator.
   *
   * The bonded-level formula is auto-detected from the SRD description via
   * `bondedLevelFormula`. Defaults to 1:1 when no pattern matches.
   */
  companionModifiers(): ModifierSeed[] {
    const modifiers: ModifierSeed[] = [];
    for (const { pattern, aptitudeSlug, bondedKind } of COMPANION_GRANT_PATTERNS) {
      const match = this.name.match(pattern);
      if (!match) continue;
      const className = match[1];
      const classSlug = className.toLowerCase().replace(/\s+/g, "");
      const formula = bondedLevelFormula(this.text, classSlug);

      modifiers.push(
        bonus(`aptitudes.${aptitudeSlug}.allowed`, 1),
        bonus(`bonded.${bondedKind}.level`, `{{ ${formula} }}`),
      );
    }
    return modifiers;
  }

  /** Extract feat names from "gains/receives X as a [bonus] feat" patterns.
   *  Only matches definite grants, not choices ("may select") or parameterized refs. */
  grantedFeatNames(): string[] {
    const pattern = /(?:gains?|receives?|gets?)\s+(?:the\s+)?(.+?)\s+as a (?:bonus )?feat\b/gi;
    const names: string[] = [];
    let m;
    while ((m = pattern.exec(this.text)) !== null) {
      const raw = m[1].trim();
      if (/\b(?:either|or|select|choose)\b/i.test(raw)) continue;
      if (/\b(?:for|corresponding|appropriate|related)\b/i.test(raw)) continue;
      const featName = raw
        .replace(/[,(]?\s*see page \d+\)?/gi, "")
        .replace(/\s+feat$/i, "")
        .trim();
      if (featName) names.push(featName);
    }
    return names;
  }

  /**
   * Uncanny dodge, a class feature of many classes (Barbarian, Rogue, Assassin…): the character keeps its Dexterity
   * bonus to AC, and its dodge bonuses, when flat-footed. Improved uncanny dodge is flanking, no part of AC.
   */
  uncannyDodgeModifiers(): ModifierSeed[] {
    return /^Uncanny Dodge\b/.test(this.name) ? [setFlag("combat.ac.uncannydodge")] : [];
  }
}
