import type { RulesetRawData, ViewKinds } from "@/engine/core/view/index.ts";

/** A ruleset's own rows of a kind (`type`), as the cache keeps them, typed by its module's registry. */
function kindRows<K extends keyof ViewKinds>(raw: RulesetRawData, type: K) {
  return (raw.entities[type] ?? []) as ViewKinds[K][];
}

/** A ruleset's own links of a role from entities of a kind (`type`, `role`), to a kind (`toType`) when it says. */
function linkRows(raw: RulesetRawData, type: string, role: string, toType?: string) {
  return [...raw.links.values()]
    .filter((held) => held.type === type)
    .flatMap((held) => held.links.filter((link) => link.role === role && (!toType || link.toType === toType)));
}

/**
 * A ruleset's own rows (`raw`, as the cache keeps them) as 3.5's lists: each kind's, typed, and its links by role
 * (`linksByRole`): its class levels' base bonuses to the saves (`baseBonus`), its classes' skills (`classSkill`), its
 * class levels' grants of feats and of spells (`grants`, by the granted kind), and the lists its feats and its spells
 * are on (`listedIn`, by the listed kind).
 */
export function rawLists(raw: RulesetRawData) {
  return {
    abilities: kindRows(raw, "abilities"),
    aptitudes: kindRows(raw, "aptitudes"),
    feats: kindRows(raw, "feats"),
    items: kindRows(raw, "items"),
    classes: kindRows(raw, "classes"),
    classLevels: kindRows(raw, "class-levels"),
    languages: kindRows(raw, "languages"),
    linksByRole: {
      baseBonus: linkRows(raw, "class-levels", "baseBonus"),
      classSkill: linkRows(raw, "classes", "classSkill"),
      grants: {
        feats: linkRows(raw, "class-levels", "grants", "feats"),
        spells: linkRows(raw, "class-levels", "grants", "spells"),
      },
      listedIn: { feats: linkRows(raw, "feats", "listedIn"), spells: linkRows(raw, "spells", "listedIn") },
    },
    mechanics: kindRows(raw, "mechanics"),
    spells: kindRows(raw, "spells"),
    races: kindRows(raw, "races"),
    saves: kindRows(raw, "saves"),
    skills: kindRows(raw, "skills"),
  };
}
