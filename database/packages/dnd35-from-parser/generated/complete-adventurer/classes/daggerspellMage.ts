import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DAGGERSPELL_MAGE: ClassSeed = {
  name: "Daggerspell Mage",
  description: "Daggerspell mages see the quick movements of their deadly daggers as an attendant part of their spellcasting. These sometimes reclusive ?gures remain spellcasters ?rst and melee combatants second. Daggerspell mages, like their colleagues the daggerspell shapers, seek truth and justice, but they de?ne such concepts in the heat of the moment. Daggerspell mages do not see morality as an absolute, and their ideals are guided by their sense of what is right and fair. Daggerspell mages are closely related to the daggerspell shapers, the other half of the organization known as the Daggerspell Guardians. Both preserve the work of good folk and balance the concerns of civilized communities against the sanctity of nature, but where a shaper is quiet and calculating, a daggerspell mage is wild and impulsive. The two halves of the organization work together amicably, but they have decidedly different approaches to most problems. Almost every daggerspell mage begins his career as a wizard or sorcerer, taking a level or two of rogue after a few successful adventures. Drawn to the exotic ?ghting style and balanced ideas of the Daggerspell Guardian, these individuals enjoy the enigmatic reputation and unorthodox techniques of the guild. Although members of the guild are primarily spellcasters, some follow more complicated multiclass pathways that include ?ghter or paladin levels. These characters follow all precepts of the guild, but they are more likely to defend truth with the sharp points of their daggers than with the arcane power of their spells.",
  hd: 6, levels: 10, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: [
    "Balance",
    "Climb",
    "Concentration",
    "Craft",
    "Handle Animal",
    "Heal",
    "Hide",
    "Jump",
    "Knowledge (Arcana)",
    "Listen",
    "Move Silently",
    "Profession",
    "Ride",
    "Spellcraft",
    "Spot",
    "Survival",
    "Swim",
    "Tumble",
  ],
  requirements: [
    gte("skills.concentration.rank", 8),
    eq("feats.weaponfocusdagger.possessed"),
    eq("feats.twoweaponfighting.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Good"),
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
    ),
    gte("feats.sneakattack.count", 1),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Daggerspell Mage Class Feature",
  classFeatures: [
    [1, "Daggercast (Daggerspell Mage)"],
    [1, "Spells per Day/Spells Known (Daggerspell Mage)"],
    [1, "Weapon and Armor Proficiency (Daggerspell Mage)"],
    [2, "Invocation of the Knife (Daggerspell Mage)"],
    [3, "Sneak Attack (Daggerspell Mage)"],
    [5, "Double Daggercast (Daggerspell Mage)"],
    [6, "Sneak Attack (Daggerspell Mage)"],
    [7, "Arcane Infusion (Daggerspell Mage)"],
    [8, "Arcane Throw (Daggerspell Mage)"],
    [9, "Sneak Attack (Daggerspell Mage)"],
    [10, "Daggerspell Flurry (Daggerspell Mage)"],
  ],
};

// TODO: Unresolved aptitude pick: "Arcane Infusion"
// TODO: No modifiers defined — review if this class needs any
