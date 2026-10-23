import { inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import { findListedAptitudes } from "@/server/repositories/stored/findListedAptitudes.ts";
import type { Power, PowerWithAptitudes } from "@/shared/relations.ts";

/** The spells: a ruleset's list of them, each with the lists it's on, and a picker's page of them. */
class PowersRepository extends include(RulesetEntityRepository, ResolvesCopies)<Power> {
  protected override readonly entityType = "powers";

  /** A ruleset's list of spells (those of `ids`, if given), each with the lists it's on, in their order. */
  override async findPage(
    db: Db,
    where: RulesetEntityFilters<{ ids?: string[] }>,
    pagination: { limit: number; page: number },
  ) {
    const page = await super.findPage(db, where, pagination);
    const lists = await findListedAptitudes<PowerWithAptitudes["powersAptitudesInRules"][number]>(
      db,
      "powers_aptitudes",
      page.items.map((power) => power.id),
    );
    return {
      ...page,
      items: page.items.map((power): PowerWithAptitudes => ({
        ...power,
        powersAptitudesInRules: lists.get(power.id) ?? [],
      })),
    };
  }

  /** A picker's page of these spells (a list's, as the ruleset composes it), by name. */
  async findOptionPage(
    db: Db,
    where: { excludeIds?: string[]; ids: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { ids, excludeIds, search } = where;
    const rows = await this.rows(
      db,
      [
        inArray(entitiesInRules.id, ids),
        isNull(entitiesInRules.deletedAt),
        this.search(search, [this.column("name")]),
        this.excludeIds(excludeIds),
      ],
      this.pageOrder(this.orderBy(this.column("name"))),
      this.paginate(pagination),
    );
    return this.paginated(
      rows.map(({ id, name, description }) => ({ id, name, description })),
      pagination,
    );
  }
}

export default PowersRepository;
