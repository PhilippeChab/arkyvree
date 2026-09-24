import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { GeneratedFeatDefinition, GeneratedFeatsHooks } from "@/server/rulesets/hooks/GeneratedFeatsHooks.ts";
import { FEAT_FAMILY, SPELL_SCHOOL, WEAPON_TYPE } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { GeneratedFeatSource } from "@/shared/rulesets/generatedFeats.ts";
import { stripSeparators } from "@/shared/utils.ts";

export class Dnd35GeneratedFeatsHooks implements GeneratedFeatsHooks {
  readonly entityTypes = ["skills", "powers", "items"];
  readonly propertyTypes = [SPELL_SCHOOL, WEAPON_TYPE];
  source(entityType: string, entity: { id: string; name: string }, properties: { type: string; value: string | null }[]): GeneratedFeatSource | null {
    if (entityType === "skills") return { kind: "skills", key: entity.id, label: entity.name };
    const propertyType = entityType === "powers" ? SPELL_SCHOOL : entityType === "items" ? WEAPON_TYPE : null;
    const label = properties.find(property => property.type === propertyType)?.value;
    if (!label) return null;
    return { kind: propertyType!, key: stripSeparators(label), label };
  }

  hasOtherSources(data: CachedRulesetData, source: GeneratedFeatSource, excludedEntityId: string): boolean {
    if (source.kind === "skills") return false;
    const entities = source.kind === SPELL_SCHOOL ? data.powers : source.kind === WEAPON_TYPE ? data.items : [];
    return entities.some(entity => {
      if (data.canonicalize(entity.id) === data.canonicalize(excludedEntityId)) return false;
      const properties = data.propertiesByEntity.get(entity.id) ?? [];
      const own = properties.find(property => property.type === source.kind);
      if (!own && "sourceItemId" in entity && entity.sourceItemId
        && data.canonicalize(entity.sourceItemId) === data.canonicalize(excludedEntityId)) return false;
      const inherited = "sourceItemId" in entity && entity.sourceItemId
        ? data.propertiesByEntity.get(entity.sourceItemId)?.find(property => property.type === source.kind) : undefined;
      return stripSeparators(own?.value ?? inherited?.value ?? "") === source.key;
    });
  }

  definitions(source: GeneratedFeatSource): GeneratedFeatDefinition[] {
    if (source.kind === "skills") return [{
      family: "Skill Focus", name: `Skill Focus: ${source.label}`,
      description: `You get a +3 bonus on all ${source.label} checks.`, aptitudes: ["General"],
      modifiers: [{ target: `skills.${stripSeparators(source.label)}.misc`, operator: "add", value: "3", valueType: "number" }],
      properties: [{ type: FEAT_FAMILY, value: "Skill Focus" }],
    }];
    if (source.kind === SPELL_SCHOOL) return ["Spell Focus", "Greater Spell Focus"].map(family => ({
      family, name: `${family}: ${source.label}`, aptitudes: ["General"],
      description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${source.label}.`
        + (family === "Greater Spell Focus" ? " This bonus stacks with Spell Focus." : ""),
      modifiers: [{ target: `powers.groups.${source.key}.*.dc.misc`, operator: "add", value: "1", valueType: "number" }],
      properties: [{ type: FEAT_FAMILY, value: family }],
      requirements: family === "Greater Spell Focus" ? [{
        level: "1", target: `feats.spellfocus${source.key}.possessed`, operator: "equal", value: "true", valueType: "boolean",
      }] : [],
    }));
    // Weapon families are supplied by content packages. Their identity and
    // COW cleanup/restore use the same lifecycle; editing an item doesn't seed new families.
    return [];
  }
}
