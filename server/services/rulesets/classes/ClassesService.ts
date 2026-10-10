import { klassesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Klasses } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";

class ClassesService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly writer = new EntityWriter("klasses", Klasses, klassesInRules, "Klass");

  async createClass(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      hd?: number;
      name: string;
    },
  ) {
    return await this.writer.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("klasses").planCreate(body),
    );
  }

  async deleteClass(session: Session, rulesetId: string, klassId: string) {
    return await this.writer.delete(session, rulesetId, klassId, (scope) =>
      Engine.for(scope).entities("klasses").planDelete(klassId),
    );
  }

  async getClass(rulesetId: string, klassId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).class(klassId).describe());
  }

  async getClasses(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      kind?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const list = Engine.for(scope).entities("klasses").openList(where);
      const result = await Klasses.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateClass(
    session: Session,
    rulesetId: string,
    klassId: string,
    body: {
      description?: string | null;
      hd?: number;
      name: string;
      updatedAt?: string;
    },
  ) {
    return await this.writer.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("klasses").planEdit(klassId, body),
    );
  }
}

export default new ClassesService();
