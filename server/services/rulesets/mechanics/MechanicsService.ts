import { mechanicsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Mechanics } from "@/server/repositories/index.ts";
import EntitySaves from "@/server/services/rulesets/EntitySaves.ts";
import type { Session } from "@/shared/relations.ts";

class MechanicsService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly saves = new EntitySaves("mechanics", Mechanics, mechanicsInRules, "Mechanic");

  async createMechanic(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      name: string;
    },
  ) {
    return await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("mechanics").planCreate(body),
    );
  }

  async deleteMechanic(session: Session, rulesetId: string, mechanicId: string) {
    return await this.saves.delete(session, rulesetId, mechanicId, (scope) =>
      Engine.for(scope).entities("mechanics").planDelete(mechanicId),
    );
  }

  async getMechanic(rulesetId: string, mechanicId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).entities("mechanics").describe(mechanicId),
    );
  }

  async getMechanics(
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
      const list = Engine.for(scope).entities("mechanics").openList(where);
      const result = await Mechanics.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateMechanic(
    session: Session,
    rulesetId: string,
    mechanicId: string,
    body: {
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    return await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("mechanics").planEdit(mechanicId, body),
    );
  }
}

export default new MechanicsService();
