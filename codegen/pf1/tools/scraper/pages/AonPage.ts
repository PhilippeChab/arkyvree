/** A page of the Archives of Nethys' Pathfinder 1 database (aonprd.com): an entry, its sources, its parts by heading. */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { Page } from "@/codegen/core/scraper/Page.ts";
import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import type { LabeledText, PageTable, Printing } from "@/codegen/pf1/tools/types/pages.ts";

/** A part of an entry's page: the heading it opens with, the heading's level (1 to 4) and its HTML up to the next. */
export interface PagePart {
  heading: string;
  html: string;
  level: number;
}

/** A heading of the site's content: an h1 to h4 it styles as a title or a frame. */
const HEADING = /<h([1-4]) class="(?:title|framing)">([\s\S]*?)<\/h\1>/g;

/** A line's opening label, bold or in italics, and the colon after it, if any: "<b>Benefit</b>: …". */
const LABEL = /^\s*<(b|i)>([\s\S]*?)<\/\1>\s*(:?)/;

/** A line break. */
const LINE_BREAK = /<br\s*\/?>/i;

/**
 * A note of the site's own, not its entry's book's, up to its line's end, in bold, or in italics too, as the page's
 * parse rewrites the site's mis-nested tags ("<b><i>From Nethys</i></b><i>: No description…</i>"): "<b>From
 * Nethys</b>: This is an NPC class and was not given a description."
 */
const SITE_NOTE = /<b>(?:<i>)?From Nethys(?:<\/i>)?<\/b>(?:<i>)?:[\s\S]*?(?=<br\s*\/?>|<h[1-4]|$)/g;

/** A book a Source line names, and its page. */
const SOURCE_BOOK = /<i>([^<]*?)(?:\s+pg\.\s*(\d+))?<\/i>/g;

/** The Source line opening an entry: its books, each "<i>Book pg. N</i>", up to its line's end. */
const SOURCE_LINE = /<b>Source<\/b>[\s\S]*?(?:<br\s*\/?>|$)/;

/** A part that opens with a Source line of its own: another book's material, where it follows an entry. */
const SOURCE_OPENING = /^\s*<b>Source<\/b>/;

/** A table, whole. */
const TABLE = /<table[\s\S]*?<\/table>/gi;

/** A table row's cells, each its text and the columns it spans. */
function cellsOf($: cheerio.CheerioAPI, row: cheerio.Cheerio<Element>): { span: number; text: string }[] {
  return row
    .find("td, th")
    .toArray()
    .map((cell) => ({ span: Number($(cell).attr("colspan") ?? 1), text: normalizeWs($(cell).text()) }));
}

/** A table's columns: its last header row's, each after the name of the group an earlier header row spans it with. */
function columnsOf(headers: { span: number; text: string }[][]): string[] {
  const spread = headers.map((cells) => cells.flatMap(({ span, text }) => Array<string>(span).fill(text)));
  const last = spread.at(-1) ?? [];
  return last.map((header, at) =>
    [...spread.slice(0, -1).map((groups) => groups[at] ?? ""), header].filter((text) => text !== "").join(" "),
  );
}

/** Whether a table row heads its columns: each of its cells with text is bold, as the site writes headers. */
function isHeaderRow($: cheerio.CheerioAPI, row: cheerio.Cheerio<Element>): boolean {
  const cells = row.find("td, th").toArray();
  return (
    cells.some((cell) => normalizeWs($(cell).text()) !== "") &&
    cells.every((cell) => {
      const text = normalizeWs($(cell).text());
      return text === "" || normalizeWs($(cell).find("b, strong").text()) === text;
    })
  );
}

/**
 * An HTML fragment's text, its line breaks spaces, its whitespace collapsed, and none inside parentheses: the site's
 * marks are images, which leave a space where they stood ("(<img /> +1)": "(+1)"). A table in it reads a row at a
 * time, its cells apart and its rows ending in a semicolon, as its text would otherwise run together ("1d8Color of
 * Beam1Red": "1d8 Color of Beam; 1 Red …").
 */
function textOf(html: string): string {
  // On the parsed fragment: the site leaves its rows' closing tags out, which the parse puts back
  const $ = cheerio.load(html, null, false);
  $("td, th").append(" ");
  $("tr")
    .filter((_, row) => normalizeWs($(row).text()) !== "")
    .append("; ");
  return normalizeWs(Page.text($.root()))
    .replace(/\s+;/g, ";")
    .replace(/;(\s*;)+/g, ";")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

/**
 * A page of aonprd.com's Pathfinder 1 database: an entry, from its title (an h1) to the end of the page's main column,
 * the site's own notes left out ("From Nethys": they aren't the book's).
 * Its parts are its headings' (`parts`), the first its title's; it names the books it's printed in (`sources`), and
 * its parts read as labelled paragraphs (`labeled`), a stat block's inline fields (`fields`) or tables (`tables`).
 */
export class AonPage extends Page {
  constructor(html: string) {
    super(html);
    const main = this.$("#main").html() ?? "";
    const start = main.indexOf('<h1 class="title"');
    this.content = start < 0 ? "" : main.slice(start).replace(SITE_NOTE, "");
  }

  /**
   * A fragment's inline fields, a stat block's: each bold label and its text up to the next label, a semicolon or its
   * line's end ("<b>Range</b> long (400 ft. + 40 ft./level)<br /><b>Area</b> 20-ft.-radius spread"), by label. A
   * label's colon, a value's closing semicolon and an empty value's dash ("—") are left out.
   */
  static fields(html: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const line of AonPage.lines(html)) {
      for (const chunk of line.split(/(?=<b>)/)) {
        const match = /^<b>([\s\S]*?)<\/b>([\s\S]*)$/.exec(chunk);
        if (!match) continue;
        const label = textOf(match[1]).replace(/:$/, "");
        const value = textOf(match[2]).replace(/^:\s*/, "").replace(/[;,]$/, "").trim();
        if (label) fields[label] = value === "—" ? "" : value;
      }
    }
    return fields;
  }

  /**
   * A fragment's labelled paragraphs: a line opening with a label and a colon ("<b>Benefit</b>: …") opens one, and the
   * lines after it carry it on, a space between them; the lines before the first are its intro. A label is bold, or
   * also in italics where a page writes some so (`italics`: a domain's powers, "<i>Lightning Arc (Sp)</i>: …").
   */
  static labeled(html: string, italics = false): { entries: LabeledText[]; intro: string } {
    const entries: LabeledText[] = [];
    const intro: string[] = [];
    for (const line of AonPage.lines(html)) {
      const match = LABEL.exec(line);
      const label = match && (italics || match[1] === "b") ? textOf(match[2]) : "";
      if (match && label && (match[3] === ":" || label.endsWith(":"))) {
        entries.push({ label: label.replace(/:$/, "").trim(), text: textOf(line.slice(match[0].length)) });
      } else if (entries.length > 0) {
        const last = entries[entries.length - 1];
        last.text = [last.text, textOf(line)].filter((text) => text !== "").join(" ");
      } else {
        intro.push(textOf(line));
      }
    }
    return { entries, intro: intro.join(" ") };
  }

  /** A fragment's lines between its line breaks, each its HTML, none without text: its tables aren't any of them. */
  static lines(html: string): string[] {
    return html
      .replace(TABLE, "<br />")
      .split(LINE_BREAK)
      .filter((line) => textOf(line) !== "");
  }

  /** The books a part's Source line names, each its page, in the line's order, which is no fixed one. */
  static sourcesOf(html: string): Printing[] {
    const line = SOURCE_LINE.exec(html)?.[0] ?? "";
    return [...line.matchAll(SOURCE_BOOK)].map(([, book, page]) => ({
      book: normalizeWs(book),
      ...(page ? { page: Number(page) } : {}),
    }));
  }

  /** A fragment's tables, each its columns' headers (`columnsOf`) and its other rows' cells' text. */
  static tables(html: string): PageTable[] {
    const $ = cheerio.load(html, null, false);
    return $("table")
      .toArray()
      .map((table) => {
        const rows = $(table)
          .find("tr")
          .toArray()
          .map((row) => $(row));
        const headerCount = rows.findIndex((row) => !isHeaderRow($, row));
        const headers = rows.slice(0, headerCount < 0 ? rows.length : headerCount);
        return {
          columns: columnsOf(headers.map((row) => cellsOf($, row))),
          rows: rows.slice(headers.length).map((row) => cellsOf($, row).map(({ text }) => text)),
        };
      });
  }

  /** An HTML fragment's text, its line breaks spaces, its whitespace collapsed. */
  static textOf(html: string): string {
    return textOf(html);
  }

  /** A part's HTML past its Source line. */
  static withoutSource(html: string): string {
    return html.replace(SOURCE_LINE, "");
  }

  /** The entry's HTML: from its title to the end of the page's main column. */
  private readonly content: string;

  /**
   * The entry's own parts: its title's, and those after it up to the first h1 or h2 that opens with a Source line of
   * its own, past which a page shows other books' material (a spell's mythic version, a feat's combat trick). An h2
   * without one is the entry's (a Ring of Elemental Command's Air, Earth, Fire and Water).
   */
  ownParts(): PagePart[] {
    const parts = this.parts();
    const end = parts.findIndex((part, at) => at > 0 && part.level <= 2 && SOURCE_OPENING.test(part.html));
    return end < 0 ? parts : parts.slice(0, end);
  }

  /**
   * The entry's parts, by heading, each up to the next heading: the first is its title's, what follows its title up to
   * its first other heading. A page without an entry has none.
   */
  parts(): PagePart[] {
    const headings = [...this.content.matchAll(HEADING)];
    return headings.map((heading, at) => {
      const end = headings[at + 1]?.index ?? this.content.length;
      return {
        heading: textOf(heading[2]),
        html: this.content.slice(heading.index + heading[0].length, end),
        level: Number(heading[1]),
      };
    });
  }

  /**
   * The HTML of the entry's section headed `heading` at `level` (an h2 by default), with the sub-sections under it, each
   * heading a label opening its text ("<b>Heading</b>: …"): none when the entry has no such section.
   */
  section(heading: string, level = 2): string | undefined {
    const parts = this.parts();
    const at = parts.findIndex((part) => part.level === level && part.heading === heading);
    if (at < 0) return undefined;
    const end = parts.findIndex((part, i) => i > at && part.level <= level);
    const under = parts.slice(at + 1, end < 0 ? parts.length : end);
    return [parts[at].html, ...under.map((part) => `<br /><b>${part.heading}</b>: ${part.html}`)].join("");
  }

  /** The books the entry is printed in, as its title's Source line names them (`sourcesOf`). */
  sources(): Printing[] {
    return AonPage.sourcesOf(this.parts()[0]?.html ?? "");
  }

  /** The entry's title: its first heading's text, none for a page without an entry. */
  title(): string {
    return this.parts()[0]?.heading ?? "";
  }

  /** The title's part's HTML past its Source line: what the entry says before its first other heading. */
  titlePart(): string {
    return AonPage.withoutSource(this.parts()[0]?.html ?? "");
  }
}
