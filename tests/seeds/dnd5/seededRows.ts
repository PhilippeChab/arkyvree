import { DND5_RULESET_NAME } from "@/content/dnd5/rulesetNames.ts";
import type { RulesetRawData } from "@/engine/core/view/index.ts";
import type { Dnd5Kinds } from "@/engine/rulesets/dnd5/view/rows.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

/** A ruleset's own rows of a kind (`type`), as the cache keeps them, typed as D&D 5th Edition declares its kinds. */
function kindRows<K extends keyof Dnd5Kinds>(raw: RulesetRawData, type: K) {
  return (raw.entities[type] ?? []) as Dnd5Kinds[K][];
}

/** A ruleset's own links of a role from an entity (`fromId`, `role`). */
function linksOf(raw: RulesetRawData, fromId: string, role: string) {
  return (raw.links.get(fromId)?.links ?? []).filter((link) => link.role === role);
}

/**
 * The rows the seed wrote into the seeded D&D 5th Edition core rules ("Core SRD 5"), as the cache keeps them: each
 * kind's, an entity's links by role, its customizations, and lookups by name.
 */
export async function seededRows() {
  const ruleset = await Rulesets.findOne(db, { name: DND5_RULESET_NAME });
  if (!ruleset) throw new Error(`${DND5_RULESET_NAME} isn't seeded`);
  const raw = await RulesetViews.getRawData(ruleset.id);
  const rows = {
    abilities: kindRows(raw, "abilities"),
    aptitudes: kindRows(raw, "aptitudes"),
    backgrounds: kindRows(raw, "backgrounds"),
    classes: kindRows(raw, "classes"),
    classLevels: kindRows(raw, "class-levels"),
    feats: kindRows(raw, "feats"),
    items: kindRows(raw, "items"),
    languages: kindRows(raw, "languages"),
    saves: kindRows(raw, "saves"),
    skills: kindRows(raw, "skills"),
    species: kindRows(raw, "species"),
    spells: kindRows(raw, "spells"),
  };
  const named = <T extends { name: string }>(list: T[], name: string) => {
    const row = list.find((r) => r.name === name);
    if (!row) throw new Error(`${name} isn't seeded in ${DND5_RULESET_NAME}`);
    return row;
  };
  const namesById = new Map(
    Object.values(raw.entities).flatMap((entities) => entities.map(({ id, name }) => [id, name] as const)),
  );
  return {
    ...rows,
    raw,
    ruleset,
    aptitude: (name: string) => named(rows.aptitudes, name),
    background: (name: string) => named(rows.backgrounds, name),
    klass: (name: string) => named(rows.classes, name),
    /** A class's level `level`. */
    classLevel: (klass: string, level: number) => {
      const { id } = named(rows.classes, klass);
      return rows.classLevels.find((l) => l.ownerId === id && l.position === level)!;
    },
    feat: (name: string) => named(rows.feats, name),
    /** An entity's links of a role, each the name of the entity it links to (and of its pool, a grant's). */
    linkedNames: (fromId: string, role: string) =>
      linksOf(raw, fromId, role).map(({ toId, viaId }) =>
        viaId ? `${namesById.get(toId)} via ${namesById.get(viaId)}` : namesById.get(toId),
      ),
    /** An entity's links of a role, as stored. */
    linksOf: (fromId: string, role: string) => linksOf(raw, fromId, role),
    modifiersOf: (sourceId: string) => raw.modifiers.filter((m) => m.sourceId === sourceId),
    nameOf: (id: string) => namesById.get(id),
    requirementsOf: (entityId: string) => raw.requirements.filter((r) => r.entityId === entityId),
    speciesNamed: (name: string) => named(rows.species, name),
    spell: (name: string) => named(rows.spells, name),
  };
}
