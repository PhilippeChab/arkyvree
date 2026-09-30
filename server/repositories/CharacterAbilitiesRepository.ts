import { and, eq, isNull } from "drizzle-orm";

import { characterAbilitiesInCharacter } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterAbilitiesRepository
  extends BaseRepository<typeof characterAbilitiesInCharacter, CharacterAbilityInstance> {
  constructor() {
    super(characterAbilitiesInCharacter);
  }

  async createMany(db: Db, values: InferInsertModel<typeof characterAbilitiesInCharacter>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof characterAbilitiesInCharacter>>,
    where: { characterId: string; abilityId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          this.idMatches(this.table.abilityId, where.abilityId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.characterAbilitiesInCharacter.findMany({
      where: and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)),
    });
  }

  withInstance(instance: InferSelectModel<typeof characterAbilitiesInCharacter>) {
    return new CharacterAbilityInstance(instance);
  }
}

class CharacterAbilityInstance extends Instance<InferSelectModel<typeof characterAbilitiesInCharacter>> {}

export default CharacterAbilitiesRepository;
