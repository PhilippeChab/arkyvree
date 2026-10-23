import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Skills } from "@/server/repositories/index.ts";
import EntityWriter, { type EntityBody } from "@/server/services/rulesets/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";

class SkillsService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly writer = new EntityWriter("skills", Skills);

  async createSkill(session: Session, rulesetId: string, body: EntityBody) {
    return await this.writer.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("skills").planCreate(body),
    );
  }

  async deleteSkill(session: Session, rulesetId: string, skillId: string) {
    return await this.writer.delete(session, rulesetId, skillId, (scope) =>
      Engine.for(scope).entities("skills").planDelete(skillId),
    );
  }

  async getSkill(rulesetId: string, skillId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).entities("skills").describe(skillId),
    );
  }

  async getSkills(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const list = Engine.for(scope).entities("skills").openList(where);
      const result = await Skills.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateSkill(session: Session, rulesetId: string, skillId: string, body: EntityBody) {
    return await this.writer.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("skills").planEdit(skillId, body),
    );
  }
}

export default new SkillsService();
