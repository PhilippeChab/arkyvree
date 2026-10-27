import { and, eq, type InferInsertModel, isNull, not, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { type contributorsInCharacter, type contributorsInRules, usersInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import type { ContributorRole, ContributorStatus } from "@/shared/enums.ts";

import BaseRepository from "./BaseRepository.ts";
import { Paginates } from "./concerns/Paginates.ts";
import { Searches } from "./concerns/Searches.ts";

/** A contribution, as its table (`T`) stores it. */
type Contribution<T extends ContributionTable> = T["$inferSelect"];
type ContributionTable = typeof contributorsInCharacter | typeof contributorsInRules;
/** What a contribution is to, in a `where`: its parent's key (`rulesetId`, `characterId`) and id. */
type Parent<P extends string> = { [K in P]: string };

/** What every contribution's repository includes: its pages, and their search. */
const ContributionBase = include(BaseRepository, Paginates, Searches);

/**
 * A contribution's repository (a ruleset's, a character's): its contributors and their invites, on its own table,
 * under its parent's column (`P`). Each reads its contributions in a list, and with their parent, its own way.
 */
abstract class ContributionRepository<
  T extends ContributionTable,
  P extends Extract<keyof T["$inferSelect"], "characterId" | "rulesetId">,
> extends ContributionBase<T> {
  constructor(
    table: T,
    private readonly parentKey: P,
  ) {
    super(table);
  }

  // Through the concerns, `table` reads as `Table & T`: its own type is T.
  declare protected readonly table: T;

  /**
   * The table as a read takes it: drizzle types a read on the tables it's given, never on a type parameter (`T`), so
   * the read types the rows it answers as `T`'s (`Contribution<T>`).
   */
  private get contributions(): ContributionTable {
    return this.table;
  }

  async backfillUserId(db: Db, email: string, userId: string) {
    const table = this.contributions;
    return await db
      .update(table)
      .set({ userId, updatedAt: new Date().toISOString() })
      .where(and(eq(table.email, email), eq(table.status, "Pending"), isNull(table.userId)))
      .returning();
  }

  async create(db: Db, values: InferInsertModel<T>) {
    return await db.insert(this.table).values(values).returning();
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | (Parent<P> & { status: ContributorStatus; userId: string })
      | (Parent<P> & { email: string; status: ContributorStatus }),
  ) {
    const table = this.contributions;
    const [contribution] = await db
      .select()
      .from(table)
      .where(
        this.branchWhere(
          [
            "id" in where && eq(table.id, where.id),
            "userId" in where && eq(table.userId, where.userId),
            "email" in where && eq(table.email, where.email),
          ],
          [
            "status" in where && eq(this.column(this.parentKey), where[this.parentKey]),
            "status" in where && eq(table.status, where.status),
          ],
        ),
      )
      .limit(1);
    return contribution as Contribution<T> | undefined;
  }

  async findPage(
    db: Db,
    where: Parent<P> & { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;
    const { limit, offset } = this.paginate(pagination);
    const table = this.contributions;

    const searchCondition = search
      ? or(
          this.search(search, [table.email]) || undefined,
          this.search(search, [usersInAccount.username, usersInAccount.emailAddress]) || undefined,
        )
      : undefined;

    const rows = await db
      .select({
        contributor: table,
        user: {
          id: usersInAccount.id,
          username: usersInAccount.username,
          emailAddress: usersInAccount.emailAddress,
        },
      })
      .from(table)
      .leftJoin(usersInAccount, and(eq(table.userId, usersInAccount.id), isNull(usersInAccount.deletedAt)))
      .where(
        and(
          eq(this.column(this.parentKey), where[this.parentKey]),
          not(eq(table.status, "Revoked")),
          not(eq(table.status, "Rejected")),
          searchCondition,
        ),
      )
      .orderBy(...this.pageOrder(this.orderBy(table[orderBy], orderDir)))
      .limit(limit)
      .offset(offset);

    const items = rows.map((row) => ({
      ...(row.contributor as Contribution<T>),
      user: row.user,
    }));

    return this.paginated(items, pagination);
  }

  /** The user's role on the parent, when they're an active contributor: what its policy grants by. */
  async findRole(db: Db, where: Parent<P> & { userId: string }): Promise<ContributorRole | undefined> {
    const table = this.contributions;
    const [contribution] = await db
      .select({ role: table.role })
      .from(table)
      .where(
        this.where([
          eq(table.userId, where.userId),
          eq(this.column(this.parentKey), where[this.parentKey]),
          eq(table.status, "Active"),
        ]),
      )
      .limit(1);

    return contribution?.role;
  }

  async update(db: Db, values: Partial<InferInsertModel<T>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, where.id))
      .returning();
  }
}

export default ContributionRepository;
