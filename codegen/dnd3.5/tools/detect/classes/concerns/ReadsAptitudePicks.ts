import type { BaseClassDetector } from "@/codegen/dnd3.5/tools/detect/classes/BaseClassDetector.ts";
import { FeatureText } from "@/codegen/dnd3.5/tools/detect/classes/FeatureText.ts";
import { stripOrdinalPrefix } from "@/codegen/dnd3.5/tools/text/names.ts";
import { type AptitudePick } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Description patterns that indicate gameplay/tactical choices, not character-build picks.
 *  These filter AFTER a feature offers a choice (`FeatureText.offersChoice`) — if any match, the feature is skipped.
 *  Keep these narrow: a description can contain both build choices and gameplay language.
 *  Only match when the ENTIRE feature is clearly not a build pick. */
const NON_PICK_DESCRIPTION: RegExp[] = [
  // Bonus feat with alternative: "if he already has the feat, he can choose"
  /already has the feat.{0,20}choose/i,
  // "roll and choose" / "choose the result" / "choose between the two results" — random table picks
  /choose (?:the result|between the two)/i,
  /roll .{0,20}choose/i,
];

/** Features that offer a choice (`FeatureText.offersChoice`) but aren't character-build picks.
 *  Add new entries here instead of scattering regex blocks in aptitudePicks(). */
const NON_PICK_FEATURES: RegExp[] = [
  // Scaling abilities that increase in power, not choices
  /sneak attack|rage|wild shape|summon|damage reduction|save|trap sense|uncanny dodge|flurry|bonus language/i,
  // Named feats granted as freeFeats
  /^(Skill Focus|Skill Mastery|Precise Shot|Mettle|Catch Weapon|Evasion|Improved Evasion)\b/i,
  // Combat/passive abilities whose descriptions incidentally contain choice words
  /parry|waist|bleed|wound|grapple|intimidat|reckless|combat trap|weapon bond|oath|visage|wings|trackless/i,
  // Class abilities that aren't character-build picks
  /bardic knowledge|unarmed strike|lay on hands|turn or rebuke|weaken spirit|sense element|spirit guide|steal spell|justice blade|brilliant blade|animal companion|^mount$/i,
  // Per-use abilities whose descriptions contain incidental choice words (tactical/gameplay picks)
  /bloodwalk|arcane fist|fist of energy|spin fate|seal fate|combine songs|glyph of warding|spellpool|enhanced accuracy|student of chaos|thrall|effortless change|shapechanger|reflexive change|infinite variety|favored shape/i,
  // Elemental/energy abilities that reference a prior one-time class-entry choice
  /elemental specialty|elemental perfection|energy (?:resistance|immunity)|resistance to energy/i,
];

/** Detect when a class feature references an existing SRD aptitude by name
 *  (e.g. "from the list of fighter bonus feats"). Returns the aptitude target
 *  path or null if no known aptitude is referenced. */
function detectExistingAptitudeReference(desc: string): string | null {
  if (/fighter bonus feat|feats available to fighters?\b|bonus feats allowed to a fighter/i.test(desc))
    return "aptitudes.fighterbonusfeat.allowed";
  return null;
}

/** Open creature-type pick — selection language near "favored enemy" / "type of creature". */
function isFavoredEnemyOpenPick(featureName: string, desc: string): boolean {
  if (!/favored enemy/i.test(featureName) && !/favored enemy/i.test(desc)) return false;
  return /(?:select|choose|designate|pick)s?\s+[^.]*?(?:type of creature|favored enemy)/i.test(desc);
}

/** Merges "1st Foo" / "2nd Foo" occurrences into one entry with combined levels. */
function mergeOrdinalVariants(
  featureOccurrences: { levels: number[]; name: string }[],
): { levels: number[]; name: string }[] {
  const map = new Map<string, { levels: Set<number>; name: string }>();
  for (const occ of featureOccurrences) {
    const base = stripOrdinalPrefix(occ.name);
    const key = base.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      for (const l of occ.levels) existing.levels.add(l);
      if (existing.name !== base && /^\d/.test(existing.name)) existing.name = base;
    } else {
      map.set(key, { name: base, levels: new Set(occ.levels) });
    }
  }
  return Array.from(map.values()).map(({ name, levels }) => ({ name, levels: [...levels].sort((a, b) => a - b) }));
}

/** Reading a class's aptitude picks: the features where its player picks from a pool. */
export function ReadsAptitudePicks<B extends Constructor<BaseClassDetector>>(Base: B) {
  abstract class ReadingAptitudePicks extends Base {
    /**
     * The features where the class's player picks from a pool, each an aptitude pick at its levels: an existing
     * aptitude's list it names (fighter bonus feats), favored enemies, or its own ("<class><feature>"); and those that
     * read as a pick but give no aptitude.
     */
    protected aptitudePicks(): { aptitudePicks?: AptitudePick[]; unresolvedAptitudePicks?: string[] } {
      const { classSlug } = this;
      const picks: AptitudePick[] = [];
      const unresolved: string[] = [];

      const aggregated = mergeOrdinalVariants(this.featureOccurrences);

      for (const occ of aggregated) {
        // Find the description for this feature (try exact, then plural/singular variants)
        const desc = this.findFeature(occ.name)?.description;
        if (!desc) continue;

        // Detect references to existing SRD aptitudes (e.g. "from the list of fighter bonus feats")
        // Checked before offersChoice() since the phrasing may not match generic choice words
        const existingAptitude = detectExistingAptitudeReference(desc);
        if (existingAptitude) {
          picks.push({ levels: occ.levels, target: existingAptitude });
          continue;
        }

        if (isFavoredEnemyOpenPick(occ.name, desc)) {
          picks.push({ levels: occ.levels, target: "aptitudes.favoredenemy.allowed" });
          continue;
        }

        const text = new FeatureText(desc);
        if (!text.offersChoice()) continue;

        // Filter out features that offer a choice but aren't character-build picks.
        // This covers scaling abilities, named feat grants, passive combat features, and
        // class abilities whose descriptions incidentally contain choice words.
        if (NON_PICK_FEATURES.some((pattern) => pattern.test(occ.name))) continue;

        // Filter out descriptions where the choice word appears in a gameplay/tactical context
        if (NON_PICK_DESCRIPTION.some((pattern) => pattern.test(desc))) continue;

        // Detect scaling bonuses from raw progression (e.g. "Dodge bonus +1", "+2", "+3")
        if (this.table.isScaling(occ.name)) continue;

        // Single-occurrence: check for "treated as having" pattern (ranger combat style)
        if (occ.levels.length < 2) {
          const treatedFeats = text.treatedAsHavingFeats();
          if (treatedFeats) {
            const featureSlug = stripSeparators(occ.name);
            picks.push({ levels: occ.levels, target: `aptitudes.${classSlug}${featureSlug}.allowed` });
          } else {
            unresolved.push(occ.name);
          }
          continue;
        }

        const featureSlug = stripSeparators(occ.name);
        if (!featureSlug) {
          unresolved.push(occ.name);
          continue;
        }
        picks.push({
          levels: occ.levels,
          target: `aptitudes.${classSlug}${featureSlug}.allowed`,
        });
      }

      return {
        ...(picks.length > 0 ? { aptitudePicks: picks } : {}),
        ...(unresolved.length > 0 ? { unresolvedAptitudePicks: unresolved } : {}),
      };
    }
  }
  return ReadingAptitudePicks;
}
