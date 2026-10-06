import { formatWithArticle } from "@/database/packages/dnd35/content/bonds/articles.ts";
import type { BondContent } from "@/database/packages/dnd35/content/bonds/types.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import { grantFeat } from "@/database/packages/dnd35/content/customization/modifiers.ts";
import { gte, lt } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { RaceDefinition } from "@/database/packages/dnd35/content/races/types.ts";
import { QUADRUPED } from "@/database/packages/dnd35/data/bonds/raceProperties.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

const ANIMAL_COMPANION_APTITUDE = "Animal Companion Bond";
const ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE = "Animal Companion Class Feature";
const BONDED_RACE_FEATURE_APTITUDE = "Bonded Race Feature";

const ANIMAL_COMPANION_APTITUDES = [
  ANIMAL_COMPANION_APTITUDE,
  ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE,
  BONDED_RACE_FEATURE_APTITUDE,
];

const ANIMAL_COMPANION_CLASS: ClassSeed = {
  name: "Animal Companion",
  description:
    "A creature of the wild bonded to its master. The companion's hit points, base attack bonus, and saving throws are derived from the master; its class progression grants special bonds and abilities as the master grows in power.",
  hd: 8,
  levels: 20,
  skillPoints: 2,
  kind: "animalcompanion",
  bab: "medium",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: ["Listen", "Spot", "Survival", "Swim"],
  classFeatureAptitude: ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE,
  classFeatures: [
    [1, "Link (Animal Companion)"],
    [1, "Share Spells (Animal Companion)"],
    [3, "Evasion (Animal Companion)"],
    [6, "Devotion (Animal Companion)"],
    [9, "Multiattack (Animal Companion)"],
    [15, "Improved Evasion (Animal Companion)"],
  ],
};

const ANIMAL_COMPANION_CLASS_FEATURE_FEATS: FeatSeed[] = [
  {
    name: "Link (Animal Companion)",
    description:
      "The master can handle the animal companion as a free action, or push it as a move action, even without ranks in Handle Animal. The master gains a +4 circumstance bonus on all wild empathy checks and Handle Animal checks made regarding the animal companion.",
    selectable: false,
    aptitudes: [ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Share Spells (Animal Companion)",
    description:
      "At the master's option, any spell (but not spell-like ability) cast on themselves may also affect the animal companion, provided the companion is within 5 feet at the time of casting. The master may also cast spells with a target of 'You' on the companion as a touch range spell.",
    selectable: false,
    aptitudes: [ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Evasion (Animal Companion)",
    description:
      "If the animal companion is subjected to an attack that normally allows a Reflex save for half damage, it takes no damage on a successful save.",
    selectable: false,
    aptitudes: [ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
    // Like every class's Evasion (`CLASS_FEAT_FAMILIES`, dnd35-from-parser/tools/buildSeeds/classes.ts)
    properties: [{ type: FEAT_FAMILY, value: "Evasion" }],
  },
  {
    name: "Devotion (Animal Companion)",
    description:
      "The animal companion's devotion to its master is so complete that it gains a +4 morale bonus on Will saves against enchantment spells and effects.",
    selectable: false,
    aptitudes: [ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Multiattack (Animal Companion)",
    description:
      "The animal companion gains Multiattack as a bonus feat if it has three or more natural attacks. If it does not, it instead gains a second attack with its primary natural weapon at a -5 penalty.",
    selectable: false,
    aptitudes: [ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
    // Multiattack: its secondary attacks at -2; without three attacks, a second one with its primary natural weapon
    modifiers: [
      {
        target: "combat.naturalattacks.secondarypenalty",
        operator: "set",
        value: "-2",
        valueType: "number",
        requirements: [gte("combat.naturalattacks.count", 3)],
      },
      {
        target: "combat.naturalattacks.extraattacks",
        operator: "add",
        value: "1",
        valueType: "number",
        requirements: [gte("combat.naturalattacks.count", 1), lt("combat.naturalattacks.count", 3)],
      },
    ],
  },
  {
    name: "Improved Evasion (Animal Companion)",
    description:
      "When subjected to an attack that normally allows a Reflex save for half damage, the animal companion takes no damage on a successful save and only half on a failed save.",
    selectable: false,
    aptitudes: [ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
  },
];

const ANIMAL_COMPANION_RACE_NAMES = [
  "Badger",
  "Camel",
  "Dire Rat",
  "Dog",
  "Riding Dog",
  "Eagle",
  "Hawk",
  "Horse, Light",
  "Horse, Heavy",
  "Owl",
  "Pony",
  "Snake, Small Viper",
  "Snake, Medium Viper",
  "Wolf",
] as const;

const ANIMAL_COMPANION_RACE_PICK_FEATS: FeatSeed[] = ANIMAL_COMPANION_RACE_NAMES.map((race) => ({
  name: `${race} Animal Companion`,
  description: `Bond with ${formatWithArticle(race)} as your animal companion. The companion appears on your sheet with stats derived from your level and the ${race} race profile.`,
  selectable: true,
  aptitudes: [ANIMAL_COMPANION_APTITUDE],
  modifiers: [
    {
      target: "bonded.animalcompanion.race",
      operator: "set",
      value: race,
      valueType: "string",
    },
  ],
}));

const ANIMAL_COMPANION_RACES: RaceDefinition[] = [
  {
    name: "Badger",
    description: "A burrowing carnivore known for its tenacity. Strong claws and a thick hide.",
    size: "Small",
    baseSpeed: 30,
    properties: QUADRUPED,
  },
  {
    name: "Camel",
    description: "A pack animal of the deserts. Slow but enduring across long distances.",
    size: "Large",
    baseSpeed: 50,
    properties: QUADRUPED,
  },
  {
    name: "Dire Rat",
    description: "An oversized, disease-ridden rodent. Surprisingly agile climbers and swimmers.",
    size: "Small",
    baseSpeed: 40,
    properties: QUADRUPED,
    modifiers: [grantFeat("diseasefilthfever")],
  },
  {
    name: "Dog",
    description: "A small, alert canine companion. Excellent at scent tracking.",
    size: "Small",
    baseSpeed: 40,
    properties: QUADRUPED,
  },
  {
    name: "Riding Dog",
    description: "A larger working dog bred for harness and battle. Can carry a Small rider.",
    size: "Medium",
    baseSpeed: 40,
    properties: QUADRUPED,
    modifiers: [grantFeat("trip")],
  },
  {
    name: "Eagle",
    description: "A keen-eyed bird of prey. Swift and powerful in flight.",
    size: "Small",
    baseSpeed: 10,
  },
  {
    name: "Hawk",
    description:
      "A small bird of prey with sharp talons and unmatched eyesight in daylight. Its Spot counts a +8 racial bonus that applies only in daylight.",
    size: "Tiny",
    baseSpeed: 10,
  },
  {
    name: "Horse, Light",
    description: "A swift riding horse, agile and fast over open ground.",
    size: "Large",
    baseSpeed: 60,
    properties: QUADRUPED,
  },
  {
    name: "Horse, Heavy",
    description: "A draft horse bred for endurance and strength. Slower but tougher.",
    size: "Large",
    baseSpeed: 50,
    properties: QUADRUPED,
  },
  {
    name: "Owl",
    description:
      "A nocturnal raptor whose silent flight surprises prey. It has a +8 racial bonus on Spot checks in shadowy illumination, applied at the table.",
    size: "Tiny",
    baseSpeed: 10,
  },
  {
    name: "Pony",
    description: "A small sturdy equine, suited as a mount for halflings and gnomes.",
    size: "Medium",
    baseSpeed: 40,
    properties: QUADRUPED,
  },
  {
    name: "Snake, Small Viper",
    description: "A small venomous serpent. Quick to strike and difficult to spot.",
    size: "Small",
    baseSpeed: 20,
    modifiers: [grantFeat("poison")],
  },
  {
    name: "Snake, Medium Viper",
    description: "A medium-sized venomous serpent. Lethal bite and unsettling speed.",
    size: "Medium",
    baseSpeed: 20,
    modifiers: [grantFeat("poison")],
  },
  {
    name: "Wolf",
    description: "A pack predator. Devastating trip attack and a powerful sense of smell.",
    size: "Medium",
    baseSpeed: 50,
    properties: QUADRUPED,
    modifiers: [grantFeat("trip")],
  },
];

const BONDED_RACE_FEATURE_FEATS: FeatSeed[] = [
  {
    name: "Trip",
    description:
      "After a successful bite attack, the creature may attempt to trip the target as a free action without making a touch attack and without provoking an attack of opportunity. If the trip attempt fails, the target cannot make a counter-trip in return.",
    selectable: false,
    aptitudes: [BONDED_RACE_FEATURE_APTITUDE],
  },
  {
    name: "Poison",
    description:
      "A target struck by this creature's bite must succeed on a Fortitude save (DC depends on the creature) or take initial Constitution damage. One minute later the target must save again or take secondary Constitution damage. Consult the SRD entry for the specific creature for the exact DC and damage.",
    selectable: false,
    aptitudes: [BONDED_RACE_FEATURE_APTITUDE],
  },
  {
    name: "Disease (Filth Fever)",
    description:
      "A target bitten by the creature is exposed to filth fever (disease, injury, Fort DC 12, incubation 1d3 days, damage 1d3 Dex and 1d3 Con).",
    selectable: false,
    aptitudes: [BONDED_RACE_FEATURE_APTITUDE],
  },
];

export const ANIMAL_COMPANIONS: BondContent = {
  kind: "animalcompanion",
  aptitudes: ANIMAL_COMPANION_APTITUDES,
  feats: [...ANIMAL_COMPANION_CLASS_FEATURE_FEATS, ...ANIMAL_COMPANION_RACE_PICK_FEATS, ...BONDED_RACE_FEATURE_FEATS],
  races: ANIMAL_COMPANION_RACES,
  klass: ANIMAL_COMPANION_CLASS,
};
