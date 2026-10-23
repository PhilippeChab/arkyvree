/**
 * An extension changes an inherited feat or power the way a fork does: it copies it (copy on write) and records the
 * copy in `entity_snapshots`, so the ruleset shows the copy in place of the original.
 */

import { Joins, type SeederState } from "@/database/seeders/core/SeederState.ts";
import type { Feat, Power } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The links to add to a power (`links`), each at its level. */
interface PowerLinks {
  links: PowerLink[];
  powerId: string;
}

/** A power's link to an aptitude, at its level (a spell list's). */
export interface PowerLink {
  aptitudeId: string;
  level: number | null;
}

/** Copying inherited feats and powers into the ruleset, and adding powers to aptitudes. */
export function CopiesOnWrite<B extends Constructor<SeederState>>(Base: B) {
  abstract class CopyingOnWrite extends Base {
    /**
     * The aptitude links each power's copy keeps of its original's (`fromIds`), by the original's id: the copy hides
     * the original in the rulesets that extend this one, so it keeps the links they find it by. A ruleset's own.
     */
    protected abstract keptPowerLinks(fromIds: string[]): Promise<Map<string, PowerLink[]>>;

    /** Copies an inherited feat into the ruleset, with its aptitudes and customizations. */
    protected async cowFeat(featId: string) {
      const [feat] = await this.entityRows<Feat>("feats", [featId]);
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
        (await this.listedIn("feats_aptitudes", [featId])).map(({ aptitudeId }) => ({ featId: copyId, aptitudeId })),
      );
      const copies = new Map([[featId, copyId]]);
      await this.copyCustomizations("feats", copies);
      await this.recordCopies("feats", copies);
      return copyId;
    }

    /**
     * Copies inherited powers into the ruleset (`entries`), each with its customizations, the links its copy keeps and
     * the ruleset's own (`links`, the first link to each aptitude): a few writes, however many powers. Answers each
     * copy's id, by its original's.
     */
    protected async cowPowers(entries: PowerLinks[]): Promise<Map<string, string>> {
      if (entries.length === 0) return new Map();
      const powers = new Map(
        (
          await this.entityRows<Power>(
            "powers",
            entries.map((entry) => entry.powerId),
          )
        ).map((power) => [power.id, power]),
      );
      const ids = await this.insertEntities(
        "powers",
        entries.map(({ powerId }) => {
          const power = powers.get(powerId)!;
          return {
            rulesetId: this.ctx.rulesetId,
            name: power.name,
            description: power.description,
            saveId: power.saveId,
            saveEffect: power.saveEffect,
          };
        }),
      );
      const copies = new Map(entries.map(({ powerId }) => [powerId, ids[powers.get(powerId)!.name]]));
      await this.copyCustomizations("powers", copies);
      await this.recordCopies("powers", copies);
      const kept = await this.keptPowerLinks([...copies.keys()]);
      await this.insertJoins(
        "powers_aptitudes",
        entries.flatMap(({ links, powerId }) => {
          const linked = new Set<string>();
          return [...(kept.get(powerId) ?? []), ...links]
            .filter(({ aptitudeId }) => !linked.has(aptitudeId) && linked.add(aptitudeId))
            .map((link) => ({ powerId: copies.get(powerId)!, ...link }));
        }),
      );
      return copies;
    }

    /** The aptitudes feats or powers are listed in (`join`, `ids`), each link with its level (a spell list's). */
    protected async listedIn(join: "feats_aptitudes" | "powers_aptitudes", ids: string[]) {
      if (ids.length === 0) return [];
      return await Joins.findMany<{
        aptitudeId: string;
        featId?: string;
        level?: number | null;
        powerId?: string;
      }>(this.db, { join, fromIds: ids });
    }

    /** Adds a power to aptitudes, each at its level: the first link to an aptitude it isn't in yet. */
    async linkPower(powerId: string, links: PowerLink[]) {
      await this.linkPowers([{ powerId, links }]);
    }

    /**
     * Adds powers to aptitudes (`entries`), each at its level: the first link to an aptitude its power isn't in yet, in
     * one write.
     */
    async linkPowers(entries: PowerLinks[]) {
      const listed = await this.listedIn(
        "powers_aptitudes",
        entries.map((entry) => entry.powerId),
      );
      const linked = new Map<string, Set<string>>();
      for (const link of listed)
        linked.set(link.powerId!, (linked.get(link.powerId!) ?? new Set()).add(link.aptitudeId));
      await this.insertJoins(
        "powers_aptitudes",
        entries.flatMap(({ links, powerId }) => {
          const its = linked.get(powerId) ?? new Set<string>();
          linked.set(powerId, its);
          return links
            .filter(({ aptitudeId }) => !its.has(aptitudeId) && its.add(aptitudeId))
            .map((link) => ({ powerId, ...link }));
        }),
      );
    }

    /** The ruleset's own power named so, copying the inherited one first when it has none. */
    async ownPower(name: string): Promise<string | undefined> {
      const inheritedId = this.ctx.inheritedPowerMap[name];
      if (this.ctx.powerMap[name] || !inheritedId) return this.ctx.powerMap[name];
      const copies = await this.cowPowers([{ powerId: inheritedId, links: [] }]);
      this.ctx.powerMap[name] = copies.get(inheritedId)!;
      return this.ctx.powerMap[name];
    }
  }
  return CopyingOnWrite;
}
