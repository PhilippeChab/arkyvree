import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const NIGHTCLOAK: ClassSeed = {
  name: "Nightcloak",
  description: "Nightcloaks are the most favored servants of their dark deity, wholly committed to her cause, safeguarding her mysteries, and wielding her corrupted magic.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Heal",
    "Hide",
    "Knowledge (Arcana)",
    "Knowledge (History)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Sense Motive",
    "Spellcraft",
  ],
  requirements: [
    gte("combat.bab", 3),
    gte("skills.bluff.rank", 2),
    gte("skills.hide.rank", 4),
    gte("skills.movesilently.rank", 2),
    gte("skills.perform.rank", 4),
    eq("feats.ironwill.possessed"),
    eq("feats.spellfocusenchantment.possessed"),
    eq("feats.illusion.possessed"),
    eq("feats.ornecro.possessed"),
    gte("spellcasting.divine", 3),
    or(eqStr("identity.beliefs.alignment", "Lawful Evil"), eqStr("identity.beliefs.alignment", "Neutral Evil"), eqStr("identity.beliefs.alignment", "Chaotic Evil")),
    eq("feats.evildomain.possessed"),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Nightcloak Class Feature",
  classFeatures: [
    [1, "Might of Darkness (Nightcloak)"],
    [1, "Spells per Day/Spells Known (Nightcloak)"],
    [1, "Weapon and Armor Proficiency (Nightcloak)"],
    [2, "Eyes of Night (Nightcloak)"],
    [4, "Shadow Talk (Nightcloak)"],
    [5, "True Lies (Nightcloak)"],
    [7, "Grace of the Dark (Nightcloak)"],
    [8, "Minions of Night (Nightcloak)"],
    [10, "Voice of Ineffable Evil (Nightcloak)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
