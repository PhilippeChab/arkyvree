import { ABILITY_SLUGS } from "@/codegen/dnd3.5/tools/terms/abilities.ts";
import { SAVE_SLUGS } from "@/codegen/dnd3.5/tools/terms/saves.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";

import { BonusText } from "./BonusText.ts";
import { ModifierReading } from "./ModifierReading.ts";

/** Thematic item names → ability score (for items that don't use the ability name directly) */
const NAME_ABILITY_ALIAS: Record<string, string> = {
  health: "constitution",
  intellect: "intelligence",
};

/** Name-based patterns: item name → modifier. Specific patterns first, generic last. */
const NAME_MODIFIER_PATTERNS: { pattern: RegExp; toModifiers: (match: RegExpMatchArray) => Modifier[] }[] = [
  // Gauntlets of Ogre Power — +2 Strength (no +N in name, hardcoded)
  {
    pattern: /^Gauntlets of Ogre Power$/i,
    toModifiers: () => [bonus("abilities.strength.misc", "2")],
  },
  // Amulet of Natural Armor +N
  {
    pattern: /Natural Armor\s*\+(\d+)$/i,
    toModifiers: (m) => [bonus("combat.ac.natural", m[1])],
  },
  // Bracers of Armor +N
  {
    pattern: /^Bracers of Armor\s*\+(\d+)$/i,
    toModifiers: (m) => [bonus("combat.ac.armor", m[1])],
  },
  // Cloak of Resistance +N
  {
    pattern: /^Cloak of Resistance\s*\+(\d+)$/i,
    toModifiers: (m) => [bonus("saves.*.misc", m[1])],
  },
  // Protection +N (deflection to AC)
  {
    pattern: /^Protection\s*\+(\d+)$/i,
    toModifiers: (m) => [bonus("combat.ac.deflection", m[1])],
  },
  // Generic ability score items: "Belt of Giant Strength +4", "Amulet of Health +2", etc.
  // Must be LAST — matches any "...Word +N" name, resolves via ability name or alias
  {
    pattern: /(.+?)\s*\+(\d+)$/,
    toModifiers: (m) => {
      const nameWords = m[1].trim().toLowerCase();
      for (const [ability, slug] of Object.entries(ABILITY_SLUGS))
        if (nameWords.endsWith(ability)) return [bonus(`abilities.${slug}.misc`, m[2])];

      for (const [alias, ability] of Object.entries(NAME_ABILITY_ALIAS))
        if (nameWords.endsWith(alias)) return [bonus(`abilities.${ABILITY_SLUGS[ability]}.misc`, m[2])];

      return [];
    },
  },
];

/**
 * A magic item's modifiers, from its name ("Cloak of Resistance +2") and its description, each target once, but the
 * bonuses that apply only sometimes; and the skills it names that aren't skills, and the paths no character has.
 */
export class MagicItemModifiers extends ModifierReading<Modifier> {
  constructor(name: string, description: string) {
    super();
    // Name-based patterns: the first that matches
    for (const { pattern, toModifiers } of NAME_MODIFIER_PATTERNS) {
      const match = name.match(pattern);
      if (match) {
        this.modifiers.push(...toModifiers(match));
        break;
      }
    }

    if (description) this.readDescription(new BonusText(description));
    this.keepValidModifiers();
  }

  /** `value` added to `target`, unless the item already has a modifier of `target` (its name's, say). */
  private add(target: string, value: string) {
    if (!this.modifiers.some((modifier) => modifier.target === target)) this.modifiers.push(bonus(target, value));
  }

  /** The ability score, skill, save and initiative bonuses the item's description gives. */
  private readDescription(text: BonusText) {
    // 1. Ability score bonuses: "+N enhancement bonus to Constitution"
    const enhRegex = new RegExp(
      `\\+(\\d+)\\s+(?:enhancement\\s+)?bonus to (?:her |his |the wearer's )?(${ABILITY_NAMES.join("|")})\\b`,
      "gi",
    );
    for (const match of text.every(enhRegex)) {
      const slug = ABILITY_SLUGS[match[2].toLowerCase()];
      if (slug) this.add(`abilities.${slug}.misc`, match[1]);
    }

    // 2. Skill bonuses: "+N <type> bonus on/to [all] [his/her/wearer's/your] <SkillName> checks"
    for (const skillBonus of text.skillBonuses()) {
      if (skillBonus.slug) this.add(`skills.${skillBonus.slug}.misc`, skillBonus.value);
      else this.unresolved.push(`Unresolved skill: "${text.sentenceAt(skillBonus.index)}"`);
    }

    // 3. Save bonuses: "+N <type> bonus on [all] saving throws"
    const allSavesMatch = text.first(/\+(\d+)\s+\w+\s+bonus on (?:all )?saving throws/i);
    if (allSavesMatch) this.add("saves.*.misc", allSavesMatch[1]);

    // Individual saves: "+N <type> bonus on Fortitude/Reflex/Will saves"
    for (const match of text.every(
      /\+(\d+)\s+\w+\s+bonus (?:on|to) (?:all\s+)?(fortitude|reflex|will)(?:\s+saving)?\s+(?:saves|throws)/gi,
    )) {
      const slug = SAVE_SLUGS[match[2].toLowerCase()];
      if (slug) this.add(`saves.${slug}.misc`, match[1]);
    }

    // 4. Initiative: "+N <type> bonus on/to initiative"
    const initMatch = text.first(/\+(\d+)\s+\w+\s+bonus (?:on|to)\s+initiative/i);
    if (initMatch) this.add("combat.initiative.misc", initMatch[1]);
  }
}
