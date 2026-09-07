import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Maester Class Feature";

export const MAESTER_FEATS: FeatSeed[] = [
  { name: "Bonus Feat (Maester)", description: "At 1st and 5th level, a maester receives a bonus item creation feat. He must meet the prerequisites for this feat.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Identification (Maester)", description: "A maester of 3rd level or higher can determine the magical properties of a magic item by handling it for 1 minute and making a successful Spellcraft check (DC 10 + the item's caster level). The maester can't take 10 on this check, nor can he retry the check (and thus he can't take 20). This ability otherwise functions as the identify spell.", selectable: false, aptitudes: [APT] },
  { name: "Quick Crafting (Maester)", description: "A maester can craft magic items in half the normal time required (one day per 2,000 gp in the item's base price; minimum one day).", selectable: false, aptitudes: [APT] },
  { name: "Spells per Day/Spells Known (Maester)", description: "Beginning at 2nd level, a maester gains new spells per day (and spells known, if applicable) as if he had also gained a level in a spellcasting class to which he belonged before adding the prestige class level. He does not, however, gain any other benefi t a character of that class would have gained. If he had more than one spellcasting class before becoming a maester, he must decide to which class to add each level for the purpose of determining spells per day and spells known.", selectable: false, aptitudes: [APT] },
  { name: "Weapon and Armor Proficiency (Maester)", description: "Maesters gain no proficiency with any weapon or armor.", selectable: false, aptitudes: [APT] },
];
