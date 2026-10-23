import { eq, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { advancementsInCharacter, entitiesInRules } from "@/drizzle/schema.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import { qualified } from "@/server/repositories/stored/qualified.ts";
import type { Klass } from "@/shared/relations.ts";

/**
 * The classes: a ruleset's list of them, of a kind if one is given, a character's first (by the highest of its levels
 * it took in each) if one is given.
 */
class KlassesRepository extends RulesetEntityRepository<Klass> {
  protected override readonly entityType = "klasses";

  override async findPage(
    db: Db,
    where: RulesetEntityFilters<{ characterId?: string; kind?: string }>,
    pagination: { limit: number; page: number },
  ) {
    const { characterId, kind } = where;
    // A class level is an entity its class owns, at its level's position; a character's level an advancement in it
    const levels = sql`rules.entities`;
    const characterLevel = characterId
      ? [
          this.orderBy(
            sql`COALESCE((
              SELECT MAX(kl.position)
              FROM ${levels} kl
              JOIN ${advancementsInCharacter} ON ${advancementsInCharacter.trackId} = kl.id
              WHERE kl.owner_id = ${qualified(entitiesInRules.id)}
              AND ${advancementsInCharacter.characterId} = ${characterId}
              AND ${advancementsInCharacter.deletedAt} IS NULL
            ), 0)`,
            "desc",
          ),
          this.orderBy(this.column("name")),
        ]
      : undefined;
    return await super.findPage(
      db,
      where,
      pagination,
      [kind !== undefined && eq(this.column("kind"), kind)],
      characterLevel,
    );
  }
}

export default KlassesRepository;
