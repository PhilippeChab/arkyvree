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
    const { row } = await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("saves").planCreate(body),
    );
    return row;
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
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const save = Engine.for(scope).entities("saves").describe(saveId);
      return save;
    });
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
      const result = await Saves.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where },
        pagination,
      );
      return { ...result, items: Engine.for(scope).entities("saves").describePage(result.items) };
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
    const { row } = await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("saves").planEdit(saveId, body),
    );
    return row;
  }
}

export default new SavesService();
