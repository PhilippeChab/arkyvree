import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Fortune's Friend Class Feature";

export const FORTUNES_FRIEND_FEATS: FeatSeed[] = [
  { name: "Bonus Luck Feat (Fortune's Friend)", description: "At 2nd and 4th level, you gain a bonus luck feat for which you meet the prerequisite. Complete Scoundrel for a complete list of luck feats.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Easy Luck (Fortune's Friend)", description: "Luck comes to you naturally. The swift or immediate action to use a luck feat does not count against your limit of one swift action per turn. However, you still can't expend a luck reroll more than once per turn to influence the same result.", selectable: false, aptitudes: [APT] },
  { name: "Extra Fortune (Fortune's Friend)", description: "At each odd-numbered level, you gain one extra luck reroll per day. This reroll is in addition to those granted by luck feats.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Fortune's Favorite (Fortune's Friend)", description: "By 3rd level, you have learned to rely on your luck to stay alive. Once per day as an immediate action, you can add your class level as a luck bonus on all saving throws you make until the start of your next turn.", selectable: false, aptitudes: [APT] },
  { name: "Lucky Strike (Fortune's Friend)", description: "Even the greatest warriors, those who train and drill constantly, occasionally win through sheer luck, so why shouldn't you' Beginning at 5th level, once per day as a swift action, you can add your class level as a luck bonus on all attack rolls you make until the start of your next turn.", selectable: false, aptitudes: [APT] },
  { name: "More Luck Than Skill (Fortune's Friend)", description: "Even if you have some talent in a particular area, you still depend on your luck to see you through. Once per day as a swift action, you can add your class level as a luck bonus on all skill checks you make until the start of your next turn.", selectable: false, aptitudes: [APT] },
];
