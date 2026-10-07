import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import type PathTraverser from "@/server/rulesets/engine/paths/PathTraverser.ts";
import { readHolder } from "@/server/rulesets/engine/paths/readHolder.ts";
import type { Holders, TraversePathResult } from "@/server/rulesets/engine/types.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { WEAPON_PATH_ROOTS } from "./WeaponsComponent.ts";

/**
 * An item's own weapon's target paths (weapon.tohit.* / weapon.damage.* / weapon.wielded): the weapon slots holding
 * its source, the item (its modifiers), or one entry of it (a weapon's proficiency).
 */
export default class WeaponPaths implements PathCategory {
  readonly name = "weapon";
  readonly label = "Weapon";
  readonly description = "On an item: its own weapon's to-hit, damage, and how it's wielded, wherever it's held";
  readonly pathDescriptions = {
    "weapon.tohit": "Attack roll bonuses of the item's own weapon",
    "weapon.damage": "Damage roll bonuses of the item's own weapon",
    "weapon.damage.critical": "Critical hit properties",
  };

  /** Whether a target is an item's own weapon's (`weapon.tohit.misc`, `weapon.wielded`): the slots holding the item. */
  readsSource(target: string): boolean {
    const [, sub] = target.split(".");
    return WEAPON_PATH_ROOTS.includes(sub);
  }

  /** The weapon slots holding the source's item or entry. Null for a path no weapon root starts. */
  resolve(
    target: string,
    rest: string[],
    holders: Holders,
    traverser: PathTraverser,
    context?: { sourceId?: string },
  ): TraversePathResult[] | null {
    if (!this.readsSource(target)) return null;
    const sourceId = context?.sourceId;
    if (!sourceId) return [];
    const combatHolder = holders["combat"];
    if (!combatHolder) return [];
    const weaponsHolder = holders["weapons"];
    if (!weaponsHolder) return [];

    const combat = readHolder(combatHolder, "getCombat");
    if (!isRecord(combat) || !isRecord(combat.weaponsets)) return [];
    const results: TraversePathResult[] = [];
    for (const weaponSet of Object.values(combat.weaponsets)) {
      for (const [, weapon] of Object.entries(weaponSet as Record<string, unknown>)) {
        // Its item's (a modifier's source), or its entry's (a proficiency read of the entry holding it)
        const held = weapon as { itemId?: string | null; entryId?: string | null } | null;
        if (held && typeof held === "object" && (held.itemId === sourceId || held.entryId === sourceId)) {
          results.push(...traverser.traverse(weaponsHolder, rest, weapon, rest[0], 0, ["weapon"]));
        }
      }
    }
    return results;
  }
}
