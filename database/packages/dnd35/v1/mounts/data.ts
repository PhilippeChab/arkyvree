import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import type { RaceDefinition } from "@/database/packages/dnd35/v1/races/types.ts";

export const SPECIAL_MOUNT_APTITUDE = "Special Mount Bond";
export const SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE = "Special Mount Class Feature";

export const SPECIAL_MOUNT_APTITUDES = [
  SPECIAL_MOUNT_APTITUDE,
  SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE,
];

export const SPECIAL_MOUNT_CLASS_FEATURE_FEATS: FeatSeed[] = [
  {
    name: "Empathic Link (Special Mount)",
    description:
      "The paladin has an empathic link with her mount out to a distance of up to 1 mile. The paladin cannot see through the mount's eyes, but they can communicate emotionally. Note that even intelligent mounts see the world differently from humans, so misunderstandings are always possible. Because of this empathic link, the paladin has the same connection to an item or place that her mount does.",
    selectable: false,
    aptitudes: [SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Share Spells (Special Mount)",
    description:
      "At the paladin's option, she may have any spell (but not any spell-like ability) she casts on herself also affect her mount. The mount must be within 5 feet at the time of casting to receive the benefit. If the spell or effect has a duration other than instantaneous, it stops affecting the mount if it moves farther than 5 feet away and will not affect the mount again even if it returns to the paladin before the duration expires. Additionally, the paladin may cast a spell with a target of 'You' on her mount (as a touch range spell) instead of on herself.",
    selectable: false,
    aptitudes: [SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Share Saving Throws (Special Mount)",
    description:
      "For each of its saving throws, the mount uses either its own base save bonus or the paladin's, whichever is higher. The mount applies its own ability modifiers to saves, and it doesn't share any other bonuses on saves that the master might have.",
    selectable: false,
    aptitudes: [SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Improved Evasion (Special Mount)",
    description:
      "When subjected to an attack that normally allows a Reflex saving throw for half damage, the mount takes no damage if it makes a successful saving throw and only half damage if the saving throw fails.",
    selectable: false,
    aptitudes: [SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Command (Special Mount)",
    description:
      "Once per day per two paladin levels of its master, a mount can use this ability to command other normal animals of approximately the same kind as itself (for warhorses and warponies, this category includes donkeys, mules, and ponies), as long as the target creature has fewer Hit Dice than the mount. This ability functions like the command spell, but the mount must make a DC 21 Concentration check to succeed if it's being ridden at the time. If the check fails, the ability does not function that time, but it still counts against the mount's daily uses. Each target may attempt a Will save (DC 10 + 1/2 paladin's level + paladin's Cha modifier) to negate the effect.",
    selectable: false,
    aptitudes: [SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Spell Resistance (Special Mount)",
    description:
      "The mount's spell resistance equals its master's paladin level + 5. To affect the mount with a spell, another spellcaster must roll the mount's spell resistance or higher on 1d20 + caster level.",
    selectable: false,
    aptitudes: [SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE],
  },
];

const SPECIAL_MOUNT_RACE_NAMES = ["Heavy Warhorse", "Warpony"] as const;

export const SPECIAL_MOUNT_RACE_PICK_FEATS: FeatSeed[] = SPECIAL_MOUNT_RACE_NAMES.map((race) => ({
  name: `${race} Special Mount`,
  description: `Bond with a ${race} as your paladin's special mount. The mount appears on your sheet with stats derived from your paladin level and the ${race} race profile.`,
  selectable: true,
  aptitudes: [SPECIAL_MOUNT_APTITUDE],
  modifiers: [
    {
      target: "bonded.mount.race",
      operator: "set",
      value: race,
      valueType: "string",
    },
  ],
}));

export const SPECIAL_MOUNT_RACES: RaceDefinition[] = [
  {
    name: "Heavy Warhorse",
    description: "A combat-trained heavy warhorse, the standard special mount for a Medium paladin. Tough, fearless, and capable of bearing armored riders into battle.",
    size: "Large",
    baseSpeed: 50,
  },
  {
    name: "Warpony",
    description: "A combat-trained warpony, the standard special mount for a Small paladin. Smaller than a warhorse but trained to fight and bear an armored rider.",
    size: "Medium",
    baseSpeed: 40,
  },
];

export const SPECIAL_MOUNT_CLASS: ClassSeed = {
  name: "Special Mount",
  description:
    "A paladin's special mount, a magical beast bonded to its master at 5th level. The mount's hit points, base attack bonus, and saving throws scale from total Hit Dice; the master's paladin level drives its bonus HD, natural armor, strength, and intelligence progression.",
  hd: 8,
  levels: 20,
  skillPoints: 2,
  kind: "mount",
  bab: "medium",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Listen", "Spot", "Survival", "Swim",
  ],
  classFeatureAptitude: SPECIAL_MOUNT_CLASS_FEATURE_APTITUDE,
  classFeatures: [
    [5, "Empathic Link (Special Mount)"],
    [5, "Share Spells (Special Mount)"],
    [5, "Share Saving Throws (Special Mount)"],
    [5, "Improved Evasion (Special Mount)"],
    [11, "Command (Special Mount)"],
    [15, "Spell Resistance (Special Mount)"],
  ],
};
