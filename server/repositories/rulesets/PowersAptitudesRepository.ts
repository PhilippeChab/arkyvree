import { and, eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import StoredJoinRepository from "@/server/repositories/StoredJoinRepository.ts";
import type { PowerWithAptitudes } from "@/shared/relations.ts";

type PowerAptitude = Omit<PowerWithAptitudes["powersAptitudesInRules"][number], "aptitudesInRule">;

/** A spell's lists: the aptitudes it's on, each at its level in it. */
class PowersAptitudesRepository extends StoredJoinRepository<PowerAptitude> {
  protected override readonly join = "powers_aptitudes";

  async delete(db: Db, where: { powerId: string }) {
    return await this.remove(db, this.branchWhere(["powerId" in where && eq(this.column("powerId"), where.powerId)])!);
  }

  /** Links of powers. */
  async findMany(db: Db, where: { powerIds: string[] } | { powerId: string }) {
    if ("powerIds" in where && where.powerIds.length === 0) return [];
    return await this.rows(db, [
      this.branchWhere([
        "powerIds" in where && inArray(this.column("powerId"), where.powerIds),
        "powerId" in where && eq(this.column("powerId"), where.powerId),
      ])!,
    ]);
  }

  async findOne(db: Db, where: { aptitudeId: string; powerId: string }) {
    const [row] = await this.rows(db, [
      and(eq(this.column("powerId"), where.powerId), eq(this.column("aptitudeId"), where.aptitudeId))!,
    ]);
    return row;
  }
}

export default PowersAptitudesRepository;
