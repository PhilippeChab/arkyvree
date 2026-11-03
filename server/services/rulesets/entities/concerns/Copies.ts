import { Engine, type EntityRecord } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { Entities, type RulesetEntityType } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/entities/EntityWriter.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import type { Session } from "@/shared/relations.ts";

/** A copy's own name and description. */
export interface VariantBody {
  description?: string | null;
  name: string;
}

/**
 * A kind's copies, as its rules plan them (an item's): the entities of a type others are made from (its templates), and
 * the copies of an entity made in bulk (its variants). A kind that makes none its rules refuse as not found.
 */
export function Copies<B extends Constructor>(Base: B) {
  abstract class WithCopies extends Base {
    /**
     * Copies of an entity (`sourceId`), each its own name and description (`variants`), as its kind's rules plan them,
     * each written as a create writes its own (`EntityWriter.createMany`): each name kept free, each copy taking over a
     * deleted ancestor's tombstone by its name, the customizations its plan copies, and what its plan writes past its
     * row. Refused first for a kind that makes no copies.
     */
    async createVariants(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      sourceId: string,
      variants: VariantBody[],
    ) {
      const writer = new EntityWriter(type, (scope) => Engine.for(scope).entities(type, "variants"));
      return await writer.createMany(session, rulesetId, (scope) =>
        Engine.for(scope).entities(type).planVariants(sourceId, variants),
      );
    }

    /**
     * The entities of a type others are made from (`templateType`: an item's templates of a type), by name: each as
     * stored (its own columns, every field it holds, its single links), named.
     */
    async getTemplates(session: Session, rulesetId: string, type: RulesetEntityType, templateType?: string) {
      return await withReadableRuleset(db, session, rulesetId, async (scope) => {
        const { rulesetData } = scope;
        const { filters } = Engine.for(scope).entities(type).openTemplates(templateType);
        return await Entities.findList<EntityRecord & { name: string }>(db, {
          entityType: type,
          rulesetId,
          ...rulesetData.cow.listFilters,
          ...filters,
          order: "name",
        });
      });
    }
  }
  return WithCopies;
}
