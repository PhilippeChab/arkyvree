import { and, eq, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { characterAbilitiesInCharacter } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

class CharacterAbilitiesRepository extends include(
  BaseRepository<typeof characterAbilitiesInCharacter>,
  ResolvesCopies,
) {
  constructor() {
    super(characterAbilitiesInCharacter);
  }

  async createMany(db: Db, values: InferInsertModel<typeof characterAbilitiesInCharacter>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.characterAbilitiesInCharacter.findMany({
      where: and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)),
    });
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof characterAbilitiesInCharacter>>,
    where: { abilityIds: string[]; characterId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          this.idMatches(this.table.abilityId, where.abilityIds),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }
}

export default CharacterAbilitiesRepository;
