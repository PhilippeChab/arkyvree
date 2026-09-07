import { eq, feat } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

export const CREATURE_TYPES = [
  "Aberration",
  "Animal",
  "Construct",
  "Dragon",
  "Elemental",
  "Fey",
  "Giant",
  "Humanoid (Aquatic)",
  "Humanoid (Dwarf)",
  "Humanoid (Elf)",
  "Humanoid (Gnoll)",
  "Humanoid (Gnome)",
  "Humanoid (Goblinoid)",
  "Humanoid (Halfling)",
  "Humanoid (Human)",
  "Humanoid (Orc)",
  "Humanoid (Reptilian)",
  "Magical Beast",
  "Monstrous Humanoid",
  "Ooze",
  "Outsider (Air)",
  "Outsider (Chaotic)",
  "Outsider (Earth)",
  "Outsider (Evil)",
  "Outsider (Fire)",
  "Outsider (Good)",
  "Outsider (Lawful)",
  "Outsider (Native)",
  "Outsider (Water)",
  "Plant",
  "Undead",
  "Vermin",
] as const;

export type CreatureType = (typeof CREATURE_TYPES)[number];

export function findCreatureType(text: string): CreatureType | null {
  if (!text) return null;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tries: { keyword: string; variant: CreatureType }[] = [];
  for (const t of CREATURE_TYPES) {
    const m = t.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (m) tries.push({ keyword: m[2], variant: t });
  }
  for (const t of CREATURE_TYPES) {
    if (!/\(/.test(t)) tries.push({ keyword: t, variant: t });
  }
  for (const { keyword, variant } of tries) {
    if (new RegExp(`\\b${escape(keyword)}s?\\b`, "i").test(text)) return variant;
  }
  return null;
}

export const FAVORED_ENEMY_APTITUDE = "Favored Enemy";
export const FAVORED_ENEMY_SPECIALIZATION_APTITUDE = "Favored Enemy Specialization";
export const FAVORED_ENEMY_FAMILY = "Favored Enemy";

export const favoredEnemy: FeatSeed[] = CREATURE_TYPES.map((t) => ({
  name: `Favored Enemy: ${t}`,
  description: `Designate ${t} as a favored enemy. +2 on Bluff, Listen, Sense Motive, Spot, and Survival checks made against ${t}, and +2 on weapon damage rolls targeting them.`,
  aptitudes: [FAVORED_ENEMY_APTITUDE],
  properties: [{ type: "FEAT_FAMILY", value: FAVORED_ENEMY_FAMILY }],
}));

export const favoredEnemySpecializationVariants: FeatSeed[] = CREATURE_TYPES.map((t) => ({
  name: `Favored Enemy Specialization: ${t}`,
  description: `Increases your favored enemy bonus against ${t} by +2. May be taken multiple times to stack the bonus further.`,
  stackable: true,
  aptitudes: [FAVORED_ENEMY_SPECIALIZATION_APTITUDE],
  requirements: [eq(feat(`Favored Enemy: ${t}`))],
  properties: [{ type: "FEAT_FAMILY", value: FAVORED_ENEMY_FAMILY }],
}));

export const FAVORED_ENEMY_SPECIALIZATION_UMBRELLA = "Favored Enemy Specialization (Ranger)";
export const favoredEnemySpecializationUmbrella: FeatSeed = {
  name: FAVORED_ENEMY_SPECIALIZATION_UMBRELLA,
  description: "At 5th level and every 5 levels thereafter, the ranger may increase the bonus against one of their favored enemies by +2.",
  stackable: true,
  selectable: false,
  aptitudes: ["Ranger Class Feature"],
  modifiers: [
    { target: "aptitudes.favoredenemyspecialization.allowed", operator: "add", value: "1", valueType: "number" },
  ],
};
