import { aptitudesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Aptitudes } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";

class AptitudesService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly writer = new EntityWriter("aptitudes", Aptitudes, aptitudesInRules, "Aptitude");

  async createAptitude(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      name: string;
    },
  ) {
    return await this.writer.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("aptitudes").planCreate(body),
    );
  }

  async deleteAptitude(session: Session, rulesetId: string, aptitudeId: string) {
    return await this.writer.delete(session, rulesetId, aptitudeId, (scope) =>
      Engine.for(scope).entities("aptitudes").planDelete(aptitudeId),
    );
  }

  async getAptitude(rulesetId: string, aptitudeId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).entities("aptitudes").describe(aptitudeId),
    );
  }

  async getAptitudes(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      scope?: "feats" | "spells";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const list = Engine.for(scope).entities("aptitudes").openList(where);
      const result = await Aptitudes.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateAptitude(
    session: Session,
    rulesetId: string,
    aptitudeId: string,
    body: {
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    return await this.writer.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("aptitudes").planEdit(aptitudeId, body),
    );
  }
}

export default new AptitudesService();
