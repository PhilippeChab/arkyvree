import { languagesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Languages } from "@/server/repositories/index.ts";
import EntitySaves from "@/server/services/rulesets/EntitySaves.ts";
import type { Session } from "@/shared/relations.ts";

class LanguagesService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly saves = new EntitySaves("languages", Languages, languagesInRules, "Language");

  async createLanguage(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      name: string;
      type: string;
    },
  ) {
    return await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("languages").planCreate(body),
    );
  }

  async deleteLanguage(session: Session, rulesetId: string, languageId: string) {
    return await this.saves.delete(session, rulesetId, languageId, (scope) =>
      Engine.for(scope).entities("languages").planDelete(languageId),
    );
  }

  async getLanguage(rulesetId: string, languageId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).entities("languages").describe(languageId),
    );
  }

  async getLanguages(
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
      const list = Engine.for(scope).entities("languages").openList(where);
      const result = await Languages.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateLanguage(
    session: Session,
    rulesetId: string,
    languageId: string,
    body: {
      description?: string | null;
      name: string;
      type: string;
      updatedAt?: string;
    },
  ) {
    return await this.saves.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("languages").planEdit(languageId, body),
    );
  }
}

export default new LanguagesService();
