/**
 * An extension changes an inherited feat or power the way a fork does: it copies it (copy on write) and records the
 * copy in `entity_snapshots`, so the ruleset shows the copy in place of the original.
 */

import { and, eq, like } from "drizzle-orm";

import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/types.ts";
import type { SeederState } from "@/database/packages/dnd35/seed/SeederState.ts";
import {
  aptitudesInRules,
  entitySnapshotsInRules,
  featsAptitudesInRules,
  featsInRules,
  modifiersInCustomization,
  powersAptitudesInRules,
  powersInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Copying the core's feats and spells into an extension that changes them. */
export function CopiesOnWrite<B extends Constructor<SeederState>>(Base: B) {
  abstract class CopyingOnWrite extends Base {
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
          target: `classes.${className}.level`,
          operator: "greater_than_or_equal",
          value: String(level),
          valueType: "number",
        })),
      );
    }

    /** Copies an entity's requirements, modifiers (with theirs) and properties onto its copy. */
    private async copyCustomizations(fromId: string, toId: string) {
      await this.copyRequirements(fromId, toId);
      for (const modifier of await this.db
        .select()
        .from(modifiersInCustomization)
        .where(eq(modifiersInCustomization.sourceId, fromId))) {
        const { sourceType, target, value, valueType, operator } = modifier;
        const [copy] = await this.db
          .insert(modifiersInCustomization)
          .values({ sourceId: toId, sourceType, target, value, valueType, operator })
          .returning({ id: modifiersInCustomization.id });
        await this.copyRequirements(modifier.id, copy.id);
      }
      const properties = await this.db
        .select()
        .from(propertiesInCustomization)
        .where(eq(propertiesInCustomization.entityId, fromId));
      await this.insertAll(
        propertiesInCustomization,
        properties.map(({ entityType, type, value, description }) => ({
          entityId: toId,
          entityType,
          type,
          value,
          description,
        })),
      );
    }

    private async copyRequirements(fromId: string, toId: string) {
      const rows = await this.db
        .select()
        .from(requirementsInCustomization)
        .where(eq(requirementsInCustomization.entityId, fromId));
      await this.insertAll(
        requirementsInCustomization,
        rows.map(({ entityType, level, target, operator, value, valueType, chainingOperator }) => ({
          entityId: toId,
          entityType,
          level,
          target,
          operator,
          value,
          valueType,
          chainingOperator,
        })),
      );
    }

    /** Adds a power to the spell lists another one is in, at the same levels. */
    private async copySpellLists(fromId: string, toId: string) {
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

    /** Copies an inherited feat into the ruleset, with its aptitudes and customizations. */
    private async cowFeat(featId: string) {
      const [feat] = await this.db.select().from(featsInRules).where(eq(featsInRules.id, featId));
      const [copy] = await this.db
        .insert(featsInRules)
        .values({
          rulesetId: this.ctx.rulesetId,
          name: feat.name,
          description: feat.description,
          stackable: feat.stackable,
          selectable: feat.selectable,
          generated: feat.generated,
        })
        .returning({ id: featsInRules.id });
      const aptitudes = await this.db
        .select()
        .from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, featId));
      await this.insertAll(
        featsAptitudesInRules,
        aptitudes.map(({ aptitudeId }) => ({ featId: copy.id, aptitudeId })),
      );
      await this.copyCustomizations(featId, copy.id);
      await this.recordCopy("feats", featId, copy.id);
      return copy.id;
    }

    /**
     * Copies an inherited power into the ruleset, with its customizations and its spell lists ("X Spells" aptitudes):
     * the copy hides the original in the rulesets that extend this one, so it keeps the original's lists.
     */
    private async cowPower(powerId: string) {
      const [power] = await this.db.select().from(powersInRules).where(eq(powersInRules.id, powerId));
      const [copy] = await this.db
        .insert(powersInRules)
        .values({
          rulesetId: this.ctx.rulesetId,
          name: power.name,
          description: power.description,
          saveId: power.saveId,
          saveEffect: power.saveEffect,
        })
        .returning({ id: powersInRules.id });
      await this.copyCustomizations(powerId, copy.id);
      await this.recordCopy("powers", powerId, copy.id);
      await this.copySpellLists(powerId, copy.id);
      return copy.id;
    }

    /** Records a copy in `entity_snapshots`, so the ruleset shows it in place of the original. */
    private async recordCopy(entityType: string, sourceEntityId: string, forkedEntityId: string) {
      await this.db.insert(entitySnapshotsInRules).values({
        rulesetId: this.ctx.rulesetId,
        entityType,
        sourceEntityId,
        forkedEntityId,
        contentHash: "seed",
      });
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
          await this.copySpellLists(inheritedId, this.ctx.powerMap[entry.spell]);
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

    /** Adds a power to aptitudes, each at its level: the first link to an aptitude it isn't in yet. */
    async linkPower(powerId: string, links: { aptitudeId: string; level: number | null }[]) {
      const linked = new Set(
        (
          await this.db
            .select({ aptitudeId: powersAptitudesInRules.aptitudeId })
            .from(powersAptitudesInRules)
            .where(eq(powersAptitudesInRules.powerId, powerId))
        ).map((link) => link.aptitudeId),
      );
      const added = links.filter(({ aptitudeId }) => !linked.has(aptitudeId) && linked.add(aptitudeId));
      await this.insertAll(
        powersAptitudesInRules,
        added.map((link) => ({ powerId, ...link })),
      );
    }

    /** The ruleset's own power named so, copying the inherited one first when it has none. */
    async ownPower(name: string): Promise<string | undefined> {
      const inheritedId = this.ctx.inheritedPowerMap[name];
      if (!this.ctx.powerMap[name] && inheritedId) this.ctx.powerMap[name] = await this.cowPower(inheritedId);
      return this.ctx.powerMap[name];
    }
  }
  return CopyingOnWrite;
}
