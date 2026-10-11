import { type Column, ilike, or, sql, type SQL, type Table } from "drizzle-orm";

import type { Constructor } from "@/lib/mixins.ts";
import type BaseRepository from "@/server/repositories/BaseRepository.ts";

/**
 * How close a search must come to a name's words to find it by a typo ("Magic Missle"): their strict word similarity
 * (pg_trgm), which compares whole words. `word_similarity` matched letters across words too ("Wand" in "Guards and
 * Wards", in a description's "was and").
 */
const NAME_SIMILARITY = 0.6;

/** Text search over a list's columns, and the order that puts the best matches first. */
export function Searches<B extends Constructor<BaseRepository<Table>>>(Base: B) {
  abstract class Searching extends Base {
    /**
     * A search over a list's columns, its first its name: what holds the text, or a name the text is a typo of
     * (`NAME_SIMILARITY`).
     */
    protected fuzzySearch(search: string | undefined, columns: Column[]): SQL | false {
      if (!search) return false;
      return or(
        ...columns.map((column) => ilike(column, `%${search}%`)),
        sql`strict_word_similarity(${search}, ${columns[0]}) >= ${NAME_SIMILARITY}`,
      )!;
    }

    protected search(search: string | undefined, columns: Column[]): SQL | false {
      if (!search) return false;
      return or(...columns.map((column) => ilike(column, `%${search}%`)))!;
    }

    /**
     * A searched list's order: what holds the text first, a name that does before a description, then the names closest
     * to it, then the list's own order (`fallback`).
     */
    protected searchOrderBy(search: string | undefined, columns: Column[], fallback: SQL): SQL {
      if (!search) return fallback;
      const ilikeMatch = or(...columns.map((c) => ilike(c, `%${search}%`)))!;
      const nameIlikeMatch = ilike(columns[0], `%${search}%`);
      const nameSimilarity = sql`strict_word_similarity(${search}, ${columns[0]})`;
      return sql`(CASE WHEN ${ilikeMatch} THEN 0 ELSE 1 END), (CASE WHEN ${nameIlikeMatch} THEN 0 ELSE 1 END), ${nameSimilarity} DESC, ${fallback}`;
    }
  }
  return Searching;
}
