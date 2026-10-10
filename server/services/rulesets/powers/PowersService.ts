import { powersInRules } from "@/drizzle/schema.ts";
import { Engine, type EntityKinds } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Powers } from "@/server/repositories/index.ts";
import EntitySaves from "@/server/services/rulesets/EntitySaves.ts";
import type { Session } from "@/shared/relations.ts";

/** A power's body: its row's columns, its aptitude links, and its fields (`planPowerCreate`). */
type PowerBody = Parameters<EntityKinds["powers"]["planCreate"]>[0] & { updatedAt?: string };

class PowersService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly saves = new EntitySaves("powers", Powers, powersInRules, "Power", (scope) => ({
    baseRules: scope.ruleset.baseRules,
  }));

  async createPower(session: Session, rulesetId: string, body: PowerBody) {
    return await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("powers").planCreate(body),
    );
  }

  async deletePower(session: Session, rulesetId: string, powerId: string) {
    return await this.saves.delete(session, rulesetId, powerId, (scope) =>
      Engine.for(scope).entities("powers").planDelete(powerId),
    );
  }

  async getPower(rulesetId: string, powerId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).entities("powers").describe(powerId),
    );
  }

  /** A page of the ruleset's powers, as its composed view has them: all of them, or a list's (at a level). */
  async getPowers(
    rulesetId: string,
    where: {
      aptitudeId?: string;
      childOnly?: boolean;
      level?: number;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { aptitudeId, level, ...filters } = where;
      const list = Engine.for(scope).entities("powers").openList({ aptitudeId, childOnly: where.childOnly, level });
      const result = await Powers.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...filters, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updatePower(session: Session, rulesetId: string, powerId: string, body: PowerBody) {
    return await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("powers").planEdit(powerId, body),
    );
  }
}

export default new PowersService();
