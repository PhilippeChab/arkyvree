import { featsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { type Db, db } from "@/server/database/index.ts";
import { Feats } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";

class FeatsService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly writer = new EntityWriter("feats", Feats, featsInRules, "Feat");

  /**
   * Whether the ancestor feat a fork deleted was generated, read by its stored id: a new feat with its name stands in
   * for it (`EntityNames.repointTombstone`), and takes its mark.
   */
  private async wasGenerated(tx: Db, ancestorFeatId: string): Promise<boolean> {
    const feat = await Feats.findOne(tx, { id: ancestorFeatId });
    return feat?.generated ?? false;
  }

  async createFeat(
    session: Session,
    rulesetId: string,
    body: {
      aptitudeIds: string[];
      description?: string | null;
      name: string;
    },
  ) {
    return await this.writer.create(session, rulesetId, body.name, async (scope, { tombstoneAncestorId, tx }) =>
      // Named as an ancestor the fork deleted, the feat stands in for it (`EntityNames.repointTombstone`), checks
      // finding it by that name
      Engine.for(scope)
        .entities("feats")
        .planCreate({
          ...body,
          tombstoneGenerated: tombstoneAncestorId ? await this.wasGenerated(tx, tombstoneAncestorId) : false,
        }),
    );
  }

  async deleteFeat(session: Session, rulesetId: string, featId: string) {
    return await this.writer.delete(session, rulesetId, featId, (scope) =>
      Engine.for(scope).entities("feats").planDelete(featId),
    );
  }

  async getFeat(rulesetId: string, featId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("feats").describe(featId));
  }

  async getFeatGroups(
    rulesetId: string,
    where: { aptitudeId?: string; childOnly?: boolean; search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { aptitudeId, ...filters } = where;
      const list = Engine.for(scope).entities("feats").openList({ aptitudeId });
      return await Feats.findGroupPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...list.groupFilters, ...filters },
        pagination,
      );
    });
  }

  async getFeats(
    rulesetId: string,
    where: {
      aptitudeId?: string;
      childOnly?: boolean;
      family?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { aptitudeId, family, ...filters } = where;
      const list = Engine.for(scope).entities("feats").openList({ aptitudeId, childOnly: where.childOnly, family });
      const result = await Feats.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...filters, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateFeat(
    session: Session,
    rulesetId: string,
    featId: string,
    body: {
      aptitudeIds?: string[];
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    return await this.writer.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("feats").planEdit(featId, body),
    );
  }
}

export default new FeatsService();
