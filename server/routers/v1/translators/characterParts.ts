/**
 * The parts of a character its edits change, as v1 answers them: its inventory, its own modifiers, its languages and
 * a saved level, each what its edit sends back; and what a new character's form reads (how it scores its abilities, the
 * races it may be, a file it's imported from).
 */

import type { z } from "zod";

import type {
  v1CharacterCreation,
  v1CharacterLanguages,
  v1ImportedCharacter,
  v1InventoryEntry,
  v1Placement,
  v1RaceOption,
  v1SavedLevel,
} from "@/server/routers/v1/schemas/characterParts.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";
import type { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import type { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

import type { Answer } from "./answers.ts";
import { toV1Character } from "./characters.ts";
import { toV1Number } from "./content.ts";

/** A way a new character's ability scores are set, as the service describes it. */
type CreationMethod = Answer<typeof CharactersService.getCreation>["methods"][number];

/** A way a new character's ability scores are set, a point buy's costs listed by score. */
function toCreationMethod(method: CreationMethod): z.infer<typeof v1CharacterCreation>["methods"][number] {
  if (method.kind === "roll") return { dice: method.dice, id: method.id, kind: method.kind, label: method.label };
  if (method.kind === "array")
    return { id: method.id, kind: method.kind, label: method.label, scores: [...method.scores] };
  const { budget, costs, id, kind, label, max, min } = method;
  return {
    budget,
    costs: Object.entries(costs).map(([score, cost]) => ({ cost, score: Number(score) })),
    id,
    kind,
    label,
    max,
    min,
  };
}

/** A language a character speaks or may pick, named. */
function toLanguage({ id, name, type }: { id: string; name: string; type: string | null }) {
  return { id, name, type };
}

/** How a new character of a ruleset sets its ability scores. */
export function toV1CharacterCreation({
  abilities,
  methods,
  modifiers,
  scores,
}: Answer<typeof CharactersService.getCreation>): z.infer<typeof v1CharacterCreation> {
  return {
    abilities: abilities.map(({ id, name }) => ({ id, name })),
    methods: methods.map(toCreationMethod),
    modifiers: Object.entries(modifiers).map(([score, modifier]) => ({ modifier, score: Number(score) })),
    scores: { max: scores.max, min: scores.min, start: scores.start },
  };
}

/** What a character speaks, and what it may pick. */
export function toV1CharacterLanguages({
  automatic,
  options,
  picks,
}: Answer<typeof CharactersService.getLanguages>): z.infer<typeof v1CharacterLanguages> {
  return { automatic: automatic.map(toLanguage), options: options.map(toLanguage), picks: picks.map(toLanguage) };
}

/** A character imported from another program's file, its sheet with its import's report. */
export function toV1ImportedCharacter(
  sheet: Answer<typeof CharactersService.getCharacter>,
  { imported, issues, program, unmatched }: Answer<typeof CharactersService.importCharacter>["report"],
): z.infer<typeof v1ImportedCharacter> {
  return {
    character: toV1Character(sheet),
    report: {
      imported,
      issues,
      program,
      unmatched: unmatched.map(({ line, reason, text }) => ({ line, reason, text })),
    },
  };
}

/** An item a character carries: where, how many, and its charges. */
export function toV1InventoryEntry(
  entry: Answer<typeof CharacterInventoryService.getInventory>[number],
): z.infer<typeof v1InventoryEntry> {
  return {
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
      weight: toV1Number(entry.item.weight),
    },
    location: entry.location,
    locationLabel: entry.slotLabel,
    quantity: entry.quantity,
    weaponSets: entry.weaponSets,
  };
}

/** Why a place can't take one more of a character's items, if it can't. */
export function toV1Placement({
  warning,
}: Answer<typeof CharacterInventoryService.getPlacement>): z.infer<typeof v1Placement> {
  return { warning };
}

/** A race a new character may be, and whether one of the alignment and gender given may be one. */
export function toV1RaceOption(
  race: Answer<typeof CharactersService.getAvailableRaces>["items"][number],
): z.infer<typeof v1RaceOption> {
  return {
    description: race.description,
    eligible: race.eligible,
    id: race.id,
    kind: race.kind,
    name: race.name,
    parentId: race.parentId,
    size: race.size,
    speed: race.baseSpeed,
  };
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
