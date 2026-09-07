import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Uncanny Trickster Class Feature";

export const UNCANNY_TRICKSTER_FEATS: FeatSeed[] = [
  { name: "Bonus Trick (Uncanny Trickster)", description: "At each level, you gain a bonus skill trick for which you meet the prerequisite. These bonus tricks do not cost skill points and do not count against your maximum number of skill tricks available.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Favorite Trick (Uncanny Trickster)", description: "You have a limited repertoire of signature stunts. At each level, choose one skill trick you know that you can perform only once per encounter. You can now use that trick one additional time per encounter. You can't choose the same skill trick more than once.", stackable: true, selectable: false, aptitudes: [APT], modifiers: [{ target: "aptitudes.uncannytricksterfavoritetrick.allowed", operator: "add", value: "1", valueType: "number" }] },
  { name: "Tricky Defense (Uncanny Trickster)", description: "At 3rd level, you have mastered incorporating tricks into your personal defenses. In any round when you perform a skill trick, you gain a +1 competence bonus on saving throws until the start of your next turn.", selectable: false, aptitudes: [APT] },
];
