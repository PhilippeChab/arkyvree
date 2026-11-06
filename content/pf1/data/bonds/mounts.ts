import { setStr } from "@/content/core/builders/customization/modifiers.ts";
import { formatWithArticle } from "@/content/pf1/builders/bonds/articles.ts";
import type { BondContent } from "@/content/pf1/builders/bonds/types.ts";
import { ANIMAL_CLASS_SKILLS, BONDED_MOUNT } from "@/vocabulary/pf1/bondedCreatures.ts";
import { BONDED_KIND_BY_SLUG } from "@/vocabulary/pf1/bondedKinds.ts";
import { CLASS_HD, FEAT_SELECTABLE } from "@/vocabulary/pf1/fields/index.ts";

import { buildBondedRaces, buildCompanionFeatures, listCompanionFeatures } from "./bondedCreatures.ts";

/** The class a bonded mount levels in, and its kind, which its races and class are for: "Bonded Mount", `mount`. */
const { className: BONDED_MOUNT_CLASS, slug: MOUNT } = BONDED_KIND_BY_SLUG.mount;
const BONDED_MOUNT_APTITUDE = `${BONDED_MOUNT_CLASS} Bond`;
const BONDED_MOUNT_CLASS_FEATURE_APTITUDE = `${BONDED_MOUNT_CLASS} Class Feature`;

/** What a bonded mount gains past an animal companion's features, by its master's paladin level. */
const MOUNT_FEATURES = [
  {
    level: BONDED_MOUNT.celestialTemplateLevel,
    name: "Celestial (Bonded Mount)",
    description:
      "The mount gains the celestial creature template and becomes a magical beast for the purposes of determining which spells affect it.",
  },
  {
    level: BONDED_MOUNT.spellResistance.level,
    name: "Spell Resistance (Bonded Mount)",
    description: `The mount gains spell resistance equal to its master's paladin level + ${BONDED_MOUNT.spellResistance.bonus}.`,
  },
];

/**
 * The bonded mounts' races: a horse for a Medium paladin or a pony for a Small one, or one of the more exotic mounts
 * the Core Rulebook names, a boar, a camel or a dog, each an animal companion's.
 */
const MOUNT_RACES = buildBondedRaces(MOUNT, {
  Horse: { description: "A horse, the usual bonded mount of a Medium paladin.", quadruped: true },
  Pony: { description: "A pony, the usual bonded mount of a Small paladin.", quadruped: true },
  Boar: { description: "A wild boar, an exotic bonded mount.", quadruped: true },
  Camel: { description: "A camel, an exotic bonded mount.", quadruped: true },
  Dog: { description: "A dog, an exotic bonded mount for a Small paladin.", quadruped: true },
});

/**
 * A paladin's bonded mount, the mount her divine bond calls: each its pick, which names its race
 * (`bonded.mount.race`), its class, which her paladin level levels it in as its effective druid level, and its class
 * features: an animal companion's, then the celestial template and spell resistance. Its Intelligence is at least 6,
 * which its sheet holds (`BONDED_MOUNT`).
 */
export const BONDED_MOUNTS: BondContent = {
  aptitudes: [BONDED_MOUNT_APTITUDE, BONDED_MOUNT_CLASS_FEATURE_APTITUDE],
  feats: [
    ...buildCompanionFeatures(BONDED_MOUNT_CLASS, BONDED_MOUNT_CLASS_FEATURE_APTITUDE),
    ...MOUNT_FEATURES.map(({ description, name }) => ({
      name,
      description,
      fields: { [FEAT_SELECTABLE]: false },
      aptitudes: [BONDED_MOUNT_CLASS_FEATURE_APTITUDE],
    })),
    ...MOUNT_RACES.map(({ name }) => ({
      name: `${name} Bonded Mount`,
      description: `Bond with ${formatWithArticle(name)} as your paladin's bonded mount. The mount appears on your sheet with its starting statistics, advanced by your paladin level as an animal companion's by its effective druid level.`,
      fields: { [FEAT_SELECTABLE]: true },
      aptitudes: [BONDED_MOUNT_APTITUDE],
      modifiers: [setStr("bonded.mount.race", name)],
    })),
  ],
  races: MOUNT_RACES,
  klass: {
    name: BONDED_MOUNT_CLASS,
    description:
      "The mount a paladin's divine bond calls, which functions as an animal companion with her paladin level as its effective druid level, and grows celestial and resistant to spells as she rises in level.",
    fields: { [CLASS_HD]: 8 },
    levels: 20,
    partition: MOUNT,
    classSkills: [...ANIMAL_CLASS_SKILLS],
    classFeatureAptitude: BONDED_MOUNT_CLASS_FEATURE_APTITUDE,
    classFeatures: [
      ...listCompanionFeatures(BONDED_MOUNT_CLASS),
      ...MOUNT_FEATURES.map(({ level, name }): [number, string] => [level, name]),
    ],
  },
};
