import { bonus, setStr } from "@/content/core/builders/customization/modifiers.ts";
import { formatWithArticle } from "@/content/pf1/builders/bonds/articles.ts";
import type { BondContent } from "@/content/pf1/builders/bonds/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ANIMAL_CLASS_SKILLS, FAMILIAR_MASTER_BONUSES } from "@/vocabulary/pf1/bondedCreatures.ts";
import { BONDED_KIND_BY_SLUG } from "@/vocabulary/pf1/bondedKinds.ts";
import { CLASS_HD, FEAT_SELECTABLE } from "@/vocabulary/pf1/fields/index.ts";

import { buildBondedRaces } from "./bondedCreatures.ts";

/** The class a familiar levels in, and its kind, which its races and class are for: "Familiar", `familiar`. */
const { className: FAMILIAR_CLASS, slug: FAMILIAR } = BONDED_KIND_BY_SLUG.familiar;
const FAMILIAR_APTITUDE = `${FAMILIAR_CLASS} Bond`;
const FAMILIAR_CLASS_FEATURE_APTITUDE = `${FAMILIAR_CLASS} Class Feature`;

/** A familiar's class features, by its master's class level, each one's name and what it does. */
// oxfmt-ignore
const FAMILIAR_FEATURES: [number, string, string][] = [
  [1, "Alertness", "While the familiar is within arm's reach, its master gains the Alertness feat. A situational benefit: apply it at the table."],
  [1, "Improved Evasion", "When subjected to an attack that allows a Reflex saving throw for half damage, the familiar takes no damage on a successful save and only half damage on a failed one."],
  [1, "Share Spells", "The master may cast a spell with a target of \"You\" on the familiar (as a touch spell) instead of on himself, and may cast spells on it even if they don't normally affect its type."],
  [1, "Empathic Link", "The master has an empathic link with the familiar to a distance of up to 1 mile: they can communicate empathically, but not see through each other's eyes."],
  [3, "Deliver Touch Spells", "If the master and the familiar are in contact when the master casts a touch spell, he can designate the familiar as the toucher: it delivers the spell as he would."],
  [5, "Speak with Master", "The familiar and its master can communicate verbally as if they shared a language, which other creatures don't understand without magical help."],
  [7, "Speak with Animals of Its Kind", "The familiar can communicate with animals of approximately the same kind as itself, within the limits of their intelligence."],
  [11, "Spell Resistance", "The familiar gains spell resistance equal to its master's level + 5."],
  [13, "Scry on Familiar", "The master may scry on the familiar, as the scrying spell, once per day."],
];

/**
 * The familiars' races, the Core Rulebook's list, each with what it grants its master (`FAMILIAR_MASTER_BONUSES`); a
 * raven also speaks one language of its master's choice.
 */
const FAMILIAR_RACES = buildBondedRaces(FAMILIAR, {
  Bat: { description: "A small flying mammal that hunts at night by blindsense." },
  Cat: { description: "A small, stealthy feline.", quadruped: true },
  Hawk: { description: "A keen-eyed bird of prey." },
  Lizard: { description: "A small reptile that climbs as fast as it runs.", quadruped: true },
  Monkey: { description: "A small, agile primate that climbs as fast as it runs." },
  Owl: { description: "A silent nocturnal bird of prey." },
  Rat: { description: "A small rodent that climbs and swims.", quadruped: true },
  Raven: { description: "A clever black bird, which as a familiar speaks one language of its master's choice." },
  Toad: { description: "A small amphibian, hard to spot.", quadruped: true },
  Viper: { description: "A tiny venomous snake, whose bite poisons." },
  Weasel: { description: "A small, swift carnivore whose bite latches on.", quadruped: true },
});

/**
 * Each familiar's pick, which names its race (`bonded.familiar.race`) and gives its master what it grants him while
 * they're within a mile of each other: a bonus on a skill's checks or a save, or hit points. A bonus limited to some
 * checks (a hawk's or an owl's) is only described.
 */
const FAMILIAR_RACE_PICK_FEATS: FeatSeed[] = FAMILIAR_RACES.map(({ name }) => {
  const { bonus: amount, condition, hitPoints, save, skill } = FAMILIAR_MASTER_BONUSES[name];
  const [benefit, target] = hitPoints
    ? [`+${amount} hit points`, "combat.hp.misc"]
    : save
      ? [`a +${amount} bonus on ${save[0].toUpperCase()}${save.slice(1)} saves`, `saves.${save}.misc`]
      : [`a +${amount} bonus on ${skill} checks`, `skills.${stripSeparators(skill ?? "")}.misc`];
  return {
    name: `${name} Familiar`,
    description: `Bond with ${formatWithArticle(name)} as your familiar: while it's within a mile of you, you gain ${benefit}${condition ? ` (${condition}, applied at the table)` : ""}. The familiar appears on your sheet with statistics from its stat block and your level.`,
    fields: { [FEAT_SELECTABLE]: true },
    aptitudes: [FAMILIAR_APTITUDE],
    modifiers: [setStr("bonded.familiar.race", name), ...(condition ? [] : [bonus(target, amount)])],
  };
});

/**
 * A familiar: the Core Rulebook's familiars, its class, which its master's class level levels it in, and its class
 * features. It treats an animal's class skills as its own; its hit points, base attack and saves are its master's.
 */
export const FAMILIARS: BondContent = {
  aptitudes: [FAMILIAR_APTITUDE, FAMILIAR_CLASS_FEATURE_APTITUDE],
  feats: [
    ...FAMILIAR_FEATURES.map(([, name, description]) => ({
      name: `${name} (Familiar)`,
      description,
      fields: { [FEAT_SELECTABLE]: false },
      aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
    })),
    ...FAMILIAR_RACE_PICK_FEATS,
  ],
  races: FAMILIAR_RACES,
  klass: {
    name: FAMILIAR_CLASS,
    description:
      "A magical animal bonded to an arcane spellcaster. Its hit points, base attack bonus and saves come from its master, and its class grants it its special abilities as its master gains levels.",
    fields: { [CLASS_HD]: 8 },
    levels: 20,
    partition: FAMILIAR,
    classSkills: [...ANIMAL_CLASS_SKILLS],
    classFeatureAptitude: FAMILIAR_CLASS_FEATURE_APTITUDE,
    classFeatures: FAMILIAR_FEATURES.map(([level, name]) => [level, `${name} (Familiar)`]),
  },
};
