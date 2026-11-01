/**
 * A character as v1 answers it: its card, its sheet without the words only the app's screens show (its summary's
 * prompts, every modifier and requirement the engine weighed), and the parts its edits change.
 */

import type { z } from "zod";

import {
  type v1Character,
  type v1CharacterCard,
  v1CharacterPermissions,
  type v1Creation,
  type v1CreationOption,
  type v1ImportedCharacter,
  type v1Inventory,
  type v1LinkRoom,
  type v1Modifiers,
} from "@/server/routers/v1/schemas/characters.ts";
import type { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";
import type { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import type { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import type { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

import type { Answer } from "./answers.ts";
import { toV1Page, type V1Page } from "./pages.ts";
import { pickShape } from "./picks.ts";

/** A character's card, as the app's own API answers it in a page of them. */
type Card = Answer<typeof CharactersService.getCharacters>["items"][number];

/** What a reader of a sheet without a role of theirs may do with it (a shared sheet's): nothing. */
const NO_PERMISSIONS: z.infer<typeof v1Character>["permissions"] = {
  canArchive: false,
  canEdit: false,
  canEditPortrait: false,
  canInviteContributors: false,
  canLeave: false,
  canManageContributors: false,
  canReadContributors: false,
  canShare: false,
};

/** A character's sheet, as v1 answers it: a shared one's, read by its link, with no permission. */
export function toV1Character(
  sheet:
    | Answer<typeof CharactersService.getCharacter>
    | Answer<typeof CharacterSharingService.getSharedCharacter>
    | Answer<typeof CampaignCharactersService.getCharacter>,
): z.infer<typeof v1Character> {
  return {
    archived: sheet.deletedAt !== null,
    id: sheet.id,
    kind: sheet.kind,
    name: sheet.name,
    ownerId: sheet.userId,
    parentCharacterId: sheet.parentCharacterId,
    permissions: "permissions" in sheet ? pickShape(v1CharacterPermissions, sheet.permissions) : NO_PERMISSIONS,
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

/** How a new character sets its scores of a role. */
export function toV1Creation(creation: Answer<typeof CharactersService.getCreation>): z.infer<typeof v1Creation> {
  return {
    entities: creation.entities.map(({ id, name }) => ({ id, name })),
    methods: creation.methods.map((method) => ({ ...method })),
    modifiers: { ...creation.modifiers },
    scores: { max: creation.scores.max, min: creation.scores.min, start: creation.scores.start },
  };
}

/** An option a new character's creation pick offers, as it's stored. */
export function toV1CreationOption(
  option: Answer<typeof CharactersService.getCreationOptions>["items"][number],
): z.infer<typeof v1CreationOption> {
  return {
    description: option.description,
    eligible: option.eligible,
    fields: { ...option.fields },
    id: option.id,
    links: { ...option.links },
    name: option.name ?? "",
    partition: option.partition,
    requirementTree: option.requirementTree,
  };
}

/** A character imported from another program's file, with what the import says it did. */
export function toV1ImportedCharacter(
  sheet: Answer<typeof CharactersService.getCharacter>,
  report: Answer<typeof CharactersService.importCharacter>["report"],
): z.infer<typeof v1ImportedCharacter> {
  return {
    character: toV1Character(sheet),
    report: {
      imported: report.imported,
      issues: report.issues,
      program: report.program,
      unmatched: report.unmatched.map(({ line, reason, text }) => ({ line, reason, text })),
    },
  };
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
    updatedAt: modifier.updatedAt,
    value: modifier.value,
    valueLabel: modifier.valueLabel,
    valueType: modifier.valueType,
  }));
}
