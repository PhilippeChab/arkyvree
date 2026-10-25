/**
 * An extension's book changes core feats and spells (its `cowFeats`, `cowSpells`): the extension copies each (copy on
 * write, `ContentSeeder`'s `CopiesOnWrite`) and changes its copy, a feat taken in more aptitudes and by more classes, a
 * spell on more spell lists.
 */

import { and, eq, inArray, like } from "drizzle-orm";

import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/content/dnd3.5/builders/rulesets/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { entitiesInRules, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

import type { SpellLink } from "./CopiesOnWrite.ts";

/** Copying the core's feats and spells into an extension that changes them. */
export function CopiesIntoExtensions<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class CopyingIntoExtensions extends Base {
    /**
     * The links each spell's copy keeps of its original's (`fromIds`), by the original's id: its spell lists ("X Spells"
     * aptitudes), at their levels.
     */
    protected override async keptSpellLinks(fromIds: string[]) {
      const links = await this.listedIn(fromIds);
      const aptitudeIds = [...new Set(links.map((link) => link.toId))];
      const names = new Map(
        aptitudeIds.length === 0
          ? []
          : (
              await this.db
                .select({ id: entitiesInRules.id, name: entitiesInRules.name })
                .from(entitiesInRules)
                .where(inArray(entitiesInRules.id, aptitudeIds))
            ).map((aptitude) => [aptitude.id, aptitude.name ?? ""]),
      );
      const kept = new Map<string, SpellLink[]>();
      for (const { fromId, tier, toId } of links) {
        if (!/^(\w[\w ]*) Spells$/.test(names.get(toId) ?? "")) continue;
        kept.set(fromId, [...(kept.get(fromId) ?? []), { aptitudeId: toId, level: tier }]);
      }
      return kept;
    }

    /**
     * Adds class levels to a feat's first-level `or` of requirements, which a single first-level requirement becomes.
     * A feat with neither gets none.
     */
    private async addClassLevelAlternatives(featId: string, classLevels: CowFeatEntry["requirements"]) {
      if (classLevels.length === 0) return;
      const requirements = await this.db
        .select()
        .from(requirementsInCustomization)
        .where(eq(requirementsInCustomization.entityId, featId));
      const topLevel = requirements.filter((r) => /^\d+$/.test(r.level));
      let group = topLevel.find((r) => !r.target && r.chainingOperator === "or");
      if (!group) {
        const single = topLevel.find((r) => r.target && !r.chainingOperator);
        if (!single) return;
        await this.db
          .update(requirementsInCustomization)
          .set({ target: null, operator: null, value: null, valueType: null, chainingOperator: "or" })
          .where(eq(requirementsInCustomization.id, single.id));
        await this.db.insert(requirementsInCustomization).values({
          entityId: featId,
          entityType: "feats",
          level: `${single.level}.1`,
          target: single.target,
          operator: single.operator,
          value: single.value,
          valueType: single.valueType,
        });
        group = single;
      }

      const children = await this.db
        .select({ level: requirementsInCustomization.level })
        .from(requirementsInCustomization)
        .where(
          and(
            eq(requirementsInCustomization.entityId, featId),
            like(requirementsInCustomization.level, `${group.level}.%`),
          ),
        );
      const next = Math.max(0, ...children.map((r) => Number(r.level.split(".").pop()))) + 1;
      await this.db.insert(requirementsInCustomization).values(
        classLevels.map(({ className, level }, i) => ({
          entityId: featId,
          entityType: "feats",
          level: `${group.level}.${next + i}`,
          ...gte(`classes.${className}.level`, level),
        })),
      );
    }

    /**
     * Copies the inherited feats an extension changes: each is taken in more aptitudes, and more class levels qualify
     * for it (added to its `or` of requirements). Its classes then grant the copy.
     */
    async cowFeatsIntoExtension(entries: CowFeatEntry[]) {
      for (const entry of entries) {
        const featId = this.ctx.featMap[entry.feat];
        if (!featId) continue;
        const copyId = await this.cowFeat(featId);
        this.ctx.featMap[entry.feat] = copyId;
        await this.addClassLevelAlternatives(copyId, entry.requirements);
        await this.insertListings(
          "feats",
          entry.aptitudes
            .filter((aptitude) => this.ctx.aptMap[aptitude])
            .map((aptitude) => ({ entityId: copyId, aptitudeId: this.ctx.aptMap[aptitude] })),
        );
      }
    }

    /**
     * Adds inherited spells to an extension's spell lists: it copies each first (a spell it has already copied, or
     * has its own of, it adds as is), keeping the original's spell lists.
     */
    async cowSpellsIntoExtension(entries: CowSpellEntry[]) {
      // Each spell's lists, an entry's after the one before it of the same spell
      const bySpell = new Map<string, SpellLink[]>();
      for (const entry of entries) {
        const links = entry.aptitudes
          .filter(({ aptitude }) => this.ctx.aptMap[aptitude])
          .map(({ aptitude, level }) => ({ aptitudeId: this.ctx.aptMap[aptitude], level }));
        bySpell.set(entry.spell, [...(bySpell.get(entry.spell) ?? []), ...links]);
      }
      const spells = [...bySpell].map(([spell, links]) => ({
        spell,
        links,
        inheritedId: this.ctx.inheritedSpellMap[spell] as string | undefined,
        ownId: this.ctx.spellMap[spell] as string | undefined,
      }));
      // A spell of its own keeps the inherited one's spell lists too, as a copy does
      const owned = spells.filter((spell) => spell.ownId);
      const kept = await this.keptSpellLinks(owned.flatMap(({ inheritedId }) => (inheritedId ? [inheritedId] : [])));
      await this.linkSpells(
        owned.map(({ inheritedId, links, ownId }) => ({
          spellId: ownId!,
          links: [...((inheritedId && kept.get(inheritedId)) || []), ...links],
        })),
      );
      const inherited = spells.filter((spell) => !spell.ownId && spell.inheritedId);
      const copies = await this.cowSpells(
        inherited.map(({ inheritedId, links }) => ({ spellId: inheritedId!, links })),
      );
      for (const { inheritedId, spell } of inherited) this.ctx.spellMap[spell] = copies.get(inheritedId!)!;
    }
  }
  return CopyingIntoExtensions;
}
