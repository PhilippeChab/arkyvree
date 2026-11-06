import { toCamelCase } from "@/codegen/core/text/names.ts";
import References from "@/codegen/dnd5.2/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5.2/tools/scraper/BaseScraper.ts";
import { groupClasses } from "@/codegen/dnd5.2/tools/scraper/datasets.ts";
import type { ClassEntry, ClassFeature, ClassLevel, SubclassEntry } from "@/codegen/dnd5.2/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * Scraping the book's classes into a reference each (`classes/<name>.json`): a class with its levels, its features and
 * its subclasses, each with theirs, read off the database's files of each.
 */
export function ScrapesClasses<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingClasses extends Base {
    /** Every class of the book, a reference each. */
    async scrapeClasses() {
      const datasets = {
        Classes: await this.dataset<ClassEntry>("Classes"),
        Levels: await this.dataset<ClassLevel>("Levels"),
        Features: await this.dataset<ClassFeature>("Features"),
        Subclasses: await this.dataset<SubclassEntry>("Subclasses"),
      };
      const classes = groupClasses({
        classes: datasets.Classes.entries,
        levels: datasets.Levels.entries,
        features: datasets.Features.entries,
        subclasses: datasets.Subclasses.entries,
      });
      for (const raw of classes) {
        const outPath = References.classPath(this.book, toCamelCase(raw.class.name));
        this.saveReference<"class">(outPath, this.datasetMeta("class", datasets), raw);
      }
    }
  }
  return ScrapingClasses;
}
