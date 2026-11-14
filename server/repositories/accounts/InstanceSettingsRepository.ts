import { eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { instanceSettingsInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";

/** The instance's settings: its one row, which its migration makes (who may make an account, `signUpPolicy`). */
class InstanceSettingsRepository extends BaseRepository<typeof instanceSettingsInAccount> {
  constructor() {
    super(instanceSettingsInAccount);
  }

  /** The instance's settings, its one row. */
  async findOne(db: Db) {
    const [settings] = await db.select().from(this.table).where(eq(this.table.id, true));
    return settings;
  }

  async update(db: Db, values: { signUpPolicy: SignUpPolicy }) {
    const [settings] = await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, true))
      .returning();
    return settings;
  }
}

export default InstanceSettingsRepository;
