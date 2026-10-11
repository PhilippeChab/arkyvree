import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { Page } from "@/codegen/core/scraper/Page.ts";
import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { ClassFeatures } from "@/codegen/dnd3.5/tools/scraper/pages/class/ClassFeatures.ts";
import { type DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A paragraph that opens with a feature's name: "Name:", "Name (Ex):". */
const FEATURE_LABEL = /^[A-Z][^:]{2,60}?\s*(?:\((?:Ex|Su|Sp)\)\s*)?:\s/;

/** The name the paragraph a class gives its languages in opens with: "Bonus Languages:", "Bonus Language:". */
const LANGUAGES_LABEL = /^Bonus Languages?\s*:\s*/i;

/**
 * Reading a class's features and its languages: its page's Class Features section, its features by `ClassFeatures`,
 * its languages by the paragraph that gives them.
 */
export function ReadsFeatures<B extends Constructor<DndToolsPage>>(Base: B) {
  abstract class ReadingFeatures extends Base {
    /** The class's Class Features section: an h3's or an h4's, else an older page's h6; none without one. */
    private featuresSection(): cheerio.Cheerio<AnyNode>[] | undefined {
      let header = this.heading(/^Class Features$/i);
      if (header.length === 0) {
        header = this.$("h6")
          .filter((_, el) => /^Class Features$/i.test(this.$(el).text().trim()))
          .first();
      }
      return header.length === 0 ? undefined : Page.section(header);
    }

    /**
     * The class's features, those its advancement (`progression`) names, described by its Class Features section:
     * none without one.
     */
    features(progression: ClassReference["raw"]["progression"]): ClassReference["raw"]["classFeatures"] {
      const section = this.featuresSection();
      return section ? new ClassFeatures(this.$, progression).read(section) : [];
    }

    /**
     * What the class's Class Features section says of languages: its "Bonus Languages" paragraph's text past its name,
     * then the paragraphs that continue it, up to the next feature's (the druid's Druidic); none without one.
     */
    languages(): string | undefined {
      const texts: string[] = [];
      for (const el of this.featuresSection() ?? []) {
        const isParagraph = Page.tagName(el) === "p";
        const text = normalizeWs(Page.text(el));
        if (texts.length === 0) {
          if (isParagraph && LANGUAGES_LABEL.test(text)) texts.push(text.replace(LANGUAGES_LABEL, ""));
        } else if (isParagraph && el.find("strong, b").length === 0 && !FEATURE_LABEL.test(text)) {
          if (text) texts.push(text);
        } else {
          break;
        }
      }
      return texts.length > 0 ? texts.join(" ") : undefined;
    }
  }
  return ReadingFeatures;
}
