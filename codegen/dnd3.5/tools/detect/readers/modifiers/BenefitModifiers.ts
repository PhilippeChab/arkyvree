import { SAVE_SLUGS } from "@/codegen/dnd3.5/tools/vocabulary/saves.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";

import { BonusText } from "./BonusText.ts";
import { ModifierReading } from "./ModifierReading.ts";

/**
 * The modifiers a feat's benefit gives, or a class feature's description: its skill, initiative, hit point, save,
 * natural armor, weapon, critical range, speed and grapple bonuses.
 */
export class BenefitModifiers extends ModifierReading {
  constructor(benefit: string) {
    super();
    if (!benefit) return;
    const text = new BonusText(benefit);
    this.readBonuses(text);
    this.keepValidModifiers();

    // If benefit describes a numeric effect but we got no valid modifiers, it's unresolved
    if (this.modifiers.length === 0 && /\+\d+\s+(?:bonus|penalty|modifier)/i.test(benefit)) {
      const bonusMatch = benefit.match(/\+\d+\s+(?:bonus|penalty|modifier)/i);
      if (bonusMatch) this.unresolved.push(`Unresolved bonus: "${text.sentenceAt(bonusMatch.index!)}"`);
    }
  }

  /** The bonuses the text gives, in turn. */
  private readBonuses(text: BonusText) {
    const benefit = text.text;
    const modifiers = this.modifiers;

    // Skill bonuses: "+N bonus on [all] X checks [and Y checks]", "+N bonus on your X check"
    for (const skillBonus of text.skillBonuses()) {
      if (skillBonus.slug) modifiers.push(bonus(`skills.${skillBonus.slug}.misc`, skillBonus.value));
      else this.unresolved.push(`Unresolved skill: "${text.sentenceAt(skillBonus.index)}"`);
    }

    // Pattern: "+N bonus on initiative checks" or "+N to initiative"
    const initMatch = text.first(/\+(\d+)\s+(?:bonus (?:on|to)\s+)?initiative/i);
    if (initMatch) modifiers.push(bonus("combat.initiative.misc", initMatch[1]));

    // Pattern: "+N hit points" or "gain +N hit points"
    const hpMatch = text.first(/\+(\d+)\s+hit points/i);
    if (hpMatch) modifiers.push(bonus("combat.hp.misc", hpMatch[1]));

    // Pattern: "+N bonus on Fortitude/Reflex/Will saves/saving throws"
    for (const match of text.every(
      /\+(\d+)\s+(?:bonus (?:on|to)\s+)?(?:all\s+)?(fortitude|reflex|will)(?:\s+saving)?\s+(?:saves|throws)/gi,
    )) {
      const slug = SAVE_SLUGS[match[2].toLowerCase()];
      if (slug) modifiers.push(bonus(`saves.${slug}.misc`, match[1]));
    }

    // Pattern: "+N natural armor bonus" or "+N to natural armor"
    const natArmorMatch = benefit.match(/\+(\d+)\s+(?:natural armor|to natural armor)/i);
    if (natArmorMatch) modifiers.push(bonus("combat.ac.natural", natArmorMatch[1]));

    // Pattern: "+N bonus on [all] attack rolls ... using the selected weapon"
    const weaponAttackMatch = benefit.match(
      /\+(\d+)\s+bonus on (?:all\s+)?attack rolls[^.]*(?:using the selected weapon|using \w+)/i,
    );
    if (weaponAttackMatch) modifiers.push(bonus("weapon.tohit.misc", weaponAttackMatch[1]));

    // Pattern: "+N bonus on [all] damage rolls ... using the selected weapon"
    const weaponDamageMatch = benefit.match(
      /\+(\d+)\s+bonus on (?:all\s+)?damage rolls[^.]*(?:using the selected weapon|using \w+)/i,
    );
    if (weaponDamageMatch) modifiers.push(bonus("weapon.damage.misc", weaponDamageMatch[1]));

    // Pattern: "threat range is doubled" (Improved Critical)
    if (/threat range is doubled/i.test(benefit))
      modifiers.push({ target: "weapon.damage.critical.range", operator: "multiply", value: "2", valueType: "number" });

    // Pattern: "+N feet" speed bonus (e.g. "speed is faster... by +10 feet")
    const speedMatch =
      benefit.match(/\+?(\d+)\s*(?:feet|foot|ft\.?)\s*faster\b/i) ?? benefit.match(/\+(\d+)\s*(?:feet|foot|ft\.?)\b/i);
    if (speedMatch && !text.isConditional(speedMatch)) modifiers.push(bonus("combat.speed.misc", speedMatch[1]));

    // Pattern: "+N bonus on grapple checks"
    const grappleMatch = text.first(/\+(\d+)\s+bonus on (?:all\s+)?grapple checks/i);
    if (grappleMatch) modifiers.push(bonus("combat.grapple.misc", grappleMatch[1]));
  }
}
