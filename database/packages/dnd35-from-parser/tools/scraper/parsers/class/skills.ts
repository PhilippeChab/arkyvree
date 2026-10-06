/** A class's skills: the table under its page's <h3>Class skills</h3>. */

import type * as cheerio from "cheerio";

import { capitalizeTitle } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/capitalizeTitle.ts";
import { findSectionHeader } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/sections.ts";
import { findSectionElements, getTagName } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";

/** Known Knowledge subspecialties for expansion */
const KNOWLEDGE_SUBSPECIALTIES: Record<string, string> = {
  arcana: "Knowledge (Arcana)",
  "architecture and engineering": "Knowledge (Architecture and Engineering)",
  dungeoneering: "Knowledge (Dungeoneering)",
  geography: "Knowledge (Geography)",
  history: "Knowledge (History)",
  local: "Knowledge (Local)",
  nature: "Knowledge (Nature)",
  "nobility and royalty": "Knowledge (Nobility and Royalty)",
  psionics: "Knowledge (Psionics)",
  religion: "Knowledge (Religion)",
  "the planes": "Knowledge (The Planes)",
};

const ALL_KNOWLEDGE = Object.values(KNOWLEDGE_SUBSPECIALTIES);

export function parseClassSkills($: cheerio.CheerioAPI): string[] {
  const skills: string[] = [];

  const header = findSectionHeader($, /^Class Skills$/i);
  if (header.length === 0) return skills;

  // Look for the skills table after the header
  for (const el of findSectionElements(header)) {
    if (getTagName(el) === "table") {
      el.find("tr").each((_, row) => {
        const firstCell = $(row).find("td").first();
        if (firstCell.length === 0) return;

        const link = firstCell.find("a").first();
        const skillName = link.length > 0 ? link.text().trim() : firstCell.text().trim();
        if (!skillName) return;

        // Handle Knowledge subspecialties
        if (skillName.toLowerCase().startsWith("knowledge")) {
          // Try extracting subspecialty from cell text or skill name
          const text = firstCell.text().trim();
          const subMatch = text.match(/Knowledge\s*\(([^)]+)\)/i) ?? skillName.match(/Knowledge\s*\(([^)]+)\)/i);
          if (subMatch) {
            const sub = subMatch[1].toLowerCase().trim();
            if (/^all\b/i.test(sub)) {
              skills.push(...ALL_KNOWLEDGE);
            } else {
              const mapped = KNOWLEDGE_SUBSPECIALTIES[sub];
              skills.push(mapped ?? `Knowledge (${capitalizeTitle(sub)})`);
            }
          } else {
            // Check URL for subspecialty
            const href = link.attr("href") ?? "";
            const slugMatch = href.match(/\/skills\/knowledge-([^/]+)\//);
            if (slugMatch) {
              const sub = slugMatch[1].replace(/-/g, " ").toLowerCase();
              const mapped = KNOWLEDGE_SUBSPECIALTIES[sub];
              skills.push(mapped ?? `Knowledge (${capitalizeTitle(sub)})`);
            } else {
              skills.push(...ALL_KNOWLEDGE);
            }
          }
        } else {
          skills.push(skillName);
        }
      });

      if (skills.length > 0) break;
    }
  }

  return skills;
}
