import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const UR_PRIEST: ClassSeed = {
  name: "Ur-priest",
  description: "A rare few individuals known as ur-priests have discovered how to channel divine magical energy directly, bypassing the need to worship or petition any deity.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Craft",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.bluff.rank", 6),
    gte("skills.knowledgearcana.rank", 5),
    gte("skills.knowledgereligion.rank", 8),
    gte("skills.knowledgetheplanes.rank", 5),
    gte("skills.spellcraft.rank", 8),
    eq("feats.ironwill.possessed"),
    eq("feats.spellfocusevil.possessed"),
    gte("spellcasting.divine", 1),
    or(eqStr("identity.beliefs.alignment", "Lawful Evil"), eqStr("identity.beliefs.alignment", "Neutral Evil"), eqStr("identity.beliefs.alignment", "Chaotic Evil")),
    gte("saves.fortitude.base", 3),
    gte("saves.will.base", 3),
  ],
  classFeatureAptitude: "Ur-priest Class Feature",
  classFeatures: [
    [1, "Spells per Day (Ur-priest)"],
    [1, "Weapon and Armor Proficiency (Ur-priest)"],
    [2, "Rebuke Undead (Ur-priest)"],
    [4, "Divine Spell Resistance 15 (Ur-priest)"],
    [6, "Siphon Spell Power (Ur-priest)"],
    [8, "Divine Spell Resistance 20 (Ur-priest)"],
    [10, "Steal Spell-like Ability (Ur-priest)"],
  ],
  bonusSpellAbility: "Wisdom",
  casterType: "Divine",
  spells: {
    slug: "ur-priestspells",
    perDay: [
      [4, 2],
      [5, 3, 0],
      [5, 3, 1, 0],
      [6, 3, 2, 1, 0],
      [6, 3, 3, 2, 1, 0],
      [6, 3, 3, 3, 2, 1, 0],
      [6, 4, 3, 3, 3, 2, 1, 0],
      [6, 4, 4, 3, 3, 3, 2, 1, 0],
      [6, 5, 4, 4, 4, 4, 3, 2, 1, 0],
      [6, 5, 5, 4, 4, 4, 4, 3, 2, 1],
    ],
    knowAll: true,
  },
};

// TODO: No modifiers defined — review if this class needs any
