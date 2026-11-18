import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/dnd3.5/tools/scraper/BaseScraper.ts";
import { EpicClassesText } from "@/codegen/dnd3.5/tools/scraper/pages/EpicClassesText.ts";
import { EpicFeatsText } from "@/codegen/dnd3.5/tools/scraper/pages/EpicFeatsText.ts";
import { readRtfText } from "@/codegen/dnd3.5/tools/text/rtf.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * The SRD's epic files, as Wizards of the Coast published them (`www.wizards.com/d20/files/v35/`), from the Internet
 * Archive, whose `id_` serves a file as archived: the SRD's sites refuse a script.
 */
const EPIC_FILES = {
  classes: "https://web.archive.org/web/2010id_/http://www.wizards.com:80/d20/files/v35/EpicClasses.rtf",
  feats: "https://web.archive.org/web/2010id_/http://www.wizards.com:80/d20/files/v35/EpicFeats.rtf",
};

/** Scraping the SRD's epic rules (its own RTF files) into the epic book's references: its feats and its classes'. */
export function ScrapesEpic<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingEpic extends Base {
    /** The SRD's epic class progressions, a class each, into the book's epic class reference. */
    async scrapeEpicClasses() {
      console.log(`Fetching ${EPIC_FILES.classes}...`);
      const raw = new EpicClassesText(readRtfText(await this.http.fetchHtml(EPIC_FILES.classes))).read();
      console.log(`Parsed ${raw.length} epic classes: ${raw.map((entry) => entry.name).join(", ")}`);
      this.saveReference(
        References.path(this.book, "epicClass"),
        this.meta("epicClass", { sourceUrl: EPIC_FILES.classes }),
        raw,
      );
    }

    /** The SRD's epic feats, its psionic ones aside, into the book's feat reference. */
    async scrapeEpicFeats() {
      console.log(`Fetching ${EPIC_FILES.feats}...`);
      const raw = new EpicFeatsText(readRtfText(await this.http.fetchHtml(EPIC_FILES.feats))).read();
      console.log(`Parsed ${raw.length} epic feats`);
      this.saveReference(References.path(this.book, "feat"), this.meta("feat", { sourceUrl: EPIC_FILES.feats }), raw);
    }
  }
  return ScrapingEpic;
}
