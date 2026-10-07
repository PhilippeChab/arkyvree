import { PrerequisiteText } from "@/codegen/dnd3.5/tools/scraper/pages/class/PrerequisiteText.ts";
import { type DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { Page } from "@/codegen/dnd3.5/tools/scraper/pages/Page.ts";
import { normalizeWs } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Reading a prestige class's prerequisites: its page's Requirements section, and what its text asks. */
export function ReadsPrerequisites<B extends Constructor<DndToolsPage>>(Base: B) {
  abstract class ReadingPrerequisites extends Base {
    /**
     * The prerequisites' text: its Requirements section's lines (an element's own lines kept apart), else an h6
     * Requirements section's (an older page's), else what the page's text says after "To qualify".
     */
    private prerequisiteText(): string {
      const reqHeader = this.heading(/^Requirements?$/i);
      if (reqHeader.length > 0) {
        const lines: string[] = [];
        for (const el of Page.section(reqHeader)) {
          const subLines = el.text().split(/\n/).map(normalizeWs).filter(Boolean);
          if (subLines.length) lines.push(subLines.join("\n"));
        }
        return lines.join("\n");
      }

      const h6Header = this.$("h6").filter(
        (_, el) =>
          this.$(el)
            .text()
            .trim()
            .match(/^Requirements?$/i) !== null,
      );
      if (h6Header.length > 0) {
        const lines: string[] = [];
        for (const el of Page.section(h6Header.first(), ["h6", "h3", "table"])) {
          const text = el.text().trim();
          if (text) lines.push(text);
        }
        return lines.join("\n");
      }

      const match = this.$("body")
        .text()
        .match(/To qualify[^.]*\.\s*([\s\S]*?)(?:Class Skills|Class Features|Hit Die)/i);
      return match ? match[1].trim() : "";
    }

    /** The class's prerequisites: their text, and what it asks (`PrerequisiteText`). */
    prerequisites(): ClassReference["raw"]["prerequisites"] {
      const text = this.prerequisiteText();
      return { text, parsed: new PrerequisiteText(text).parsed() };
    }
  }
  return ReadingPrerequisites;
}
