import type { BaseClassDetector } from "@/database/packages/dnd35-from-parser/tools/detect/classes/BaseClassDetector.ts";
import {
  isScalingFeature,
  mergeOrdinalVariants,
} from "@/database/packages/dnd35-from-parser/tools/detect/classes/featureNames.ts";
import {
  CHOICE_PATTERN,
  readTreatedAsHavingFeats,
} from "@/database/packages/dnd35-from-parser/tools/detect/classes/featureText.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type AptitudePick, type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { CREATURE_TYPES } from "@/database/packages/dnd35/data/creatureTypes.ts";
import type { Constructor } from "@/server/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

type CreatureType = (typeof CREATURE_TYPES)[number];

/** A favored enemy feature's text: "+2 bonus on Bluff, Listen, Sense Motive, Spot, and Survival checks". */
const FAVORED_ENEMY_TEXT =
  /\+2\s+(?:bonus\s+on\s+)?Bluff,\s*Listen,\s*Sense Motive,\s*Spot,?\s*and\s*Survival\s+checks/i;

/** Description patterns that indicate gameplay/tactical choices, not character-build picks.
 *  These filter AFTER CHOICE_PATTERN matches — if any match, the feature is skipped.
 *  Keep these narrow: a description can contain both build choices and gameplay language.
 *  Only match when the ENTIRE feature is clearly not a build pick. */
const NON_PICK_DESCRIPTION: RegExp[] = [
  // Bonus feat with alternative: "if he already has the feat, he can choose"
  /already has the feat.{0,20}choose/i,
  // "roll and choose" / "choose the result" / "choose between the two results" — random table picks
  /choose (?:the result|between the two)/i,
  /roll .{0,20}choose/i,
];

/** Features that match CHOICE_PATTERN but aren't character-build picks.
 *  Add new entries here instead of scattering regex blocks in detectAptitudePicks. */
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

/** The creature type a text names, a subtype ("Humanoid (Elf)" for elves) before a type. */
function findCreatureType(text: string): CreatureType | null {
  if (!text) return null;
  const tries: { keyword: string; variant: CreatureType }[] = [];
  for (const t of CREATURE_TYPES) {
    const m = t.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (m) tries.push({ keyword: m[2], variant: t });
  }
  for (const t of CREATURE_TYPES) if (!/\(/.test(t)) tries.push({ keyword: t, variant: t });

  for (const { keyword, variant } of tries)
    if (new RegExp(`\\b${RegExp.escape(keyword)}s?\\b`, "i").test(text)) return variant;

  return null;
}

/** Open creature-type pick — selection language near "favored enemy" / "type of creature". */
function isFavoredEnemyOpenPick(featureName: string, desc: string): boolean {
  if (!/favored enemy/i.test(featureName) && !/favored enemy/i.test(desc)) return false;
  return /(?:select|choose|designate|pick)s?\s+[^.]*?(?:type of creature|favored enemy)/i.test(desc);
}

/** Reading a class's aptitude picks: the features where its player picks from a pool. */
export function AptitudePicks<B extends Constructor<BaseClassDetector>>(Base: B) {
  abstract class WithAptitudePicks extends Base {
    /**
     * The features where the class's player picks from a pool, each an aptitude pick at its levels: an existing
     * aptitude's list it names (fighter bonus feats), favored enemies, or its own ("<class><feature>"); and those that
     * read as a pick but give no aptitude.
     */
    protected aptitudePicks(): { aptitudePicks?: AptitudePick[]; unresolvedAptitudePicks?: string[] } {
      const { classSlug, raw } = this;
      const picks: AptitudePick[] = [];
      const unresolved: string[] = [];

      const aggregated = mergeOrdinalVariants(this.featureOccurrences);

      for (const occ of aggregated) {
        // Find the description for this feature (try exact, then plural/singular variants)
        const desc = this.findFeature(occ.name)?.description;
        if (!desc) continue;

        // Detect references to existing SRD aptitudes (e.g. "from the list of fighter bonus feats")
        // Checked before CHOICE_PATTERN since the phrasing may not match generic choice words
        const existingAptitude = detectExistingAptitudeReference(desc);
        if (existingAptitude) {
          picks.push({ levels: occ.levels, target: existingAptitude });
          continue;
        }

        if (isFavoredEnemyOpenPick(occ.name, desc)) {
          picks.push({ levels: occ.levels, target: "aptitudes.favoredenemy.allowed" });
          continue;
        }

        if (!CHOICE_PATTERN.test(desc)) continue;

        // Filter out features that match CHOICE_PATTERN but aren't character-build picks.
        // This covers scaling abilities, named feat grants, passive combat features, and
        // class abilities whose descriptions incidentally contain choice words.
        if (NON_PICK_FEATURES.some((pattern) => pattern.test(occ.name))) continue;

        // Filter out descriptions where the choice word appears in a gameplay/tactical context
        if (NON_PICK_DESCRIPTION.some((pattern) => pattern.test(desc))) continue;

        // Detect scaling bonuses from raw progression (e.g. "Dodge bonus +1", "+2", "+3")
        if (isScalingFeature(occ.name, raw.progression)) continue;

        // Single-occurrence: check for "treated as having" pattern (ranger combat style)
        if (occ.levels.length < 2) {
          const treatedFeats = readTreatedAsHavingFeats(desc);
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

    /** The favored enemy features locked to a creature type (a gnome giant-slayer's): re-routed to the shared variant. */
    protected lockedFavoredEnemies(): { lockedFavoredEnemies?: ClassReference["detected"]["lockedFavoredEnemies"] } {
      const results: NonNullable<ClassReference["detected"]["lockedFavoredEnemies"]> = [];

      for (const occ of this.featureOccurrences) {
        const desc = this.findFeature(occ.name)?.description;
        if (!desc) continue;
        const normalized = normalizeWs(desc);

        if (!FAVORED_ENEMY_TEXT.test(normalized)) continue;

        const nameMatch = occ.name.match(/\(([^)]+)\)/);
        let lockedType = nameMatch ? findCreatureType(nameMatch[1]) : null;
        if (!lockedType) lockedType = findCreatureType(normalized);
        if (!lockedType) continue;

        results.push({ featureName: occ.name, levels: occ.levels, creatureType: lockedType });
      }

      return results.length > 0 ? { lockedFavoredEnemies: results } : {};
    }
  }
  return WithAptitudePicks;
}
