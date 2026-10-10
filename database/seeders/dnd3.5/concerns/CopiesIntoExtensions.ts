/**
 * An extension's book changes core feats and spells (its `cowFeats`, `cowSpells`): the extension copies each (copy on
 * write, `ContentSeeder`'s `CopiesOnWrite`) and changes its copy, a feat taken in more aptitudes and by more classes, a
 * spell on more spell lists.
 */

import { and, eq, like } from "drizzle-orm";

import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/content/dnd3.5/builders/rulesets/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import {
  aptitudesInRules,
  featsAptitudesInRules,
  powersAptitudesInRules,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Copying the core's feats and spells into an extension that changes them. */
export function CopiesIntoExtensions<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class CopyingIntoExtensions extends Base {
    /** A power's copy keeps its spell lists ("X Spells" aptitudes), at the same levels. */
    protected override async copyPowerLinks(fromId: string, toId: string) {
      const links = await this.db
        .select({
          aptitudeId: powersAptitudesInRules.aptitudeId,
          level: powersAptitudesInRules.level,
          aptitude: aptitudesInRules.name,
        })
        .from(powersAptitudesInRules)
        .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, powersAptitudesInRules.aptitudeId))
        .where(eq(powersAptitudesInRules.powerId, fromId));
      await this.linkPower(
        toId,
        links.filter(({ aptitude }) => /^(\w[\w ]*) Spells$/.test(aptitude)),
      );
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
        await this.insertAll(
          featsAptitudesInRules,
          entry.aptitudes
            .filter((aptitude) => this.ctx.aptMap[aptitude])
            .map((aptitude) => ({ featId: copyId, aptitudeId: this.ctx.aptMap[aptitude] })),
        );
      }
    }

    /**
     * Adds inherited spells to an extension's spell lists: it copies each first (a spell it has already copied, or
     * has its own of, it adds as is), keeping the original's spell lists.
     */
    async cowSpellsIntoExtension(entries: CowSpellEntry[]) {
      for (const entry of entries) {
        // A power of its own keeps the inherited one's spell lists too, as a copy does.
        const inheritedId = this.ctx.inheritedPowerMap[entry.spell];
        if (this.ctx.powerMap[entry.spell] && inheritedId)
          await this.copyPowerLinks(inheritedId, this.ctx.powerMap[entry.spell]);
        const powerId = await this.ownPower(entry.spell);
        if (!powerId) continue;
        await this.linkPower(
          powerId,
          entry.aptitudes
            .filter(({ aptitude }) => this.ctx.aptMap[aptitude])
            .map(({ aptitude, level }) => ({ aptitudeId: this.ctx.aptMap[aptitude], level })),
        );
      }
    }
  }
  return CopyingIntoExtensions;
}
