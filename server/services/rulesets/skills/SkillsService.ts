import { skillsInRules } from "@/drizzle/schema.ts";
import { Engine, type EntityKinds } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Skills } from "@/server/repositories/index.ts";
import EntitySaves from "@/server/services/rulesets/EntitySaves.ts";
import type { Session } from "@/shared/relations.ts";

/** A skill's body: its row's columns, and the fields its ruleset's rules keep (`planSkillCreate`). */
type SkillBody = Parameters<EntityKinds["skills"]["planCreate"]>[0];

class SkillsService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly saves = new EntitySaves("skills", Skills, skillsInRules, "Skill");

  async createSkill(session: Session, rulesetId: string, body: SkillBody) {
    const { plan, row } = await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("skills").planCreate(body),
    );
    return plan.describe(row);
  }

  async deleteSkill(session: Session, rulesetId: string, skillId: string) {
    return await this.saves.delete(session, rulesetId, skillId, (scope) =>
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
      const result = await Skills.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where },
        pagination,
      );
      return { ...result, items: Engine.for(scope).entities("skills").describePage(result.items) };
    });
  }

  async updateSkill(session: Session, rulesetId: string, skillId: string, body: SkillBody & { updatedAt?: string }) {
    const { plan, row } = await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("skills").planEdit(skillId, body),
    );
    return plan.describe(row);
  }
}

export default new SkillsService();
