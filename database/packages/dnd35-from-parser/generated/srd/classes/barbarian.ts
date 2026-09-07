import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const BARBARIAN: ClassSeed = {
  name: "Barbarian",
  description: "Fierce and fearless warriors emerge from untamed wilderness regions across the world. Those in settled lands often label them as savages or berserkers, assuming them capable of nothing but violence and destruction. Yet these so-called barbarians have repeatedly demonstrated their worth as allies through their cunning, tenacity, and sheer determination. Against foes foolish enough to dismiss them, they have shown themselves to be resourceful, relentless, and utterly without mercy. For barbarians, a life of adventure offers the best path to acceptance among civilized peoples. Routine duties like standing guard hold no appeal for them. The perils and unpredictability of the adventuring life, however, suit them perfectly. They might seek out adventure to vanquish despised foes, and they harbor a deep-seated revulsion toward anything they view as unnatural, particularly undead creatures, demons, and devils. The barbarian excels as a combatant. Unlike the fighter, whose martial prowess stems from rigorous training and discipline, the barbarian channels a devastating rage in battle. While consumed by this berserk fury, the barbarian grows stronger and more resilient, better equipped to crush enemies and endure their counterattacks. These episodes of rage are exhausting, limiting the barbarian to only a handful of such explosive outbursts each day, but those few are typically more than enough. The barbarian thrives in the wilderness and possesses remarkable speed on foot.",
  hd: 12, levels: 20, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Climb", "Craft", "Handle Animal", "Intimidate", "Jump", "Listen", "Ride", "Survival", "Swim"],
  requirements: [
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  classFeatureAptitude: "Barbarian Class Feature",
  classFeatures: [
    [1, "Fast Movement (Barbarian)"],
    [1, "Illiteracy (Barbarian)"],
    [1, "Rage (Barbarian)"],
    [1, "Weapon and Armor Proficiency (Barbarian)"],
    [2, "Uncanny Dodge (Barbarian)"],
    [3, "Trap Sense (Barbarian)"],
    [4, "Rage (Barbarian)"],
    [5, "Improved Uncanny Dodge (Barbarian)"],
    [6, "Trap Sense (Barbarian)"],
    [7, "Damage Reduction (Barbarian)"],
    [8, "Rage (Barbarian)"],
    [9, "Trap Sense (Barbarian)"],
    [10, "Damage Reduction (Barbarian)"],
    [11, "Greater Rage (Barbarian)"],
    [12, "Rage (Barbarian)"],
    [12, "Trap Sense (Barbarian)"],
    [13, "Damage Reduction (Barbarian)"],
    [14, "Indomitable Will (Barbarian)"],
    [15, "Trap Sense (Barbarian)"],
    [16, "Damage Reduction (Barbarian)"],
    [16, "Rage (Barbarian)"],
    [17, "Tireless Rage (Barbarian)"],
    [18, "Trap Sense (Barbarian)"],
    [19, "Damage Reduction (Barbarian)"],
    [20, "Mighty Rage (Barbarian)"],
    [20, "Rage (Barbarian)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
