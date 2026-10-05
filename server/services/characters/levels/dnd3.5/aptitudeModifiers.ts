import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { parseLiteralValue } from "@/server/rulesets/universal/literalValue.ts";

/** Resolves aptitude-targeting modifiers (aptitudes.<slug>.allowed) for feats, grouped by feat ID. */
export function resolveAptitudeModifiers(featIds: string[], rulesetData: CachedRulesetData) {
  const result = new Map<string, { aptitudeId: string; value: number; operator: string }[]>();
  if (featIds.length === 0) return result;

  for (const featId of featIds) {
    const mods = rulesetData.modifiersBySource.get(featId);
    if (!mods) continue;
    for (const mod of mods) {
      if (mod.sourceType !== "feats") continue;
      const match = mod.target.match(/^aptitudes\.([a-z0-9]+)\.allowed$/);
      if (!match) continue;
      const resolvedAptitudeId = rulesetData.aptitudeIdBySlug.get(match[1]);
      const value = parseLiteralValue(mod.value, "number");
      if (!resolvedAptitudeId || typeof value !== "number") continue;

      let group = result.get(mod.sourceId);
      if (!group) {
        group = [];
        result.set(mod.sourceId, group);
      }
      group.push({ aptitudeId: resolvedAptitudeId, value, operator: mod.operator });
    }
  }

  return result;
}
