import type * as cheerio from "cheerio";
import { type AnyNode } from "domhandler";

import { type DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { normalizeWs } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Split a Special column value on commas/periods, but not inside parentheses. */
function splitSpecial(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (depth === 0 && ch === ",") {
      parts.push(current);
      current = "";
    } else if (
      depth === 0 &&
      ch === "." &&
      i + 1 < text.length &&
      /\s/.test(text[i + 1]) &&
      /[A-Za-z]/.test(text[i + 2] ?? "")
    ) {
      // Split on ". " followed by a letter (sentence boundary)
      parts.push(current);
      current = "";
      i++; // skip the space
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Reading a class's tables: its advancement and its spells known. */
export function ReadsProgression<B extends Constructor<DndToolsPage>>(Base: B) {
  abstract class ReadingProgression extends Base {
    /**
     * The text over each column of a table's header rows above its main one, by column: each cell placed past those a row
     * above spans down into, over the columns it spans ("Unarmed" over the monk's "Damage").
     */
    private headersAbove(rows: AnyNode[]): string[] {
      const grid: string[][] = rows.map(() => []);
      for (const [r, row] of rows.entries()) {
        let column = 0;
        this.$(row)
          .children("th")
          .each((_, th) => {
            while (grid[r][column] !== undefined) column++;
            const text = normalizeWs(this.$(th).text().trim());
            const rowspan = parseInt(this.$(th).attr("rowspan") ?? "1", 10);
            const colspan = parseInt(this.$(th).attr("colspan") ?? "1", 10);
            for (let dr = 0; dr < rowspan && r + dr < rows.length; dr++)
              for (let dc = 0; dc < colspan; dc++) grid[r + dr][column + dc] = text;

            column += colspan;
          });
      }
      const width = Math.max(0, ...grid.map((row) => row.length));
      return Array.from({ length: width }, (_, column) =>
        [...new Set(grid.map((row) => row[column]).filter(Boolean))].join(" "),
      );
    }

    /**
     * The class's advancement: its first table whose header row names a level and a base attack bonus, a row per level
     * from the 1st, and whether its spells per day start at cantrips. Its cells lose their footnote markers (<sup>), which
     * the page's later readings no longer see.
     */
    progression(): { hasCantrips?: boolean; progression: ClassReference["raw"]["progression"] } {
      const progression: ClassReference["raw"]["progression"] = [];
      let hasCantrips: boolean | undefined;

      this.$("table").each((_, table) => {
        const tbody = this.$(table).children("tbody");

        // Find ALL header rows (rows with <th> cells) from the table
        const headerRows = this.$(table)
          .find("tr")
          .filter((_, row) => this.$(row).children("th").length > 0);
        if (headerRows.length === 0) return;

        // Find the header row that contains Level and BAB columns
        // This may be the first row (simple) or the second (when first row is spanning groups)
        let mainHeaderRow: cheerio.Cheerio<AnyNode> | null = null;
        let mainHeaderIndex = 0;
        headerRows.each((index, row) => {
          if (mainHeaderRow) return;
          mainHeaderIndex = index;
          const ths: string[] = [];
          this.$(row)
            .children("th")
            .each((_, th) => {
              ths.push(this.$(th).text().trim().toLowerCase());
            });
          const hasLevel = ths.some((h) => h.includes("level"));
          const hasBab = ths.some((h) => h.includes("base") || h.includes("attack") || h === "bab");
          if (hasLevel && hasBab) mainHeaderRow = this.$(row);
        });

        if (!mainHeaderRow) return;

        // Data rows are in <tbody> or directly in the table
        const dataRowContainer = tbody.length > 0 ? tbody : this.$(table);
        const directRows = dataRowContainer.children("tr");

        // Build column map including colspan expansion, and each column's header as the page writes it
        const firstRowHeaders: string[] = [];
        const headerNames: string[] = [];
        const headerRow = mainHeaderRow as cheerio.Cheerio<AnyNode>;
        const above = this.headersAbove(headerRows.toArray().slice(0, mainHeaderIndex));
        headerRow.children("th").each((_, th) => {
          const text = this.$(th).text().trim().toLowerCase();
          const name = [above[headerNames.length], normalizeWs(this.$(th).text().trim())].filter(Boolean).join(" ");
          const colspan = parseInt(this.$(th).attr("colspan") ?? "1", 10);
          firstRowHeaders.push(text);
          headerNames.push(name);
          for (let i = 1; i < colspan; i++) {
            firstRowHeaders.push(`${text}:${i}`);
            headerNames.push(`${name}:${i}`);
          }
        });

        // Check for cantrips — either "0th" / "0" in the main header,
        // or a sub-header row after the main header starting with "0"
        if (firstRowHeaders.some((h) => h === "0th" || h === "0")) {
          hasCantrips = true;
        } else {
          const nextRow = headerRow.next("tr");
          if (nextRow.children("th").length > 0) {
            const subHeaders: string[] = [];
            nextRow.children("th").each((_, th) => {
              subHeaders.push(this.$(th).text().trim().toLowerCase());
            });
            if (subHeaders.length > 0 && subHeaders[0] === "0") hasCantrips = true;
          }
        }

        const levelIdx = firstRowHeaders.findIndex((h) => h.includes("level"));
        const babIdx = firstRowHeaders.findIndex((h) => h.includes("base") || h.includes("attack") || h === "bab");
        const fortIdx = firstRowHeaders.findIndex((h) => h.includes("fort"));
        const refIdx = firstRowHeaders.findIndex((h) => h.includes("ref"));
        const willIdx = firstRowHeaders.findIndex((h) => h.includes("will"));
        const specialIdx = firstRowHeaders.findIndex((h) => h.includes("special"));

        // Detect spell columns — either explicit "spells per day" header or
        // numeric ordinal columns (1st, 2nd, ...) after the Special column,
        // or a spanning header row above with "Spells per Day"
        let spellStartIdx = firstRowHeaders.findIndex(
          (h) => h.includes("spells per day") || h.includes("spells") || h === "spellcasting",
        );
        let spellColCount = 0;

        if (spellStartIdx >= 0) {
          spellColCount = firstRowHeaders.filter((h) => h.startsWith(firstRowHeaders[spellStartIdx])).length;
        } else {
          // Check for ordinal columns (0th, 1st, 2nd, ...) after Special
          const ordinalPattern = /^(\d+)(?:st|nd|rd|th)$/;
          const afterSpecial = specialIdx >= 0 ? specialIdx + 1 : -1;
          if (afterSpecial > 0 && afterSpecial < firstRowHeaders.length) {
            if (ordinalPattern.test(firstRowHeaders[afterSpecial])) {
              spellStartIdx = afterSpecial;
              for (let i = afterSpecial; i < firstRowHeaders.length; i++) {
                if (ordinalPattern.test(firstRowHeaders[i])) spellColCount++;
                else break;
              }
            }
          }
        }

        // The table's other columns, by header: what only they give (a monk's AC bonus) a class's overrides can read
        const knownIdx = new Set([levelIdx, babIdx, fortIdx, refIdx, willIdx, specialIdx]);
        for (let i = 0; i < spellColCount; i++) knownIdx.add(spellStartIdx + i);
        const otherIdx = headerNames.map((_, i) => i).filter((i) => !knownIdx.has(i) && headerNames[i]);

        let expectedLevel = 1;
        directRows.each((_, row) => {
          const cells: string[] = [];
          this.$(row)
            .children("td")
            .each((_, cell) => {
              this.$(cell).find("sup").remove();
              cells.push(this.$(cell).text().trim());
            });
          if (cells.length < 5) return;

          const levelText = cells[levelIdx];
          const levelMatch = levelText.match(/^(\d+)(?:st|nd|rd|th)$/);
          if (!levelMatch) return;
          const level = parseInt(levelMatch[1], 10);

          if (level !== expectedLevel) return;
          expectedLevel++;

          const babText = cells[babIdx];
          const babMatch = babText.match(/\+?(\d+)/);
          const bab = babMatch ? parseInt(babMatch[1], 10) : 0;

          const fortSave = parseInt(cells[fortIdx]?.replace(/[^0-9]/g, ""), 10) || 0;
          const refSave = parseInt(cells[refIdx]?.replace(/[^0-9]/g, ""), 10) || 0;
          const willSave = parseInt(cells[willIdx]?.replace(/[^0-9]/g, ""), 10) || 0;

          const specialText = specialIdx >= 0 ? cells[specialIdx] : "";
          const special = specialText
            ? splitSpecial(specialText)
                .map((s) => normalizeWs(s.trim().replace(/'(\w+)'/g, " $1")))
                .filter((s) => s && s.length > 1 && !/^[\u2014\u2013\u2012\u2015\uFFFD'"-]+$/.test(s))
            : [];

          let spellsPerDay: string | undefined;
          if (spellStartIdx >= 0 && spellColCount > 0) {
            const spellValues: string[] = [];
            for (let i = 0; i < spellColCount; i++) {
              const val = cells[spellStartIdx + i] ?? "";
              spellValues.push(val);
            }
            const joined = spellValues.join("/");
            if (joined.includes("+1 level")) spellsPerDay = joined;
            else spellsPerDay = spellValues.join(",");
          }

          const columns = Object.fromEntries(otherIdx.map((i) => [headerNames[i], normalizeWs(cells[i] ?? "")]));
          progression.push({
            level,
            bab,
            fortSave,
            refSave,
            willSave,
            special,
            spellsPerDay,
            ...(otherIdx.length > 0 && { columns }),
          });
        });

        if (progression.length > 0) return false;
      });

      return { progression, hasCantrips };
    }

    /**
     * The class's spells known: its first table, not its advancement nor its skills', labelled "known" or of a level and
     * ordinal columns alone, a row of slots per level (a sum for "N+M", "—" for none).
     */
    spellsKnown(): string[] {
      const results: string[] = [];

      this.$("table").each((_, table) => {
        const headers: string[] = [];
        this.$(table)
          .find("th")
          .each((_, th) => {
            headers.push(this.$(th).text().trim().toLowerCase());
          });

        const headerText = headers.join(" ");
        // Skip progression tables (have BAB/attack columns)
        if (headerText.includes("base") || headerText.includes("attack") || headerText.includes("bab")) return;
        // Skip skill tables
        if (headerText.includes("skill")) return;
        // Match: explicit "known" label OR a Level + ordinal-only table (no BAB/Fort/etc.)
        const hasLevel = headers.some((h) => h.includes("level"));
        const hasOrdinals = headers.some((h) => /^\d+(?:st|nd|rd|th)$/.test(h));
        const isKnownTable =
          headerText.includes("known") ||
          (hasLevel && hasOrdinals && !headerText.includes("fort") && !headerText.includes("special"));
        if (!isKnownTable) return;

        this.$(table)
          .find("tr")
          .each((_, row) => {
            const cells: string[] = [];
            this.$(row)
              .find("td")
              .each((_, td) => {
                this.$(td).find("sup").remove();
                cells.push(this.$(td).text().trim());
              });
            if (cells.length < 2) return;

            const levelMatch = cells[0].match(/^(\d+)(?:st|nd|rd|th)?$/);
            if (!levelMatch) return;

            const slots = cells.slice(1).map((c) => {
              const trimmed = c.trim();
              if (trimmed === "\u2014" || trimmed === "-" || trimmed === "") return "\u2014";
              if (trimmed.includes("+")) {
                const sum = trimmed.split("+").reduce((acc, part) => acc + (parseInt(part.trim(), 10) || 0), 0);
                return String(sum);
              }
              const cleaned = trimmed.replace(/[^0-9]/g, "");
              return cleaned === "" ? "\u2014" : cleaned;
            });
            results.push(slots.join(","));
          });

        if (results.length > 0) return false;
      });

      return results;
    }
  }
  return ReadingProgression;
}
