import { ABILITY_SLUGS, SAVE_SLUGS } from "@/database/packages/dnd35-from-parser/tools/detect/vocabulary.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import { bonus } from "@/database/packages/dnd35/content/customization/modifiers.ts";
import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

import { BonusText } from "./BonusText.ts";
import { ModifierReading } from "./ModifierReading.ts";

/**
 * The modifiers a race gives: its ability adjustments, and the skill and save bonuses its traits' text gives, but those
 * that apply only sometimes ("checks that are related to stone", "saving throws against poison", "…, if…").
 */
export class RaceModifiers extends ModifierReading<Modifier> {
  constructor(entry: RaceReference["raw"][number]) {
    super();
    // 1. Ability adjustments from structured data
    for (const adj of entry.abilityAdjustments) {
      const slug = ABILITY_SLUGS[adj.ability.toLowerCase()];
      if (slug) this.modifiers.push(bonus(`abilities.${slug}.misc`, adj.value));
      else this.unresolved.push(`Unknown ability: "${adj.ability}"`);
    }

    // 2. Detect modifiers from racial trait text
    for (const feature of entry.features) {
      const text = new BonusText(feature.description ? `${feature.name}: ${feature.description}` : feature.name);
      this.readSkillBonuses(text);
      this.readSaveBonuses(text);
    }

    this.keepValidModifiers();
  }

  /** "+N racial bonus on all saving throws", or on one: "+N racial bonus on Fortitude saving throws". */
  private readSaveBonuses(text: BonusText) {
    const add = (save: string, value: string) => this.modifiers.push(bonus(`saves.${save}.misc`, parseInt(value, 10)));

    for (const match of text.every(/\+(\d+)\s+racial\s+bonus\s+on\s+all\s+saving\s+throws/gi))
      for (const save of ["fortitude", "reflex", "will"]) add(save, match[1]);

    for (const match of text.every(/\+(\d+)\s+racial\s+bonus\s+on\s+(\w+)\s+saving\s+throws/gi)) {
      const saveSlug = SAVE_SLUGS[match[2].toLowerCase()];
      if (saveSlug) add(saveSlug, match[1]);
    }
  }

  /** "+N racial bonus on X checks" or "+N racial bonus on X, Y, and Z checks". */
  private readSkillBonuses(text: BonusText) {
    for (const skillBonus of text.skillBonuses()) {
      if (skillBonus.slug) this.modifiers.push(bonus(`skills.${skillBonus.slug}.misc`, skillBonus.value));
      else this.unresolved.push(`Unresolved skill bonus: +${skillBonus.value} on "${skillBonus.name}"`);
    }
  }
}
