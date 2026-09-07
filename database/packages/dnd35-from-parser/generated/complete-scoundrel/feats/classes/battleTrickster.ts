import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Battle Trickster Class Feature";

export const BATTLE_TRICKSTER_FEATS: FeatSeed[] = [
  { name: "Bonus Feat (Battle Trickster)", description: "At 2nd level, you gain a bonus feat for which you meet the prerequisite. This feat must be selected from the list of fighter bonus feats.", selectable: false, aptitudes: [APT] },
  { name: "Bonus Trick (Battle Trickster)", description: "At 1st level, and again at 3rd level, you gain a bonus skill trick for which you meet the prerequisite. These bonus tricks do not cost skill points and do not count against your maximum number of skill tricks available.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Tricky Fighting (Battle Trickster)", description: "At 3rd level, you have mastered incorporating skill tricks into your combat routines. In any round when you perform a skill trick, you gain a +1 competence bonus on the next attack roll you make that round.", selectable: false, aptitudes: [APT] },
];
