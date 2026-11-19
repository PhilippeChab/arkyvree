/**
 * The core rules' v2 reaching the rows v1 seeded, and the forks' own copies of them: a weapon's proficiency and an
 * armor's or the Shield's training the item's requirements, Martial Arts' Dexterity a feat's field, as 3.5's proficiency
 * and Weapon Finesse are, in place of the feats' modifiers that set them.
 */

import { and, eq, inArray } from "drizzle-orm";

import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import type { Dnd5ItemSeed } from "@/content/dnd5/builders/items/types.ts";
import { Entities, type Ids } from "@/database/seeders/core/SeederState.ts";
import type { Dnd5ContentSeeder } from "@/database/seeders/dnd5/Dnd5ContentSeeder.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { FEAT_MARTIAL_ARTS } from "@/vocabulary/dnd5/fields/index.ts";

/**
 * The targets a feat's modifier set before a weapon's proficiency, an armor's or the Shield's training and Martial Arts'
 * Dexterity were an item's requirements and a feat's field: what the core rules' v2 removes. A mastery stays one, on
 * its weapon's group, as 3.5's Weapon Focus is.
 */
const SETTLED_TARGET = /^items\.weapons\.[^.]+\.(proficient|finesse)$|^combat\.armortraining\./;

/** The feat fields a weapon rule is (Martial Arts' flag), which the core rules' v2 writes. */
const WEAPON_RULE_FIELDS = [FEAT_MARTIAL_ARTS] as const;

/** Bringing the ruleset's weapon rules, and the forks' copies of them, up to what the core rules' v2 made them. */
export function UpdatesWeaponRules<B extends Constructor<Dnd5ContentSeeder>>(Base: B) {
  abstract class UpdatingWeaponRules extends Base {
    /**
     * Gives each feat (`feats`: its id and its content's fields) the weapon rule fields its content gives that it
     * lacks, as 3.5's updates add only what's missing. Safe to run again.
     */
    async addWeaponRuleFields(feats: { fields: FeatSeed["fields"]; id: string }[]) {
      const given = feats.filter(({ fields }) => WEAPON_RULE_FIELDS.some((field) => fields?.[field] !== undefined));
      if (given.length === 0) return;
      const records = new Map(
        (await Entities.findMany(this.db, { entityType: "feats", ids: given.map(({ id }) => id) })).map((record) => [
          record.id,
          record,
        ]),
      );
      for (const { fields, id } of given) {
        const write: Record<string, boolean> = {};
        for (const field of WEAPON_RULE_FIELDS) {
          const value = fields?.[field];
          if (value !== undefined && records.get(id)?.fields[field] === undefined) write[field] = value;
        }
        if (Object.keys(write).length > 0)
          await Entities.update(this.db, this.baseRules, "feats", { fields: write }, { id });
      }
    }

    /**
     * Deletes the modifiers of feats (`featIds`) whose targets a weapon rule settles now (`SETTLED_TARGET`), with their
     * own requirements: their name bindings go with them. Safe to run again.
     */
    async dropSettledModifiers(featIds: string[]) {
      if (featIds.length === 0) return;
      const modifiers = await this.db
        .select({ id: modifiersInCustomization.id, target: modifiersInCustomization.target })
        .from(modifiersInCustomization)
        .where(
          and(eq(modifiersInCustomization.sourceType, "feats"), inArray(modifiersInCustomization.sourceId, featIds)),
        );
      const ids = modifiers.filter(({ target }) => SETTLED_TARGET.test(target)).map(({ id }) => id);
      if (ids.length === 0) return;
      await this.db
        .delete(requirementsInCustomization)
        .where(
          and(
            eq(requirementsInCustomization.entityType, "modifiers"),
            inArray(requirementsInCustomization.entityId, ids),
          ),
        );
      await this.db.delete(modifiersInCustomization).where(inArray(modifiersInCustomization.id, ids));
    }

    /**
     * Gives each item (`items`: its id and its content's requirements) its requirements, when it has none yet: a fork's
     * copy it gave its own keeps them. Safe to run again.
     */
    async requireProficiency(items: { id: string; requirements: Dnd5ItemSeed["requirements"] }[]) {
      const required = items.filter(({ requirements }) => (requirements ?? []).length > 0);
      if (required.length === 0) return;
      const held = await this.db
        .select({ entityId: requirementsInCustomization.entityId })
        .from(requirementsInCustomization)
        .where(
          inArray(
            requirementsInCustomization.entityId,
            required.map(({ id }) => id),
          ),
        );
      const has = new Set(held.map(({ entityId }) => entityId));
      await this.insertAll(
        requirementsInCustomization,
        required
          .filter(({ id }) => !has.has(id))
          .flatMap(({ id, requirements }) => this.requirementRows(id, "items", requirements)),
      );
    }

    /**
     * The ruleset's entities of a kind (`type`) its content names (`seeds`, by name: `ids`), each with its seed, and the
     * forks' copies of them, each with its source's seed.
     */
    async withForkCopies<S extends { name: string }>(type: string, seeds: S[], ids: Ids) {
      const own = seeds.filter(({ name }) => ids[name]).map((seed) => ({ id: ids[seed.name], seed }));
      const seedOf = new Map(own.map(({ id, seed }) => [id, seed]));
      const copies = (await this.findForkCopies(type)).flatMap(({ copyId, sourceId }) => {
        const seed = seedOf.get(sourceId);
        return seed ? [{ id: copyId, seed }] : [];
      });
      return [...own, ...copies];
    }
  }
  return UpdatingWeaponRules;
}
