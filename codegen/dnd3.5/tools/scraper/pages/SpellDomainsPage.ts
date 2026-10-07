/** A spell's page of dndtools' database, as its copy at dnd.arkalseif.info keeps it: its level in each domain version. */

import { Page } from "./Page.ts";

/** A spell's page: the domain versions it has a level in. */
export class SpellDomainsPage extends Page {
  /** The domain versions the spell's page gives it a level in: each version's page slug, with the level. */
  levels(): Map<string, number> {
    const levels = new Map<string, number>();
    this.$('#content a[href*="/domains/"]').each((_, el) => {
      const slug = this.$(el)
        .attr("href")
        ?.match(/\/domains\/([^/]+)\/index\.html$/)?.[1];
      const next = el.nextSibling;
      const level = next?.type === "text" ? next.data.match(/^\s*(\d+)/)?.[1] : undefined;
      if (slug && level !== undefined) levels.set(slug, Number(level));
    });
    return levels;
  }
}
