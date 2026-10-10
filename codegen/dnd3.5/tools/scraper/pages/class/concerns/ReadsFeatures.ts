import { Page } from "@/codegen/core/scraper/Page.ts";
import { ClassFeatures } from "@/codegen/dnd3.5/tools/scraper/pages/class/ClassFeatures.ts";
import { type DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Reading a class's features: its page's Class Features section (`ClassFeatures`). */
export function ReadsFeatures<B extends Constructor<DndToolsPage>>(Base: B) {
  abstract class ReadingFeatures extends Base {
    /**
     * The class's features, those its advancement (`progression`) names, described by its Class Features section (an
     * h3's or an h4's, else an older page's h6): none without one.
     */
    features(progression: ClassReference["raw"]["progression"]): ClassReference["raw"]["classFeatures"] {
      let header = this.heading(/^Class Features$/i);
      if (header.length === 0) {
        header = this.$("h6")
          .filter((_, el) => /^Class Features$/i.test(this.$(el).text().trim()))
          .first();
      }
      if (header.length === 0) return [];
      return new ClassFeatures(this.$, progression).read(Page.section(header));
    }
  }
  return ReadingFeatures;
}
