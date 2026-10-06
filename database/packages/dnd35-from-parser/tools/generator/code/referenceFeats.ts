/** What a feat reference makes: its feats by feat type, and its template families. */

import type { TemplateFamily } from "@/database/packages/dnd35-from-parser/tools/generator/code/FeatsFile.ts";
import { buildCompanionGrantModifiers } from "@/database/packages/dnd35-from-parser/tools/grants.ts";
import { normalizeName, toCamelCase } from "@/database/packages/dnd35-from-parser/tools/names.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";

type FeatEntry = {
  entry: FeatReference["raw"][number];
  detected: FeatReference["detected"][string];
  mapped: FeatReference["mapping"][string];
};

/**
 * What a feat reference makes: its feats by feat type, and its template families. An epic feat is left out unless an
 * override keeps it.
 */
export function buildReferenceFeats(ref: FeatReference) {
  const kept: FeatEntry[] = [];
  for (const entry of ref.raw) {
    const mapped = ref.mapping[entry.name];
    if (!mapped || mapped.skip) continue;
    if (entry.featType === "epic" && ref.overrides?.[entry.name]?.skip !== false) continue;
    kept.push({ entry, detected: ref.detected[entry.name], mapped });
  }

  const byType = new Map<string, FeatSeed[]>();
  const templates: TemplateFamily[] = [];
  for (const { entry, detected, mapped } of kept) {
    if (mapped.template) {
      const { type, familyName } = mapped.template;
      templates.push({
        type,
        constName: toCamelCase(familyName),
        familyName,
        aptitudes: mapped.aptitudes ?? [],
        requirements: mapped.requirements ?? [],
        featNameMap: { ...(detected?.featNameMap ?? {}), ...(mapped.featNameMap ?? {}) },
        modifiers: mapped.modifiers ?? [],
        description: mapped.description ?? entry.benefit,
      });
      continue;
    }
    const name = normalizeName(entry.name);
    const feats = byType.get(entry.featType) ?? [];
    byType.set(entry.featType, feats);
    feats.push({
      name,
      description: normalizeDescription(mapped.description ?? entry.benefit),
      ...(mapped.stackable ? { stackable: true } : {}),
      ...(mapped.selectable === false ? { selectable: false } : {}),
      aptitudes: mapped.aptitudes ?? [],
      requirements: mapped.requirements ?? [],
      modifiers: [
        ...(mapped.modifiers ?? []),
        ...buildCompanionGrantModifiers(name, mapped.description ?? entry.benefit ?? ""),
      ],
      properties: mapped.properties ?? [],
    });
  }
  return {
    byType,
    templates,
    templateNames: new Set(kept.filter(({ mapped }) => mapped.template).map(({ entry }) => entry.name)),
  };
}
