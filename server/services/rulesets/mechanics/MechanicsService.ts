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
    const { row } = await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("mechanics").planCreate(body),
    );
    return row;
  }

  async deleteMechanic(session: Session, rulesetId: string, mechanicId: string) {
    return await this.saves.delete(session, rulesetId, mechanicId, (scope) =>
      Engine.for(scope).entities("mechanics").planDelete(mechanicId),
    );
  }

  async getMechanic(rulesetId: string, mechanicId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const mechanic = Engine.for(scope).entities("mechanics").describe(mechanicId);
      return mechanic;
    });
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
      const { rulesetData } = scope;
      return await Mechanics.findPage(db, { rulesetId, ...rulesetData.cow.listFilters, ...where }, pagination);
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
    const { row } = await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("mechanics").planEdit(mechanicId, body),
    );
    return row;
  }
}

export default new MechanicsService();
