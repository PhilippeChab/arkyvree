import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Ravager Class Feature";

export const RAVAGER_FEATS: FeatSeed[] = [
  { name: "Aura of Fear (Ravager)", description: "Starting at 2nd level, all enemies within 10 feet of the ravager suffer a -2 morale penalty on saving throws while they remain in range. This ability can be activated a limited number of times per day as indicated by the ravager's level. Each activation persists for a number of rounds equal to 3 + the ravager's Charisma modifier. At 5th level the radius extends to 20 feet, and at 8th level it reaches 30 feet.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Cruelest Cut (Ravager)", description: "At 3rd level, the ravager's intimate knowledge of suffering grants deadly accuracy with melee strikes. Before making a melee attack, the ravager must declare the use of this ability; a missed attack wastes the attempt. On a successful hit, the target takes 1d4 points of Constitution damage in addition to normal weapon damage. The ravager gains one daily use of this ability for every three class levels attained, but can only attempt one cruelest cut per round.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Visage of Terror (Ravager)", description: "At 10th level, once per day as a standard action, the ravager can activate a spell-like ability that functions like phantasmal killer (save DC equals 10 + ravager class level + Charisma modifier). The targeted enemy perceives the ravager as an embodiment of its deepest fear.", selectable: false, aptitudes: [APT] },
  { name: "Weapon and Armor Proficiency (Ravager)", description: "This prestige class does not grant proficiency with any weapons or armor.", selectable: false, aptitudes: [APT] },
];
