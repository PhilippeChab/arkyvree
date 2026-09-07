import type { Db } from "@/server/database/index.ts";
import type { ClassLevelsHooks } from "@/server/rulesets/hooks/ClassLevelsHooks.ts";
import type { PropertyRecord } from "@/server/rulesets/hooks/SkillsHooks.ts";
import { Properties } from "@/server/repositories/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/utils.ts";

export class Dnd35ClassLevelsHooks implements ClassLevelsHooks {
  buildProperties(
    levelId: string,
    body: { bab: number; skills: number },
  ): PropertyRecord[] {
    const { bab, skills } = body;

    return [
      {
        entityId: levelId,
        entityType: "klass_levels",
        type: KLASS_LEVEL_BAB,
        value: String(bab),
      },
      {
        entityId: levelId,
        entityType: "klass_levels",
        type: KLASS_LEVEL_SKILL_POINTS,
        value: String(skills),
      },
    ];
  }

  enrichWithProperties<T extends { id: string }>(
    levels: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & { bab: number; skills: number })[] {
    const propsByLevelId = new Map<string, { bab: number; skills: number }>();

    for (const prop of properties) {
      let entry = propsByLevelId.get(prop.entityId);
      if (!entry) {
        entry = { bab: 0, skills: 0 };
        propsByLevelId.set(prop.entityId, entry);
      }
      if (prop.type === KLASS_LEVEL_BAB) {
        entry.bab = Number(prop.value);
      }
      if (prop.type === KLASS_LEVEL_SKILL_POINTS) {
        entry.skills = Number(prop.value);
      }
    }

    return levels.map((level) => {
      const props = propsByLevelId.get(level.id);
      return {
        ...level,
        bab: props?.bab ?? 0,
        skills: props?.skills ?? 0,
      };
    });
  }

  async syncProperties(tx: Db, levelId: string, body: { bab: number; skills: number }): Promise<void> {
    await Properties.deleteMany(tx, { entityIds: [levelId], entityType: "klass_levels" });

    const records = this.buildProperties(levelId, body);
    await Properties.createMany(tx, records);
  }

  readCurrentValues(
    properties: { type: string; value: string }[],
  ): { bab: number; skills: number } {
    let bab = 0;
    let skills = 0;
    for (const prop of properties) {
      if (prop.type === KLASS_LEVEL_BAB) bab = Number(prop.value);
      if (prop.type === KLASS_LEVEL_SKILL_POINTS) skills = Number(prop.value);
    }
    return { bab, skills };
  }

  enrichWithSpellsPerDay<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { sourceId: string; target: string; value: string; operator: string }[],
  ): (T & { spellsPerDay: Record<number, number> })[] {
    const spellsRegex = /^aptitudes\.\w+\.(\d+)\.uses$/;

    // Build a map of levelId → { [spellLevel]: delta }
    const deltasByLevelId = new Map<string, Record<number, number>>();
    for (const mod of modifiers) {
      const match = spellsRegex.exec(mod.target);
      if (!match) continue;
      const spellLevel = Number(match[1]);
      let entry = deltasByLevelId.get(mod.sourceId);
      if (!entry) {
        entry = {};
        deltasByLevelId.set(mod.sourceId, entry);
      }
      entry[spellLevel] = (entry[spellLevel] ?? 0) + Number(mod.value);
    }

    // Sort levels ascending by level number
    const sorted = [...levels].sort((a, b) => a.level - b.level);

    // Walk levels in order, keeping cumulative totals
    const cumulative: Record<number, number> = {};
    const resultMap = new Map<string, Record<number, number>>();
    for (const level of sorted) {
      const deltas = deltasByLevelId.get(level.id);
      if (deltas) {
        for (const [sl, delta] of Object.entries(deltas)) {
          cumulative[Number(sl)] = (cumulative[Number(sl)] ?? 0) + delta;
        }
      }
      resultMap.set(level.id, { ...cumulative });
    }

    return levels.map((level) => ({
      ...level,
      spellsPerDay: resultMap.get(level.id) ?? {},
    }));
  }

  enrichWithSpellsKnown<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { sourceId: string; target: string; value: string; operator: string }[],
  ): (T & { spellsKnown: Record<number, number | "All"> })[] {
    const knownRegex = /^aptitudes\.\w+\.(\d+)\.allowed$/;

    // Build a map of levelId → { [spellLevel]: { delta, operator } }[]
    const deltasByLevelId = new Map<string, { spellLevel: number; delta: number; operator: string }[]>();
    for (const mod of modifiers) {
      const match = knownRegex.exec(mod.target);
      if (!match) continue;
      const spellLevel = Number(match[1]);
      let entry = deltasByLevelId.get(mod.sourceId);
      if (!entry) {
        entry = [];
        deltasByLevelId.set(mod.sourceId, entry);
      }
      entry.push({ spellLevel, delta: Number(mod.value), operator: mod.operator });
    }

    // Sort levels ascending by level number
    const sorted = [...levels].sort((a, b) => a.level - b.level);

    // Walk levels in order, keeping cumulative totals
    const cumulative: Record<number, number | "All"> = {};
    const resultMap = new Map<string, Record<number, number | "All">>();
    for (const level of sorted) {
      const deltas = deltasByLevelId.get(level.id);
      if (deltas) {
        for (const { spellLevel, delta, operator } of deltas) {
          if (operator === "set" && delta === -1) {
            cumulative[spellLevel] = "All";
          } else if (cumulative[spellLevel] !== "All") {
            cumulative[spellLevel] = ((cumulative[spellLevel] as number) ?? 0) + delta;
          }
        }
      }
      resultMap.set(level.id, { ...cumulative });
    }

    return levels.map((level) => ({
      ...level,
      spellsKnown: resultMap.get(level.id) ?? {},
    }));
  }

  enrichWithFeatPools<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { sourceId: string; target: string; value: string; operator: string }[],
    aptitudes: { name: string }[],
  ): (T & { featPools: Record<string, number> })[] {
    const featPoolRegex = /^aptitudes\.(\w+)\.allowed$/;

    // Build slug → display name map from aptitudes
    const slugToName = new Map<string, string>();
    for (const apt of aptitudes) {
      slugToName.set(stripSeparators(apt.name), apt.name);
    }

    // Build levelId → { [aptitudeName]: delta } map
    const deltasByLevelId = new Map<string, Record<string, number>>();
    for (const mod of modifiers) {
      const match = featPoolRegex.exec(mod.target);
      if (!match) continue;
      const slug = stripSeparators(match[1]);
      const name = slugToName.get(slug);
      if (!name) continue;
      let entry = deltasByLevelId.get(mod.sourceId);
      if (!entry) {
        entry = {};
        deltasByLevelId.set(mod.sourceId, entry);
      }
      entry[name] = (entry[name] ?? 0) + Number(mod.value);
    }

    // Sort levels ascending by level number
    const sorted = [...levels].sort((a, b) => a.level - b.level);

    // Walk levels in order, keeping cumulative totals
    const cumulative: Record<string, number> = {};
    const resultMap = new Map<string, Record<string, number>>();
    for (const level of sorted) {
      const deltas = deltasByLevelId.get(level.id);
      if (deltas) {
        for (const [name, delta] of Object.entries(deltas)) {
          cumulative[name] = (cumulative[name] ?? 0) + delta;
        }
      }
      resultMap.set(level.id, { ...cumulative });
    }

    return levels.map((level) => ({
      ...level,
      featPools: resultMap.get(level.id) ?? {},
    }));
  }
}
