/**
 * The parts of a character its edits change, as v1 answers them: its inventory, its own modifiers, its languages and
 * a saved level, each what its edit sends back.
 */

import type { z } from "zod";

import type { v1CharacterLanguages, v1Inventory, v1SavedLevel } from "@/server/routers/v1/schemas/characterParts.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";
import type { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import type { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

import type { Answer } from "./answers.ts";

/** A language a character speaks or may pick, named. */
function toLanguage({ id, name, type }: { id: string; name: string; type: string | null }) {
  return { id, name, type };
}

/** What a character speaks, and what it may pick. */
export function toV1CharacterLanguages({
  automatic,
  options,
  picks,
}: Answer<typeof CharactersService.getLanguages>): z.infer<typeof v1CharacterLanguages> {
  return { automatic: automatic.map(toLanguage), options: options.map(toLanguage), picks: picks.map(toLanguage) };
}

/** A character's inventory: each item it carries, where, and how many. */
export function toV1Inventory(
  inventory: Answer<typeof CharacterInventoryService.getInventory>,
): z.infer<typeof v1Inventory> {
  return inventory.map((entry) => ({
    charges:
      entry.totalCharges === null && entry.remainingCharges === null
        ? null
        : { remaining: entry.remainingCharges, total: entry.totalCharges },
    equipped: entry.equipped,
    id: entry.id,
    item: {
      id: entry.item.id,
      name: entry.item.name,
      slot: entry.item.slot,
      type: entry.item.type,
      weight: Number(entry.item.weight),
    },
    location: entry.location,
    locationLabel: entry.slotLabel,
    quantity: entry.quantity,
    weaponSets: entry.weaponSets,
  }));
}

/** A level a character took, what it picked by pool flattened into the picks a save sends. */
export function toV1SavedLevel(level: Answer<typeof CharacterLevelsService.getLevel>): z.infer<typeof v1SavedLevel> {
  return {
    abilityIncreases: level.abilityIncreases,
    class: { id: level.klassId, level: level.level, name: level.klassName },
    feats: Object.entries(level.feats).flatMap(([aptitudeId, feats]) =>
      feats.map(({ id, name }) => ({ aptitudeId, featId: id, name })),
    ),
    hitDie: level.hd,
    hitPoints: level.hp,
    hitPointsRange: level.hitPoints,
    id: level.characterLevelId,
    skillPoints: level.skills,
    spells: Object.entries(level.powers).flatMap(([aptitudeId, spells]) =>
      spells.map(({ id, name, powerLevel }) => ({ aptitudeId, name, spellId: id, spellLevel: powerLevel ?? null })),
    ),
  };
}
