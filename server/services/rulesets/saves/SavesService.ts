import { savesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { KlassLevelSaves, Saves } from "@/server/repositories/index.ts";
import EntitySaves from "@/server/services/rulesets/EntitySaves.ts";
import type { Session } from "@/shared/relations.ts";

class SavesService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly saves = new EntitySaves("saves", Saves, savesInRules, "Save");

  async createSave(
    session: Session,
    rulesetId: string,
    body: {
      abilityId: string;
      description?: string | null;
      name: string;
    },
  ) {
    return await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("saves").planCreate(body),
    );
  }

  async deleteSave(session: Session, rulesetId: string, saveId: string) {
    return await this.saves.delete(
      session,
      rulesetId,
      saveId,
      (scope) => Engine.for(scope).entities("saves").planDelete(saveId),
      {
        // A save is in use while a class level grants it: the database refuses its delete, this answers why
        inUse: (tx, scope) => KlassLevelSaves.exists(tx, { saveId: scope.rulesetData.cow.resolve(saveId) }),
      },
    );
  }

  async getSave(rulesetId: string, saveId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("saves").describe(saveId));
  }

  async getSaves(
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
      const list = Engine.for(scope).entities("saves").openList(where);
      const result = await Saves.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateSave(
    session: Session,
    rulesetId: string,
    saveId: string,
    body: {
      abilityId: string;
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    return await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("saves").planEdit(saveId, body),
    );
  }
}

export default new SavesService();
