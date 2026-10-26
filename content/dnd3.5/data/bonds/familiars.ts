import { bonus, setStr } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { formatWithArticle } from "@/content/dnd3.5/builders/bonds/articles.ts";
import type { BondContent } from "@/content/dnd3.5/builders/bonds/types.ts";
import { grantFeat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import { QUADRUPED_FIELDS } from "@/content/dnd3.5/builders/races/fields.ts";
import { CLASS_HD, FEAT_SELECTABLE, RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

const FAMILIAR_APTITUDE = "Familiar Bond";
const FAMILIAR_CLASS_FEATURE_APTITUDE = "Familiar Class Feature";

const FAMILIAR_APTITUDES = [FAMILIAR_APTITUDE, FAMILIAR_CLASS_FEATURE_APTITUDE];

const FAMILIAR_CLASS: BondContent["klass"] = {
  name: "Familiar",
  description:
    "A magical creature bonded to its master. The familiar's hit points, base attack bonus, and saving throws are derived from the master; its class progression grants the familiar special abilities at the appropriate hit dice thresholds.",
  fields: { [CLASS_HD]: 8 },
  levels: 20,
  skillPoints: 0,
  partition: "familiar",
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "good" },
  classSkills: ["Balance", "Climb", "Hide", "Listen", "Move Silently", "Spot", "Swim"],
  classFeatureAptitude: FAMILIAR_CLASS_FEATURE_APTITUDE,
  classFeatures: [
    [1, "Alertness (Familiar)"],
    [1, "Improved Evasion (Familiar)"],
    [1, "Share Spells (Familiar)"],
    [1, "Empathic Link (Familiar)"],
    [3, "Deliver Touch Spells (Familiar)"],
    [5, "Speak with Master (Familiar)"],
    [7, "Speak with Animals of Its Kind (Familiar)"],
    [11, "Spell Resistance (Familiar)"],
    [13, "Scry on Familiar (Familiar)"],
  ],
};

const FAMILIAR_CLASS_FEATURE_FEATS: FeatSeed[] = [
  {
    name: "Alertness (Familiar)",
    description:
      "While the familiar is within arm's reach, its master gains the Alertness feat. A situational benefit: apply it at the table.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Improved Evasion (Familiar)",
    description:
      "When subjected to an attack that normally allows a Reflex save for half damage, the familiar takes no damage on a successful save and only half on a failed save.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Share Spells (Familiar)",
    description:
      "The master may have any spell (but not any spell-like ability) cast on themselves also affect the familiar, provided the familiar is within 5 feet at the time of casting.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Empathic Link (Familiar)",
    description:
      "The master has an empathic link with the familiar to a distance of up to one mile, communicating general emotional content but not necessarily specific visual or auditory information.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Deliver Touch Spells (Familiar)",
    description:
      "If the master and familiar are in contact at the time the master casts a touch spell, the familiar can deliver the touch spell as if it had cast the spell.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Speak with Master (Familiar)",
    description:
      "The familiar and master can communicate verbally as if they were using a common language. Other creatures do not understand this communication without magical help.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Speak with Animals of Its Kind (Familiar)",
    description:
      "The familiar can communicate with other animals of its kind (e.g. cats with all felines, ravens with all corvids). Such communication is limited by the intelligence of the conversing creatures.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Spell Resistance (Familiar)",
    description:
      "The familiar gains spell resistance equal to the master's level + 5. To affect the familiar with a spell, another spellcaster must succeed on a caster level check (1d20 + caster level) that equals or exceeds this spell resistance.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
  {
    name: "Scry on Familiar (Familiar)",
    description: "The master may scry on the familiar (as if casting the scrying spell) once per day.",
    fields: { [FEAT_SELECTABLE]: false },
    aptitudes: [FAMILIAR_CLASS_FEATURE_APTITUDE],
  },
];

const FAMILIAR_RACE_NAMES = ["Bat", "Cat", "Hawk", "Lizard", "Owl", "Rat", "Raven", "Viper", "Toad", "Weasel"] as const;

/**
 * What each familiar gives its master (the SRD's familiar table), on the master's pick of it: the master's sheet, not
 * the familiar's. A situational one (a hawk's in bright light, an owl's in shadows) is only described.
 */
const MASTER_BENEFITS: Record<(typeof FAMILIAR_RACE_NAMES)[number], { benefit: string; modifiers: Modifier[] }> = {
  Bat: { benefit: "a +3 bonus on Listen checks", modifiers: [bonus("skills.listen.misc", 3)] },
  Cat: { benefit: "a +3 bonus on Move Silently checks", modifiers: [bonus("skills.movesilently.misc", 3)] },
  Hawk: { benefit: "a +3 bonus on Spot checks in bright light, applied at the table", modifiers: [] },
  Lizard: { benefit: "a +3 bonus on Climb checks", modifiers: [bonus("skills.climb.misc", 3)] },
  Owl: { benefit: "a +3 bonus on Spot checks in shadows, applied at the table", modifiers: [] },
  Rat: { benefit: "a +2 bonus on Fortitude saves", modifiers: [bonus("saves.fortitude.misc", 2)] },
  Raven: { benefit: "a +3 bonus on Appraise checks", modifiers: [bonus("skills.appraise.misc", 3)] },
  Viper: { benefit: "a +3 bonus on Bluff checks", modifiers: [bonus("skills.bluff.misc", 3)] },
  Toad: { benefit: "+3 hit points", modifiers: [bonus("combat.hp.misc", 3)] },
  Weasel: { benefit: "a +2 bonus on Reflex saves", modifiers: [bonus("saves.reflex.misc", 2)] },
};

const FAMILIAR_RACE_PICK_FEATS: FeatSeed[] = FAMILIAR_RACE_NAMES.map((race) => ({
  name: `${race} Familiar`,
  description: `Bond with ${formatWithArticle(race)} as your familiar: while it's within a mile of you, you gain ${MASTER_BENEFITS[race].benefit}. The familiar appears on your sheet with stats derived from your level and the ${race} race profile.`,
  fields: { [FEAT_SELECTABLE]: true },
  aptitudes: [FAMILIAR_APTITUDE],
  modifiers: [setStr("bonded.familiar.race", race), ...MASTER_BENEFITS[race].modifiers],
}));

const FAMILIAR_RACES: BondContent["races"] = [
  {
    name: "Bat",
    description:
      "A small, nocturnal flying mammal. Bat familiars grant their masters a +3 bonus on Listen checks (the +3 to Hide in 3.5 SRD applies to the bat itself).",
    fields: { [RACE_SIZE]: "Diminutive", [RACE_BASE_SPEED]: 5 },
    partition: "familiar",
  },
  {
    name: "Cat",
    description: "A small feline. Cat familiars grant their masters a +3 bonus on Move Silently checks.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 30, ...QUADRUPED_FIELDS },
    partition: "familiar",
  },
  {
    name: "Hawk",
    description:
      "A keen-eyed bird of prey. Hawk familiars grant their masters a +3 bonus on Spot checks in bright light.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 10 },
    partition: "familiar",
  },
  {
    name: "Lizard",
    description: "A small scaled reptile. Lizard familiars grant their masters a +3 bonus on Climb checks.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 20, ...QUADRUPED_FIELDS },
    partition: "familiar",
  },
  {
    name: "Owl",
    description:
      "A silent nocturnal hunter. Owl familiars grant their masters a +3 bonus on Spot checks in shadowy areas.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 10 },
    partition: "familiar",
  },
  {
    name: "Rat",
    description: "A small adaptive rodent. Rat familiars grant their masters a +2 bonus on Fortitude saves.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 15, ...QUADRUPED_FIELDS },
    partition: "familiar",
  },
  {
    name: "Raven",
    description: "A clever black bird. Raven familiars can speak one language known to their master.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 10 },
    partition: "familiar",
  },
  {
    name: "Viper",
    description:
      "A venomous tiny serpent (the 3.5 SRD's 'Tiny Viper' familiar option). Viper familiars grant their masters a +3 bonus on Bluff checks.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 15 },
    partition: "familiar",
    modifiers: [grantFeat("Poison")],
  },
  {
    name: "Toad",
    description: "A small amphibian. Toad familiars grant their masters +3 hit points (a flat HP bonus, not scaling).",
    fields: { [RACE_SIZE]: "Diminutive", [RACE_BASE_SPEED]: 5, ...QUADRUPED_FIELDS },
    partition: "familiar",
  },
  {
    name: "Weasel",
    description: "A small swift carnivore. Weasel familiars grant their masters a +2 bonus on Reflex saves.",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 20, ...QUADRUPED_FIELDS },
    partition: "familiar",
  },
];

export const FAMILIARS: BondContent = {
  aptitudes: FAMILIAR_APTITUDES,
  feats: [...FAMILIAR_CLASS_FEATURE_FEATS, ...FAMILIAR_RACE_PICK_FEATS],
  races: FAMILIAR_RACES,
  klass: FAMILIAR_CLASS,
};
