import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class feature a prerequisite can name, and the families of class features (and the features of their own) it is. */
interface ClassFeature {
  /** Its dice count ("Sneak attack +2d6": two of the family's dice, every class's together). */
  counted?: true;
  families: string[];
  /** The features of one class it is besides its families' (the frenzied berserker's frenzy, which is no rage). */
  feats?: string[];
  pattern: RegExp;
}

/**
 * The class features a prerequisite names, in the order they're looked for: any class's feature of their families, never
 * one class's ("Ability to turn or rebuke undead": a feat of Turn or Rebuke Undead, the cleric's, the paladin's, the
 * warpriest's…).
 */
const CLASS_FEATURES: ClassFeature[] = [
  {
    // "Ability to turn or rebuke creatures", "Able to turn undead", "Turn undead class feature", "rebuke or command undead"
    pattern:
      /\bab(?:le|ility) to (?:turn|rebuke)\b|\b(?:turn|rebuke) (?:or (?:rebuke|command) )?(?:undead|creatures)\b/i,
    families: ["Turn or Rebuke Undead"],
  },
  { pattern: /\bwild ?shape\b/i, families: ["Wild Shape"] },
  { pattern: /\bsneak attack or sudden strike\b/i, families: ["Sneak Attack", "Sudden Strike"], counted: true },
  { pattern: /\bsneak attack\b/i, families: ["Sneak Attack"], counted: true },
  { pattern: /\bsudden strike\b/i, families: ["Sudden Strike"], counted: true },
  { pattern: /\bskirmish\b/i, families: ["Skirmish"], counted: true },
  { pattern: /\brage\b.*\bfrenzy\b|\bfrenzy\b.*\brage\b/i, families: ["Rage"], feats: ["Frenzy (Frenzied Berserker)"] },
  { pattern: /\brage ability\b/i, families: ["Rage"] },
  { pattern: /\bflurry of blows\b/i, families: ["Flurry of Blows"] },
  // "Smite ability": the smites a family groups, smite evil's
  { pattern: /\bsmite\b/i, families: ["Smite Evil"] },
  { pattern: /\bgrace\b/i, families: ["Grace"] },
  // "Ability to acquire a new familiar"
  { pattern: /\bfamiliar\b/i, families: ["Summon Familiar"] },
  { pattern: /\bevasion ability\b/i, families: ["Evasion"] },
  { pattern: /\btrapfinding\b/i, families: ["Trapfinding"] },
  { pattern: /\blay on hands\b/i, families: ["Lay on Hands"] },
  { pattern: /\binspire courage\b/i, families: ["Inspire Courage"] },
];

/**
 * Any class's feature of `family` (`feats.<family>.*.possessed`), or as many of its dice as `dice`, every class's
 * together (`feats.<family>.count`).
 */
function familyRequirement(family: string, dice: number | undefined): RequirementEntry {
  const slug = stripSeparators(family);
  return dice ? gte(`feats.${slug}.count`, dice) : eq(`feats.${slug}.*.possessed`);
}

/** Reading a class feature a prerequisite names ("Ability to turn or rebuke undead", "Sneak attack +2d6") as any class's. */
export function ReadsClassFeatures<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingClassFeatures extends Base {
    /**
     * The first class feature `text` names (`CLASS_FEATURES`), as the requirement it gives: any class's feature of its
     * families, or as many of their dice as it counts ("+2d6" after its name); none when it names none.
     */
    protected classFeatureRequirement(text: string): RequirementEntry | undefined {
      for (const { counted, families, feats = [], pattern } of CLASS_FEATURES) {
        const match = pattern.exec(text);
        if (!match) continue;
        const dice = counted ? /^[^+,;]*?\+(\d+)d\d+/.exec(text.slice(match.index + match[0].length))?.[1] : undefined;
        const requirements = [
          ...families.map((family) => familyRequirement(family, dice ? parseInt(dice, 10) : undefined)),
          ...feats.map((name) => eq(feat(name))),
        ];
        return requirements.length === 1 ? requirements[0] : or(...requirements);
      }
      return undefined;
    }
  }
  return ReadingClassFeatures;
}
