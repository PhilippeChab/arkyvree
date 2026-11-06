import { setStr } from "@/content/core/builders/customization/modifiers.ts";
import { formatWithArticle } from "@/content/pf1/builders/bonds/articles.ts";
import type { BondContent } from "@/content/pf1/builders/bonds/types.ts";
import { ANIMAL_CLASS_SKILLS } from "@/vocabulary/pf1/bondedCreatures.ts";
import { BONDED_KIND_BY_SLUG } from "@/vocabulary/pf1/bondedKinds.ts";
import { CLASS_HD, FEAT_SELECTABLE } from "@/vocabulary/pf1/fields/index.ts";

import { buildBondedRaces, buildCompanionFeatures, listCompanionFeatures } from "./bondedCreatures.ts";

/**
 * The class an animal companion levels in, and its kind, which its races and class are for: "Animal Companion",
 * `animalcompanion`.
 */
const { className: ANIMAL_COMPANION, slug: ANIMAL_COMPANION_PARTITION } = BONDED_KIND_BY_SLUG.animalcompanion;
const ANIMAL_COMPANION_APTITUDE = `${ANIMAL_COMPANION} Bond`;
const ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE = `${ANIMAL_COMPANION} Class Feature`;

/**
 * The animal companions' races, the druid's list in the Core Rulebook, each by the name its starting statistics have
 * there: what its sheet reads its numbers by, and its advancement at its master's 4th or 7th effective druid level.
 */
const ANIMAL_COMPANION_RACES = buildBondedRaces(ANIMAL_COMPANION_PARTITION, {
  Ape: { description: "A powerful climbing primate, such as a gorilla, which grows to Large at its advancement." },
  Badger: {
    description: "A fierce burrowing carnivore, such as a wolverine, which can fly into a rage.",
    quadruped: true,
  },
  Bear: { description: "A strong, enduring omnivore with a powerful bite and claws.", quadruped: true },
  Bird: { description: "A large bird of prey, such as an eagle, a hawk or an owl." },
  Boar: { description: "A tough, ill-tempered wild pig whose gore keeps fighting past its wounds.", quadruped: true },
  Camel: { description: "A desert pack animal that can spit at a foe.", quadruped: true },
  "Cat, Big": {
    description: "A great hunting cat, such as a lion or a tiger, which pounces and rakes.",
    quadruped: true,
  },
  "Cat, Small": {
    description: "A swift hunting cat, such as a cheetah or a leopard, which trips its prey.",
    quadruped: true,
  },
  Crocodile: {
    description: "A swimming reptile, such as an alligator, which grabs and rolls its prey.",
    quadruped: true,
  },
  Dinosaur: { description: "A swift predatory dinosaur, such as a deinonychus or a velociraptor." },
  Dog: { description: "A loyal canine with a keen sense of smell.", quadruped: true },
  Horse: { description: "A riding horse, which becomes combat trained at its advancement.", quadruped: true },
  Pony: { description: "A small horse, a mount for a Small rider.", quadruped: true },
  Shark: { description: "An aquatic predator, which swims and never leaves the water." },
  "Snake, Constrictor": { description: "A large snake that grabs and crushes its prey." },
  "Snake, Viper": { description: "A venomous snake whose bite poisons." },
  Wolf: { description: "A pack hunter whose bite trips its prey.", quadruped: true },
});

/**
 * An animal companion: the druid's companions, each the pick that names its race (`bonded.animalcompanion.race`), its
 * class, which its master's effective druid level levels it in, and its class features. It treats an animal's class
 * skills as its own; its hit dice, base attack, saves, skill ranks and feats come from its effective druid level.
 */
export const ANIMAL_COMPANIONS: BondContent = {
  aptitudes: [ANIMAL_COMPANION_APTITUDE, ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE],
  feats: [
    ...buildCompanionFeatures(ANIMAL_COMPANION, ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE),
    ...ANIMAL_COMPANION_RACES.map(({ name }) => ({
      name: `${name} Animal Companion`,
      description: `Bond with ${formatWithArticle(name)} as your animal companion. The companion appears on your sheet with its starting statistics, advanced by your effective druid level.`,
      fields: { [FEAT_SELECTABLE]: true },
      aptitudes: [ANIMAL_COMPANION_APTITUDE],
      modifiers: [setStr("bonded.animalcompanion.race", name)],
    })),
  ],
  races: ANIMAL_COMPANION_RACES,
  klass: {
    name: ANIMAL_COMPANION,
    description:
      "An animal bonded to a druid or a ranger. Its hit dice, base attack bonus, saves, skills and feats come from its master's effective druid level, and its class grants it its special abilities as that level rises.",
    fields: { [CLASS_HD]: 8 },
    levels: 20,
    partition: ANIMAL_COMPANION_PARTITION,
    classSkills: [...ANIMAL_CLASS_SKILLS],
    classFeatureAptitude: ANIMAL_COMPANION_CLASS_FEATURE_APTITUDE,
    classFeatures: listCompanionFeatures(ANIMAL_COMPANION),
  },
};
