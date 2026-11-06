/**
 * The Pathfinder 1 scraper's saved pages (`tests/codegen/pf1/fixtures`): each names its URL and is trimmed to what the
 * parser reads, and to the first section after it, which it leaves out.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A saved page's HTML. */
export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "../../codegen/pf1/fixtures", `${name}.html`), "utf8");
}
