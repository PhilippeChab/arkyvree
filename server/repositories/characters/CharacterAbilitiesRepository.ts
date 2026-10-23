import { and, eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { linksInCharacter } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import StoredCharacterLinks from "@/server/repositories/stored/StoredCharacterLinks.ts";
import type { CharacterAbility } from "@/shared/relations.ts";

/** A character's ability scores: its links to its abilities, each with its score. */
class CharacterAbilitiesRepository extends include(BaseRepository<typeof linksInCharacter>, ResolvesCopies) {
  constructor() {
    super(linksInCharacter);
  }

  async createMany(db: Db, values: Omit<CharacterAbility, "createdAt" | "deletedAt" | "updatedAt">[]) {
    if (values.length === 0) return [];
    const rows = await db
      .insert(this.table)
      .values(values.map((row) => StoredCharacterLinks.values("abilities", row)))
      .returning(StoredCharacterLinks.columns("abilities"));
    return rows as unknown as CharacterAbility[];
  }

  async findMany(db: Db, where: { characterId: string }) {
    const rows = await db
      .select(StoredCharacterLinks.columns("abilities"))
      .from(this.table)
      .where(StoredCharacterLinks.scope("abilities", eq(this.table.characterId, where.characterId)))
      .orderBy(this.orderBy(this.table.createdAt), this.orderBy(this.table.id));
    return rows as unknown as CharacterAbility[];
  }

  /** Sets a character's scores in abilities (`abilityIds`: an ability's copies and original, any a row may hold). */
  async update(db: Db, values: { score: number }, where: { abilityIds: string[]; characterId: string }) {
    const rows = await db
      .update(this.table)
      .set({ amount: values.score, updatedAt: new Date().toISOString() })
      .where(
        StoredCharacterLinks.scope(
          "abilities",
          and(eq(this.table.characterId, where.characterId), this.idMatches(this.table.entityId, where.abilityIds)),
        ),
      )
      .returning(StoredCharacterLinks.columns("abilities"));
    return rows as unknown as CharacterAbility[];
  }
}

export default CharacterAbilitiesRepository;
