import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Eldritch Knight Class Feature";

export const ELDRITCH_KNIGHT_FEATS: FeatSeed[] = [
  { name: "Bonus Feat (Eldritch Knight)", description: "Upon reaching 1st level, the eldritch knight selects one bonus feat from the fighter bonus feat list. This feat is granted on top of the standard feats every character earns at every third level. The eldritch knight must still satisfy all prerequisites for the chosen feat, including the requirement of four fighter levels for Weapon Specialization.", selectable: false, aptitudes: [APT] },
  { name: "Spells per Day (Eldritch Knight)", description: "Beginning at 2nd level, each time the eldritch knight gains a new level in this prestige class, she receives additional spells per day as though she had also advanced one level in an arcane spellcasting class she belonged to prior to taking this class. She gains no other class benefits that the original class would have provided, such as bonus metamagic or item creation feats, bard abilities, assassin abilities, or similar features. In practice, the eldritch knight level is added to the level of her prior arcane spellcasting class to determine her spells per day and caster level. If the character had multiple arcane spellcasting classes before becoming an eldritch knight, she must choose which class receives the benefit each time she gains an eldritch knight level.", selectable: false, aptitudes: [APT] },
  { name: "Weapon and Armor Proficiency (Eldritch Knight)", description: "An eldritch knight does not gain proficiency with any additional weapons or armor upon entering this class.", selectable: false, aptitudes: [APT] },
];
