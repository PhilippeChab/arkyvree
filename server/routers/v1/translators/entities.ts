/**
 * A ruleset's entity as v1 answers it, whatever its kind: its columns, its fields, its links with their targets' names,
 * and what its kind adds; and the parts an entity's kind may have (owned entities, progression and tables).
 */

import type { z } from "zod";

import type {
  v1Entity,
  v1EntityGroup,
  v1EntityLink,
  v1EntityModifier,
  v1EntitySummary,
  v1EntityTable,
  v1LabeledModifiers,
  v1LabeledRequirements,
  v1OwnedEntity,
  v1Progression,
  v1Requirement,
  v1StoredEntity,
} from "@/server/routers/v1/schemas/entities.ts";
import type { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import type { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import type { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

import type { Answer } from "./answers.ts";

/** What every described entity has, its kind's additions aside. */
interface DescribedEntity {
  createdAt: string;
  description: string | null;
  fields: Record<string, unknown>;
  id: string;
  links: readonly DescribedLink[];
  name: string | null;
  ownerId: string | null;
  partition: string;
  position: number | null;
  rulesetId: string;
  type: string;
  updatedAt: string;
}

/** A link a described entity has, its target named. */
interface DescribedLink {
  amount: number | null;
  free: boolean;
  id: string;
  ordinal: number;
  role: string;
  tier: number | null;
  toDescription?: string | null;
  toId: string;
  toName: string;
  toType: string;
  viaId: string | null;
  viaName?: string | null;
}

/** An entity, with what its kind adds: its modifiers and requirements, where a character may place it. */
export function toV1Entity(
  entity: DescribedEntity & { modifiers?: Modifier[]; placement?: object; requirements?: Requirement[] },
): z.infer<typeof v1Entity> {
  return {
    ...toV1EntitySummary(entity),
    modifiers: entity.modifiers?.map(toV1EntityModifier),
    placement: entity.placement && { ...entity.placement },
    requirements: entity.requirements?.map(toV1Requirement),
  };
}

/** A group of a kind's entities, or an entity in none. */
export function toV1EntityGroup(
  group: Answer<typeof EntitiesService.getEntityGroups>["items"][number],
): z.infer<typeof v1EntityGroup> {
  return { count: group.count, description: group.description, group: group.group, id: group.id, name: group.name };
}

/** A link from an entity, its target named. */
export function toV1EntityLink(link: DescribedLink): z.infer<typeof v1EntityLink> {
  return {
    amount: link.amount,
    free: link.free,
    id: link.id,
    ordinal: link.ordinal,
    role: link.role,
    tier: link.tier,
    toDescription: link.toDescription,
    toId: link.toId,
    toName: link.toName,
    toType: link.toType,
    viaId: link.viaId,
    viaName: link.viaName,
  };
}

/** An entity's links, of the role its kind edits. */
export function toV1EntityLinks(links: Answer<typeof EntitiesService.getEntityLinks>): z.infer<typeof v1EntityLink>[] {
  return links.map(toV1EntityLink);
}

/** A modifier an entity has. */
export function toV1EntityModifier(modifier: Modifier): z.infer<typeof v1EntityModifier> {
  return {
    id: modifier.id,
    operator: modifier.operator,
    target: modifier.target,
    value: modifier.value,
    valueType: modifier.valueType,
  };
}

/** An entity in a page of them. */
export function toV1EntitySummary(entity: DescribedEntity): z.infer<typeof v1EntitySummary> {
  return {
    createdAt: entity.createdAt,
    description: entity.description,
    fields: { ...entity.fields },
    id: entity.id,
    links: entity.links.map(toV1EntityLink),
    name: entity.name ?? "",
    ownerId: entity.ownerId,
    partition: entity.partition,
    position: entity.position,
    rulesetId: entity.rulesetId,
    type: entity.type,
    updatedAt: entity.updatedAt,
  };
}

/** One of an entity's tables, a row a level (or a list), each row's own keys kept. */
export function toV1EntityTable(table: Answer<typeof EntitiesService.getEntityTable>): z.infer<typeof v1EntityTable> {
  return table.map((row) => ({ ...row }));
}

/** The modifiers an entity has, as its customization reads them. */
export function toV1LabeledModifiers(
  modifiers: Answer<typeof ModifiersService.getModifiers>,
): z.infer<typeof v1LabeledModifiers> {
  return modifiers.map((modifier) => ({
    ...toV1EntityModifier(modifier),
    targetLabels: modifier.targetLabels,
    valueLabel: modifier.valueLabel,
  }));
}

/** The requirements an entity has, as its customization reads them. */
export function toV1LabeledRequirements(
  requirements: Answer<typeof RequirementsService.getRequirements>,
): z.infer<typeof v1LabeledRequirements> {
  return requirements.map((requirement) => ({
    ...toV1Requirement(requirement),
    targetLabels: requirement.targetLabels,
    valueLabel: requirement.valueLabel,
  }));
}

/** An entity another owns. */
export function toV1OwnedEntity(
  owned: Omit<DescribedEntity, "name"> & {
    modifiers?: Modifier[];
    name: string | null;
    requirements?: Requirement[];
  },
): z.infer<typeof v1OwnedEntity> {
  return {
    ...toV1EntitySummary(owned),
    modifiers: owned.modifiers?.map(toV1EntityModifier),
    name: owned.name,
    requirements: owned.requirements?.map(toV1Requirement),
  };
}

/**
 * What an entity's levels give: each pool's picks by level, and past them the values its rules name in their
 * progression (`Engine.rules()`'s progression), as they give them.
 */
export function toV1Progression(progression: {
  pools: readonly { id: string; name: string; picks: Record<string, number> }[];
}): z.infer<typeof v1Progression> {
  const { pools, ...declared } = progression;
  return { ...declared, pools: pools.map(({ id, name, picks }) => ({ id, name, picks })) };
}

/** A requirement an entity has, or a group of them. */
export function toV1Requirement(requirement: Requirement): z.infer<typeof v1Requirement> {
  return {
    chainingOperator: requirement.chainingOperator,
    id: requirement.id,
    level: requirement.level,
    operator: requirement.operator,
    target: requirement.target,
    value: requirement.value,
    valueType: requirement.valueType,
  };
}

/** An entity as it's stored (a template's). */
export function toV1StoredEntity(
  entity: Answer<typeof EntitiesService.getTemplates>[number],
): z.infer<typeof v1StoredEntity> {
  return {
    description: entity.description,
    fields: { ...entity.fields },
    id: entity.id,
    links: { ...entity.links },
    name: entity.name,
    partition: entity.partition,
    type: entity.type,
  };
}
