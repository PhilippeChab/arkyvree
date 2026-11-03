import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class feature a prerequisite can name, and the families of class features (and the features of their own) it is. */
interface ClassFeature {
  /** Each of its families is required ("Bardic knowledge and evasion abilities"), not any one of them. */
  all?: true;
  /** Casting such spells qualifies too ("…or ability to cast detect evil as a divine spell"): any spell of the kind. */
  casting?: "divine";
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
  { pattern: /\bwild empathy\b/i, families: ["Wild Empathy"] },
  {
    pattern: /\bdetect evil\b.*\bability to cast detect evil as a divine spell\b/i,
    families: ["Detect Evil"],
    casting: "divine",
  },
  { pattern: /\bdetect evil\b/i, families: ["Detect Evil"] },
  { pattern: /\bskirmish or sneak attack\b/i, families: ["Skirmish", "Sneak Attack"], counted: true },
  // "Either sneak attack +1d6 or skirmish +1d6"
  { pattern: /\bsneak attack\b[^,;]*\bor skirmish\b/i, families: ["Sneak Attack", "Skirmish"], counted: true },
  { pattern: /\bsneak attack or sudden strike\b/i, families: ["Sneak Attack", "Sudden Strike"], counted: true },
  { pattern: /\bsneak attack\b/i, families: ["Sneak Attack"], counted: true },
  { pattern: /\bsudden strike\b/i, families: ["Sudden Strike"], counted: true },
  { pattern: /\bskirmish\b/i, families: ["Skirmish"], counted: true },
  { pattern: /\brage\b.*\bfrenzy\b|\bfrenzy\b.*\brage\b/i, families: ["Rage"], feats: ["Frenzy (Frenzied Berserker)"] },
  { pattern: /\brage ability\b/i, families: ["Rage"] },
  { pattern: /\bflurry of blows\b/i, families: ["Flurry of Blows"] },
  // "Smite ability": any smite (smite evil, the hunter of the dead's smite undead…), or the Destruction domain's power
  { pattern: /\bsmite ability\b/i, families: ["Smite"], feats: ["Destruction Domain"] },
  // Not a smite of another kind ("Smite good class feature")
  { pattern: /\bsmite evil\b/i, families: ["Smite Evil"] },
  { pattern: /\bgrace\b/i, families: ["Grace"] },
  // "Ability to acquire a new familiar"
  { pattern: /\bfamiliar\b/i, families: ["Summon Familiar"] },
  { pattern: /\bbardic knowledge and evasion\b/i, families: ["Bardic Knowledge", "Evasion"], all: true },
  { pattern: /\bbardic knowledge or lore\b/i, families: ["Bardic Knowledge", "Lore"] },
  { pattern: /\bbardic knowledge\b/i, families: ["Bardic Knowledge"] },
  // Evasion, not improved evasion, which is no evasion
  { pattern: /(?<!improved )\bevasion\b/i, families: ["Evasion"] },
  { pattern: /\btrapfinding\b/i, families: ["Trapfinding"] },
  { pattern: /\blay on hands\b/i, families: ["Lay on Hands"] },
  // "Able to use the inspire courage bardic music ability": inspire courage
  { pattern: /\binspire courage\b/i, families: ["Inspire Courage"] },
  { pattern: /\bbardic music\b/i, families: ["Bardic Music"] },
  { pattern: /\bki power\b/i, families: ["Ki Power"] },
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
     * The first class feature `text` names (`CLASS_FEATURES`), as the requirements it gives: any class's feature of its
     * families (each of them, when it names them all), or as many of their dice as it counts ("+2d6" after its name);
     * none when it names none.
     */
    protected classFeatureRequirements(text: string): RequirementEntry[] {
      for (const { all, casting, counted, families, feats = [], pattern } of CLASS_FEATURES) {
        const match = pattern.exec(text);
        if (!match) continue;
        const dice = counted ? /^[^+,;]*?\+(\d+)d\d+/.exec(text.slice(match.index + match[0].length))?.[1] : undefined;
        const requirements = [
          ...families.map((family) => familyRequirement(family, dice ? parseInt(dice, 10) : undefined)),
          ...feats.map((name) => eq(feat(name))),
          ...(casting ? [gte(`spellcasting.${casting}`, 1)] : []),
        ];
        if (all || requirements.length === 1) return requirements;
        return [or(...requirements)];
      }
      return [];
    }
  }
  return ReadingClassFeatures;
}
