/**
 * An extension's book adds levels to core classes past their last (`cowClasses`: the epic book's, to the 40th): the
 * extension copies each class (copy on write), whose levels before stay its source's, the copy's level of a number
 * standing for its source's in the view, and gives the copy its new levels.
 */

import type { CowClassEntry } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { Entities, EntityLinks } from "@/database/seeders/core/SeederState.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Extending core classes past their last level. */
export function ExtendsClasses<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class ExtendingClasses extends Base {
    /**
     * Gives a class's copy its source's levels (`copyLevels`) and its new levels (`entry`): each after its source's last
     * to `levels`, with that last level's base attack, skill points and base saves, the class features `classFeatures`
     * grants it there, and the bonuses its `modifiers` go on giving there.
     */
    private async addLevels(copyId: string, sourceId: string, entry: CowClassEntry) {
      const { last, saves } = await this.copyLevels(sourceId, copyId);
      const numbers = Array.from({ length: entry.levels - last.position }, (_, i) => last.position + i + 1);
      const ids = await this.insertRows(
        "class-levels",
        numbers.map((position) => ({ ownerId: copyId, position, fields: last.fields })),
      );
      const levelIds = new Map(numbers.map((position, i) => [position, ids[i]]));
      const via = this.idOf(this.ctx.aptMap, entry.classFeatureAptitude, `${entry.className}'s features`);
      await this.insertLinks([
        ...ids.flatMap((fromId) =>
          saves.map(({ toId, toType, amount }) => ({
            role: "baseBonus",
            fromId,
            fromType: "class-levels",
            toId,
            toType,
            amount,
          })),
        ),
        ...entry.classFeatures.map(([level, feat]) => ({
          role: "grants",
          fromId: levelIds.get(level)!,
          fromType: "class-levels",
          toId: this.idOf(this.ctx.featMap, feat, `${entry.className}'s feature at level ${level}`),
          toType: "feats",
          viaId: via,
          free: true,
        })),
      ]);
      await this.insertModifiers(
        "class-levels",
        entry.modifiers.map(({ level, ...modifier }) => ({ sourceId: levelIds.get(level)!, modifier })),
      );
    }

    /**
     * Copies a class's levels (`sourceId`'s) under its copy (`copyId`): each with its fields, its links (its saves, its
     * grants) and its customizations (its spell slots), the copy's level of a number standing for its source's in the
     * view (`CowDataBuilder`'s owned pass), which pairs no level the copy hasn't. Answers the last one, with its saves.
     */
    private async copyLevels(sourceId: string, copyId: string) {
      const levels = await Entities.findMany<KlassLevel>(this.db, { entityType: "class-levels", ownerIds: [sourceId] });
      const ids = await this.insertRows(
        "class-levels",
        levels.map(({ position, fields }) => ({ ownerId: copyId, position, fields })),
      );
      const copies = new Map(levels.map((level, i) => [level.id, ids[i]]));
      const links = await EntityLinks.findMany(this.db, { fromIds: levels.map(({ id }) => id) });
      await this.insertLinks(
        links.map(({ id: _id, fromId, ...link }) => ({
          ...link,
          fromId: copies.get(fromId)!,
          fromType: "class-levels",
        })),
      );
      await this.copyCustomizations(copies);
      const last = levels.reduce((highest, level) => (level.position > highest.position ? level : highest));
      return { last, saves: links.filter((link) => link.fromId === last.id && link.role === "baseBonus") };
    }

    /**
     * Copies an inherited class into the ruleset: its record, its single and its many links (its class skills), its
     * customizations, the copy recorded so the ruleset shows it in place of the original. Answers the copy's id.
     */
    private async cowClass(classId: string): Promise<string> {
      const [klass] = await this.entityRecords<Klass>("classes", [classId]);
      const [copyId] = await this.insertRows("classes", [
        {
          rulesetId: this.ctx.rulesetId,
          name: klass.name,
          description: klass.description,
          fields: klass.fields,
          links: klass.links,
          partition: klass.partition,
        },
      ]);
      const links = await EntityLinks.findMany(this.db, { fromIds: [classId] });
      await this.insertLinks(
        links.map(({ id: _id, fromId: _from, ...link }) => ({ ...link, fromId: copyId, fromType: "classes" })),
      );
      const copies = new Map([[classId, copyId]]);
      await this.copyCustomizations(copies);
      await this.recordCopies(copies);
      return copyId;
    }

    /**
     * Adds the book's levels to core classes past their last (`entries`): each class copied into the ruleset, its copy
     * given its new levels, the ruleset's classes then naming the copy.
     */
    async cowClassesIntoExtension(entries: CowClassEntry[]) {
      for (const entry of entries) {
        const sourceId = this.idOf(this.ctx.classIds, entry.className, "an extended class");
        const copyId = await this.cowClass(sourceId);
        await this.addLevels(copyId, sourceId, entry);
        this.ctx.classIds[entry.className] = copyId;
      }
    }
  }
  return ExtendingClasses;
}
