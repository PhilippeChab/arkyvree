import { type Column, ilike, or, sql, type SQL, type Table } from "drizzle-orm";

import type { Constructor } from "@/server/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/** Text search over a list's columns, and the order that puts the best matches first. */
export function Searches<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class Searching extends Base {
    protected fuzzySearch(search: string | undefined, columns: Column[]): SQL | false {
      if (!search) return false;
      return or(
        ...columns.map((column) => ilike(column, `%${search}%`)),
        ...columns.map((column) => sql`word_similarity(${search}, ${column}) > 0.7`),
      )!;
    }

    protected search(search: string | undefined, columns: Column[]): SQL | false {
      if (!search) return false;
      return or(...columns.map((column) => ilike(column, `%${search}%`)))!;
    }

    protected searchOrderBy(search: string | undefined, columns: Column[], fallback: SQL): SQL {
      if (!search) return fallback;
      const ilikeMatch = or(...columns.map((c) => ilike(c, `%${search}%`)))!;
      const nameIlikeMatch = ilike(columns[0], `%${search}%`);
      const nameSimilarity = sql`word_similarity(${search}, ${columns[0]})`;
      return sql`(CASE WHEN ${ilikeMatch} THEN 0 ELSE 1 END), (CASE WHEN ${nameIlikeMatch} THEN 0 ELSE 1 END), ${nameSimilarity} DESC, ${fallback}`;
    }
  }
  return Searching;
}
