import type { Table } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** `exists` for a repository whose rows `findOne` looks up: whether it finds one. */
export function ChecksExistence<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class CheckingExistence extends Base {
    /** Whether a row matches `where`, any `findOne` takes. */
    async exists<W>(this: { findOne(db: Db, where: W): Promise<unknown> }, db: Db, where: W) {
      return Boolean(await this.findOne(db, where));
    }
  }
  return CheckingExistence;
}
