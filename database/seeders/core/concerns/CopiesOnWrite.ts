/**
 * An extension changes an inherited feat or power the way a fork does: it copies it (copy on write) and records the
 * copy in `entity_snapshots`, so the ruleset shows the copy in place of the original.
 */

import { eq } from "drizzle-orm";

import type { SeederState } from "@/database/seeders/core/SeederState.ts";
import type { Constructor } from "@/lib/mixins.ts";
import StoredJoins from "@/server/repositories/stored/StoredJoins.ts";
import type { Feat, Power } from "@/shared/relations.ts";

/** Copying inherited feats and powers into the ruleset, and adding powers to aptitudes. */
export function CopiesOnWrite<B extends Constructor<SeederState>>(Base: B) {
  abstract class CopyingOnWrite extends Base {
    /**
     * The aptitude links a power's copy keeps of the original's (`fromId`): the copy hides the original in the
     * rulesets that extend this one, so it keeps the links they find it by. A ruleset's own.
     */
    protected abstract copyPowerLinks(fromId: string, toId: string): Promise<void>;

    /** The aptitudes a feat or a power is listed in (`join`), each with its level (a spell list's). */
    protected async listedIn(join: "feats_aptitudes" | "powers_aptitudes", id: string) {
      return await StoredJoins.rows<{ aptitudeId: string; level?: number | null }>(
        this.db,
        join,
        eq(StoredJoins.part("from"), id),
      );
    }

    /** Copies an inherited feat into the ruleset, with its aptitudes and customizations. */
    protected async cowFeat(featId: string) {
      const feat = await this.entityRow<Feat>("feats", featId);
      const { [feat.name]: copyId } = await this.insertEntities("feats", [
        {
          rulesetId: this.ctx.rulesetId,
          name: feat.name,
          description: feat.description,
          stackable: feat.stackable,
          selectable: feat.selectable,
          generated: feat.generated,
        },
      ]);
      await this.insertJoins(
        "feats_aptitudes",
        (await this.listedIn("feats_aptitudes", featId)).map(({ aptitudeId }) => ({ featId: copyId, aptitudeId })),
      );
      await this.copyCustomizations(featId, copyId);
      await this.recordCopy("feats", featId, copyId);
      return copyId;
    }

    /** Copies an inherited power into the ruleset, with its customizations and the links its copy keeps. */
    protected async cowPower(powerId: string) {
      const power = await this.entityRow<Power>("powers", powerId);
      const { [power.name]: copyId } = await this.insertEntities("powers", [
        {
          rulesetId: this.ctx.rulesetId,
          name: power.name,
          description: power.description,
          saveId: power.saveId,
          saveEffect: power.saveEffect,
        },
      ]);
      await this.copyCustomizations(powerId, copyId);
      await this.recordCopy("powers", powerId, copyId);
      await this.copyPowerLinks(powerId, copyId);
      return copyId;
    }

    /** Adds a power to aptitudes, each at its level: the first link to an aptitude it isn't in yet. */
    async linkPower(powerId: string, links: { aptitudeId: string; level: number | null }[]) {
      const linked = new Set((await this.listedIn("powers_aptitudes", powerId)).map((link) => link.aptitudeId));
      const added = links.filter(({ aptitudeId }) => !linked.has(aptitudeId) && linked.add(aptitudeId));
      await this.insertJoins(
        "powers_aptitudes",
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
