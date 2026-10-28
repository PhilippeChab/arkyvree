/**
 * An extension changes an inherited feat or spell the way a fork does: it copies it (copy on write) and records the
 * copy in `entity_snapshots`, so the ruleset shows the copy in place of the original.
 */

import { EntityLinks } from "@/database/seeders/core/SeederState.ts";
import type { Dnd35ContentSeeder } from "@/database/seeders/dnd3.5/Dnd35ContentSeeder.ts";
import type { Feat, Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The links to add to a spell (`links`), each at its level. */
interface SpellLinks {
  links: SpellLink[];
  spellId: string;
}

/** A spell's link to a list, by role (`listedIn`): the aptitude it's on (`toId`), at its level there (`tier`). */
export interface SpellLink {
  tier: number | null;
  toId: string;
}

/** Copying inherited feats and spells into the ruleset, and adding spells to aptitudes. */
export function CopiesOnWrite<B extends Constructor<Dnd35ContentSeeder>>(Base: B) {
  abstract class CopyingOnWrite extends Base {
    /**
     * The aptitude links each spell's copy keeps of its original's (`fromIds`), by the original's id: the copy hides
     * the original in the rulesets that extend this one, so it keeps the links they find it by. A ruleset's own.
     */
    protected abstract keptSpellLinks(fromIds: string[]): Promise<Map<string, SpellLink[]>>;

    /** Copies an inherited feat into the ruleset, with its fields, its aptitudes and its customizations. */
    protected async cowFeat(featId: string) {
      const [feat] = await this.entityRecords<Feat>("feats", [featId]);
      const { [feat.name]: copyId } = await this.insertEntities("feats", [
        { rulesetId: this.ctx.rulesetId, name: feat.name, description: feat.description, fields: feat.fields },
      ]);
      await this.insertListings(
        "feats",
        (await this.listedIn([featId])).map(({ toId }) => ({ fromId: copyId, toId })),
      );
      const copies = new Map([[featId, copyId]]);
      await this.copyCustomizations(copies);
      await this.recordCopies(copies);
      return copyId;
    }

    /**
     * Copies inherited spells into the ruleset (`entries`), each with its fields and single links, its customizations,
     * the links its copy keeps and the ruleset's own (`links`, the first link to each aptitude): a few writes, however
     * many spells. Answers each copy's id, by its original's.
     */
    protected async cowSpells(entries: SpellLinks[]): Promise<Map<string, string>> {
      if (entries.length === 0) return new Map();
      const spells = new Map(
        (
          await this.entityRecords<Spell>(
            "spells",
            entries.map((entry) => entry.spellId),
          )
        ).map((spell) => [spell.id, spell]),
      );
      const ids = await this.insertEntities(
        "spells",
        entries.map(({ spellId }) => {
          const spell = spells.get(spellId)!;
          return {
            rulesetId: this.ctx.rulesetId,
            name: spell.name,
            description: spell.description,
            fields: spell.fields,
            links: spell.links,
          };
        }),
      );
      const copies = new Map(entries.map(({ spellId }) => [spellId, ids[spells.get(spellId)!.name]]));
      await this.copyCustomizations(copies);
      await this.recordCopies(copies);
      const kept = await this.keptSpellLinks([...copies.keys()]);
      await this.insertListings(
        "spells",
        entries.flatMap(({ links, spellId }) => {
          const linked = new Set<string>();
          return [...(kept.get(spellId) ?? []), ...links]
            .filter(({ toId }) => !linked.has(toId) && linked.add(toId))
            .map((link) => ({ fromId: copies.get(spellId)!, ...link }));
        }),
      );
      return copies;
    }

    /**
     * The aptitudes feats or spells are listed in (`ids`): their `listedIn` links, each its entity (`fromId`), its
     * aptitude (`toId`) and its level there (`tier`, a spell list's).
     */
    protected async listedIn(ids: string[]) {
      return await EntityLinks.findMany(this.db, { fromIds: ids, role: "listedIn" });
    }

    /** Adds a spell to aptitudes, each at its level: the first link to an aptitude it isn't in yet. */
    async linkSpell(spellId: string, links: SpellLink[]) {
      await this.linkSpells([{ spellId, links }]);
    }

    /**
     * Adds spells to aptitudes (`entries`), each at its level: the first link to an aptitude its spell isn't in yet, in
     * one write.
     */
    async linkSpells(entries: SpellLinks[]) {
      const listed = await this.listedIn(entries.map((entry) => entry.spellId));
      const linked = new Map<string, Set<string>>();
      for (const link of listed) linked.set(link.fromId, (linked.get(link.fromId) ?? new Set()).add(link.toId));
      await this.insertListings(
        "spells",
        entries.flatMap(({ links, spellId }) => {
          const its = linked.get(spellId) ?? new Set<string>();
          linked.set(spellId, its);
          return links
            .filter(({ toId }) => !its.has(toId) && its.add(toId))
            .map((link) => ({ fromId: spellId, ...link }));
        }),
      );
    }

    /** The ruleset's own spell named so, copying the inherited one first when it has none. */
    async ownSpell(name: string): Promise<string | undefined> {
      const inheritedId = this.ctx.inheritedSpellMap[name];
      if (this.ctx.spellMap[name] || !inheritedId) return this.ctx.spellMap[name];
      const copies = await this.cowSpells([{ spellId: inheritedId, links: [] }]);
      this.ctx.spellMap[name] = copies.get(inheritedId)!;
      return this.ctx.spellMap[name];
    }
  }
  return CopyingOnWrite;
}
