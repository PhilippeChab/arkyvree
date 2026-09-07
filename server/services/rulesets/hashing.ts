import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

interface EntityCustomizations {
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
  modifierRequirements: Requirement[];
}

interface KlassRelationships {
  levels: { level: number; id: string }[];
  levelSaves: { klassLevelId: string; saveId: string; base: number }[];
  levelFeats: { id: string; klassLevelId: string; featId: string; aptitudeId: string; free: boolean }[];
  levelPowers: { klassLevelId: string; powerId: string; aptitudeId: string; free: boolean }[];
  klassSkills: { klassId: string; skillId: string }[];
}

type EntityType =
  | "abilities"
  | "saves"
  | "skills"
  | "feats"
  | "powers"
  | "items"
  | "races"
  | "languages"
  | "klasses"
  | "aptitudes"
  | "mechanics";

// Fields to exclude from hashing — metadata and FK references whose UUIDs differ across forks
const EXCLUDED_FIELDS = new Set([
  "id",
  "rulesetId",
  "campaignId",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "abilityId",
  "primaryAbilityId",
]);

function sortByKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

function extractContentFields(entity: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (!EXCLUDED_FIELDS.has(key) && isPrimitive(value)) {
      content[key] = value;
    }
  }
  return sortByKeys(content);
}

function sortedModifiers(modifiers: Modifier[]) {
  return [...modifiers]
    .sort((a, b) => {
      const cmp = a.target.localeCompare(b.target);
      if (cmp !== 0) return cmp;
      return a.sourceType.localeCompare(b.sourceType);
    })
    .map((m) => ({
      target: m.target,
      value: m.value,
      valueType: m.valueType,
      operator: m.operator,
      sourceType: m.sourceType,
    }));
}

function sortedProperties(properties: Property[]) {
  return [...properties]
    .sort((a, b) => {
      const cmp = a.type.localeCompare(b.type);
      if (cmp !== 0) return cmp;
      return a.value.localeCompare(b.value);
    })
    .map((p) => ({
      type: p.type,
      value: p.value,
      description: p.description,
      entityType: p.entityType,
    }));
}

function sortedRequirements(requirements: Requirement[]) {
  return [...requirements]
    .sort((a, b) => {
      const cmp = a.level.localeCompare(b.level);
      if (cmp !== 0) return cmp;
      return (a.target ?? "").localeCompare(b.target ?? "");
    })
    .map((r) => ({
      level: r.level,
      target: r.target,
      value: r.value,
      valueType: r.valueType,
      operator: r.operator,
      chainingOperator: r.chainingOperator,
      entityType: r.entityType,
    }));
}

function hashCustomizations(customizations: EntityCustomizations) {
  return {
    modifiers: sortedModifiers(customizations.modifiers),
    properties: sortedProperties(customizations.properties),
    requirements: sortedRequirements(customizations.requirements),
    modifierRequirements: sortedRequirements(customizations.modifierRequirements),
  };
}

// Normalize feat aptitude associations — strip UUIDs, sort by aptitude name
function hashFeatAptitudes(entity: Record<string, unknown>): string[] {
  const associations = entity.featsAptitudesInRules;
  if (!Array.isArray(associations)) return [];
  return associations
    .map((a: Record<string, unknown>) => {
      const apt = a.aptitudesInRule as Record<string, unknown> | undefined;
      return (apt?.name as string) ?? "";
    })
    .sort();
}

// Normalize power aptitude associations — strip UUIDs, sort by aptitude name
function hashPowerAptitudes(entity: Record<string, unknown>): { aptitude: string; level: number | null }[] {
  const associations = entity.powersAptitudesInRules;
  if (!Array.isArray(associations)) return [];
  return associations
    .map((a: Record<string, unknown>) => {
      const apt = a.aptitudesInRule as Record<string, unknown> | undefined;
      return {
        aptitude: (apt?.name as string) ?? "",
        level: (a.level as number | null) ?? null,
      };
    })
    .sort((a, b) => a.aptitude.localeCompare(b.aptitude));
}

export function hashEntity(
  entityType: EntityType,
  entity: Record<string, unknown>,
  customizations: EntityCustomizations,
  klassRelationships?: KlassRelationships,
): string {
  const content = extractContentFields(entity);

  // For items, hash sourceItemId as a boolean flag (the actual ID differs across rulesets)
  if (entityType === "items" && "sourceItemId" in content) {
    content.hasSourceItem = !!content.sourceItemId;
    delete content.sourceItemId;
  }

  // For powers, hash saveId as a boolean flag (the actual ID differs across rulesets)
  if (entityType === "powers" && "saveId" in content) {
    content.hasSave = !!content.saveId;
    delete content.saveId;
  }

  // For races/klasses, hash parentId as a boolean flag (the actual ID differs across rulesets)
  if ((entityType === "races" || entityType === "klasses") && "parentId" in content) {
    content.hasParent = !!content.parentId;
    delete content.parentId;
  }

  const hashInput: Record<string, unknown> = {
    fields: content,
    customizations: hashCustomizations(customizations),
  };

  // For feats, include normalized aptitude associations
  if (entityType === "feats" && "featsAptitudesInRules" in entity) {
    hashInput.featAptitudes = hashFeatAptitudes(entity);
  }

  // For powers, include normalized aptitude associations
  if (entityType === "powers" && "powersAptitudesInRules" in entity) {
    hashInput.powerAptitudes = hashPowerAptitudes(entity);
  }

  // For klasses, include the level structure
  if (entityType === "klasses" && klassRelationships) {
    const levelMap = new Map<string, number>();
    for (const level of klassRelationships.levels) {
      levelMap.set(level.id, level.level);
    }

    hashInput.levels = klassRelationships.levels
      .sort((a, b) => a.level - b.level)
      .map((l) => ({ level: l.level }));

    // Strip FK IDs from relationship hashing — UUIDs differ across forks
    hashInput.levelSaves = klassRelationships.levelSaves
      .sort((a, b) => {
        const levelA = levelMap.get(a.klassLevelId) ?? 0;
        const levelB = levelMap.get(b.klassLevelId) ?? 0;
        const cmp = levelA - levelB;
        if (cmp !== 0) return cmp;
        return a.base - b.base;
      })
      .map((ls) => ({
        level: levelMap.get(ls.klassLevelId),
        base: ls.base,
      }));

    hashInput.levelFeats = klassRelationships.levelFeats
      .sort((a, b) => {
        const levelA = levelMap.get(a.klassLevelId) ?? 0;
        const levelB = levelMap.get(b.klassLevelId) ?? 0;
        return levelA - levelB;
      })
      .map((lf) => ({
        level: levelMap.get(lf.klassLevelId),
        free: lf.free,
      }));

    hashInput.levelPowers = klassRelationships.levelPowers
      .sort((a, b) => {
        const levelA = levelMap.get(a.klassLevelId) ?? 0;
        const levelB = levelMap.get(b.klassLevelId) ?? 0;
        return levelA - levelB;
      })
      .map((lp) => ({
        level: levelMap.get(lp.klassLevelId),
        free: lp.free,
      }));

    hashInput.klassSkillCount = klassRelationships.klassSkills.length;
  }

  const json = JSON.stringify(hashInput);
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(json);
  return hash.digest("hex");
}

export type { EntityCustomizations, EntityType, KlassRelationships };
