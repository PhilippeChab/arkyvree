import type { Table } from "drizzle-orm";

import type { Constructor } from "@/server/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

export type Paginated<T> = {
  items: T[];
  page: number;
  nextPage: number | undefined;
};

/** A page of a list held in memory, shaped like the repositories' pages. */
export function pageOf<T>(items: T[], pagination: { limit: number; page: number }): Paginated<T> {
  const start = (pagination.page - 1) * pagination.limit;
  return {
    items: items.slice(start, start + pagination.limit),
    page: pagination.page,
    nextPage: start + pagination.limit < items.length ? pagination.page + 1 : undefined,
  };
}

/** A list a page at a time: a query fetches one row past the page to know whether another follows. */
export function Paginates<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class Paginating extends Base {
    protected paginate(query: { limit: number; page: number }) {
      return {
        limit: query.limit + 1,
        offset: (query.page - 1) * query.limit,
      };
    }

    protected paginated<R>(rows: R[], query: { limit: number; page: number }) {
      const limit = query.limit;

      return {
        items: rows.slice(0, limit),
        page: query.page,
        nextPage: rows.length > limit ? query.page + 1 : undefined,
      };
    }

    protected async withPagination<R>(
      query: { limit: number; page: number },
      callback: (paginate: { limit: number; offset: number }) => Promise<R[]>,
    ) {
      const rows = await callback(this.paginate(query));

      return this.paginated(rows, query);
    }

    /** Every page of a paginated query, together. */
    async findAll<R>(
      callback: (pagination: { limit: number; page: number }) => Promise<Paginated<R>>,
      limit = 100,
    ): Promise<R[]> {
      const items: R[] = [];
      let page = 1;

      while (true) {
        const result = await callback({ limit, page });
        items.push(...result.items);
        if (!result.nextPage) break;
        page = result.nextPage;
      }

      return items;
    }
  }
  return Paginating;
}
