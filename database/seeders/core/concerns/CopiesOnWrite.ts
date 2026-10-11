/**
 * An extension changes an inherited feat or power the way a fork does: it copies it (copy on write) and records the
 * copy in `entity_snapshots`, so the ruleset shows the copy in place of the original.
 */

import { eq } from "drizzle-orm";

import type { SeederState } from "@/database/seeders/core/SeederState.ts";
import { featsAptitudesInRules, featsInRules, powersAptitudesInRules, powersInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Copying inherited feats and powers into the ruleset, and adding powers to aptitudes. */
export function CopiesOnWrite<B extends Constructor<SeederState>>(Base: B) {
  abstract class CopyingOnWrite extends Base {
    /**
     * The aptitude links a power's copy keeps of the original's (`fromId`): the copy hides the original in the
     * rulesets that extend this one, so it keeps the links they find it by. A ruleset's own.
     */
    protected abstract copyPowerLinks(fromId: string, toId: string): Promise<void>;

    /** Copies an inherited feat into the ruleset, with its aptitudes and customizations. */
    protected async cowFeat(featId: string) {
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

    /** Copies an inherited power into the ruleset, with its customizations and the links its copy keeps. */
    protected async cowPower(powerId: string) {
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
      await this.copyPowerLinks(powerId, copy.id);
      return copy.id;
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
