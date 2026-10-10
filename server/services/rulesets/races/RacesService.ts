import { racesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Races } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/EntityWriter.ts";
import type { SizeType } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

class RacesService {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly writer = new EntityWriter("races", Races, racesInRules, "Race");

  async createRace(
    session: Session,
    rulesetId: string,
    body: {
      baseSpeed: number;
      description?: string | null;
      name: string;
      size: SizeType;
    },
  ) {
    return await this.writer.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("races").planCreate(body),
    );
  }

  async deleteRace(session: Session, rulesetId: string, raceId: string) {
    return await this.writer.delete(session, rulesetId, raceId, (scope) =>
      Engine.for(scope).entities("races").planDelete(raceId),
    );
  }

  async getRace(rulesetId: string, raceId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("races").describe(raceId));
  }

  async getRaces(
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
      const list = Engine.for(scope).entities("races").openList(where);
      const result = await Races.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateRace(
    session: Session,
    rulesetId: string,
    raceId: string,
    body: {
      baseSpeed: number;
      description?: string | null;
      name: string;
      size: SizeType;
      updatedAt?: string;
    },
  ) {
    return await this.writer.update(session, rulesetId, body, (scope) =>
      Engine.for(scope).entities("races").planEdit(raceId, body),
    );
  }
}

export default new RacesService();
