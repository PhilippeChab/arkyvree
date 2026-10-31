/**
 * A character as v1 answers it: its card, its sheet without the words only the app's screens show (its summary's
 * prompts, every modifier and requirement the engine weighed), and the parts its edits change.
 */

import type { z } from "zod";

import type {
  v1Character,
  v1CharacterCard,
  v1Inventory,
  v1LinkRoom,
  v1Modifiers,
} from "@/server/routers/v1/schemas/characters.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";
import type { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import type { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";

import type { Answer } from "./answers.ts";
import { toV1Page, type V1Page } from "./pages.ts";

/** A character's card, as the app's own API answers it in a page of them. */
type Card = Answer<typeof CharactersService.getCharacters>["items"][number];

/** A character's sheet, as v1 answers it. */
export function toV1Character(sheet: Answer<typeof CharactersService.getCharacter>): z.infer<typeof v1Character> {
  return {
    archived: sheet.deletedAt !== null,
    id: sheet.id,
    kind: sheet.kind,
    name: sheet.name,
    ownerId: sheet.userId,
    parentCharacterId: sheet.parentCharacterId,
    permissions: sheet.permissions,
    rulesetId: sheet.rulesetId,
    rulesetName: sheet.rulesetName,
    sections: sheet.blocks.map((block) => ({ ...block })),
    shareToken: sheet.shareToken,
    updatedAt: sheet.updatedAt,
    validation: {
      issues: sheet.validation.issues.map((issue) => ({
        category: issue.category,
        entityId: issue.entityId,
        entityName: issue.entityName,
        entityType: issue.entityType,
        message: issue.message,
        requirementTree: issue.requirementTree,
        tier: issue.tier,
      })),
      valid: sheet.validation.valid,
    },
  };
}

/** A page of the user's characters, each as its card shows it. */
export function toV1Characters(
  characters: Answer<typeof CharactersService.getCharacters>,
): V1Page<z.infer<typeof v1CharacterCard>> {
  return toV1Page(characters, (card: Card) => ({
    accessRole: card.accessRole,
    description: card.description,
    id: card.id,
    name: card.name,
    summary: card.chips.map(({ label, partial }) => ({ label, partial })),
  }));
}

/** A character's inventory, each item with its fields by the names its ruleset declares them. */
export function toV1Inventory(
  inventory: Answer<typeof CharacterInventoryService.getInventory>,
): z.infer<typeof v1Inventory> {
  return inventory.map((entry) => ({
    charges:
      entry.totalCharges === null && entry.remainingCharges === null
        ? null
        : { remaining: entry.remainingCharges, total: entry.totalCharges },
    groups: entry.groups,
    id: entry.id,
    item: {
      description: entry.item.description,
      fields: entry.item.fields,
      id: entry.item.id,
      name: entry.item.name,
    },
    location: entry.location,
    quantity: entry.quantity,
    slotLabel: entry.slotLabel,
    updatedAt: entry.updatedAt,
  }));
}

/** A character's links of a role: its picks, those it has anyway, its options, each by its id and name. */
export function toV1LinkRoom(room: Answer<typeof CharactersService.getLinkPicks>): z.infer<typeof v1LinkRoom> {
  const named = (links: { id: string; name: string }[]) => links.map(({ id, name }) => ({ id, name }));
  return { automatic: named(room.automatic), options: named(room.options), picks: named(room.picks) };
}

/** A character's own modifiers, each with its target's labels. */
export function toV1Modifiers(
  modifiers: Answer<typeof CharacterModifiersService.getModifiers>,
): z.infer<typeof v1Modifiers> {
  return modifiers.map((modifier) => ({
    id: modifier.id,
    operator: modifier.operator,
    target: modifier.target,
    targetLabels: modifier.targetLabels,
    value: modifier.value,
    valueLabel: modifier.valueLabel,
    valueType: modifier.valueType,
  }));
}
