import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Magical Trickster Class Feature";

export const MAGICAL_TRICKSTER_FEATS: FeatSeed[] = [
  { name: "Bonus Metamagic Feat (Magical Trickster)", description: "At 2nd level, you gain a bonus metamagic feat for which you meet the prerequisite.", selectable: false, aptitudes: [APT] },
  { name: "Bonus Trick (Magical Trickster)", description: "At 1st level, and again at 3rd level, you gain a bonus skill trick for which you meet the prerequisite. These bonus tricks do not cost skill points and do not count against your maximum number of skill tricks available.", stackable: true, selectable: false, aptitudes: [APT] },
  { name: "Metamagic Trick (Magical Trickster)", description: "Beginning at 3rd level, you understand how to apply the principle of tricks to your spellcasting. Once per day you can apply the effect of any one metamagic feat you know to a spell as you cast it without altering the spell's effective level. The spell slot adjustment of the metamagic feat can't exceed four.", selectable: false, aptitudes: [APT] },
  { name: "Spontaneous Trickster (Magical Trickster)", description: "You can channel magical potential into using skill tricks more often, effectively \"recharging\" them. As a swift action, you can \"lose\" any spell slot or prepared spell of 1st level or higher to perform a trick that you have already used in the encounter.", selectable: false, aptitudes: [APT] },
  { name: "Tricky Magic (Magical Trickster)", description: "At 3rd level, you have mastered incorporating tricks into your spellcasting routines. On any round that you perform a skill trick, the save DC of the next spell you cast that round is increased by 1.", selectable: false, aptitudes: [APT] },
];
