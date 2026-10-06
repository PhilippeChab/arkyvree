import type { Property } from "@/database/packages/dnd35/content/customization/types.ts";
import {
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
} from "@/shared/dnd3.5/properties/index.ts";
import { capitalize } from "@/shared/text.ts";

/** What a specific armor's or shield's text says of itself, over its base's: its stats, weight and enhancement. */
export type ArmorStats = { properties: Property[]; weight?: string; enhancement?: number };

/** "This +3 banded mail", "this +1 heavy steel shield", or a shield that "has a +3 enhancement bonus". */
const ENHANCEMENT = [
  /\+(\d)\s+(?:[a-z-]+\s+){0,3}?(?:mail|plate|armor|breastplate|chainmail|shield)\b/i,
  /\ba \+(\d) enhancement bonus\b/,
];

/** A stat the text states ("a maximum Dexterity bonus of +4"), and its value as the property holds it. */
const STATS: [RegExp, string, (match: RegExpMatchArray) => string][] = [
  [/arcane spell failure chance of (\d+)%|(\d+)% arcane spell failure chance/, ITEM_SPELL_FAILURE, (m) => m[1] ?? m[2]],
  [/maximum Dexterity bonus of \+(\d+)/, ARMOR_MAX_DEX, (m) => m[1]],
  [/armor check penalty of [-–](\d+)|[-–](\d+) armor check penalty/, ARMOR_CHECK_PENALTY, (m) => `-${m[1] ?? m[2]}`],
  [/no armor check penalty/, ARMOR_CHECK_PENALTY, () => "0"],
  [/considered (light|medium|heavy) armor/, ARMOR_PROFICIENCY, (m) => capitalize(m[1])],
];

/**
 * A specific armor's or shield's stats as its text gives them. Magic armor is masterwork, and so is adamantine or
 * dragonhide armor, which lessens its check penalty: unless the text gives that penalty, which is then the armor's own.
 */
export function readArmorStats(text: string): ArmorStats {
  const properties = STATS.flatMap(([pattern, type, value]) => {
    const match = text.match(pattern);
    return match ? [{ type, value: value(match) }] : [];
  });
  const enhancementMatch = ENHANCEMENT.map((pattern) => text.match(pattern)).find(Boolean);
  const enhancement = enhancementMatch ? Number(enhancementMatch[1]) : undefined;
  const masterwork = enhancement !== undefined || /\b(?:adamantine|masterwork)\b/i.test(text);
  if (masterwork && !properties.some((property) => property.type === ARMOR_CHECK_PENALTY)) {
    properties.push({ type: ITEM_MASTERWORK, value: "true" });
  }
  const weightMatch = text.match(/weighs (\d+)(½)? pounds/);
  const weight = weightMatch ? `${weightMatch[1]}${weightMatch[2] ? ".5" : ""}` : undefined;
  return { properties, ...(weight && { weight }), ...(enhancement && { enhancement }) };
}
