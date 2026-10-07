/**
 * Race HTML Parser — dndtools.net structure
 *
 * Listing page: /races/?rulebook=N
 *   <table> with rows: <td><a href="/races/{book}/{slug}/">Race Name</a></td>
 *
 * Detail page: /races/{book}/{slug}/
 *   <h2>Race Name</h2>
 *   <h3>Attributes</h3>
 *     <table> Size, Base speed, ability scores, Favored Classes
 *   <h3>Description</h3> <p>...</p>
 *   <h3>Racial Traits</h3> <ul><li>...</li></ul>
 */

import * as cheerio from "cheerio";

import { normalizeWs, PART_SEPARATOR } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { NamedText } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { SIZE_OPTIONS, type SizeType } from "@/shared/enums.ts";

import { buildFrameHeading } from "./frame.ts";
import { findSectionElements, getPageTitle, getTagName } from "./page.ts";

const ABILITY_NAMES = new Set(["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]);

/** dndtools' Django ids of the sizes, for its "RaceSize object (N)" rendering: the site's keys, not ours. */
const DNDTOOLS_SIZE_IDS: Record<string, SizeType> = {
  "1": "Fine",
  "2": "Diminutive",
  "3": "Tiny",
  "4": "Small",
  "5": "Medium",
  "6": "Large",
  "7": "Huge",
  "8": "Gargantuan",
  "9": "Colossal",
};

/** The control character the SRD's race pages open each trait with: read as the part separator it stands for. */
const PAGE_TRAIT_MARK = "\u0001";

/** A race page's frame also heads its listing "Races". */
const RACE_FRAME_HEADING = buildFrameHeading("Races");

function parseAbilityValue(text: string): number {
  // Handle "+2", "−2" (Unicode minus), "-2" (ASCII hyphen), "+0"
  const normalized = text.replace(/[−–]/g, "-");
  const match = normalized.match(/([+-]?\d+)/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

function parseFeatureText(text: string): { description: string; name: string } {
  // Split on first colon if the prefix is a reasonable name length
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 80) {
    return {
      name: text.substring(0, colonIdx).trim(),
      description: text.substring(colonIdx + 1).trim(),
    };
  }
  // Fallback: use first sentence
  const dotIdx = text.indexOf(".");
  if (dotIdx > 0 && dotIdx < 80) {
    return {
      name: text.substring(0, dotIdx).trim(),
      description: text.substring(dotIdx + 1).trim(),
    };
  }
  return { name: text.substring(0, 60), description: text };
}

function parseSize(text: string): string {
  // Try the size names first (case-insensitive)
  for (const s of SIZE_OPTIONS) if (text.toLowerCase().includes(s.toLowerCase())) return s;

  // Fallback: "RaceSize object (N)" pattern from Django
  const idMatch = text.match(/\((\d+)\)/);
  if (idMatch && DNDTOOLS_SIZE_IDS[idMatch[1]]) return DNDTOOLS_SIZE_IDS[idMatch[1]];
  return text;
}

function parseSpeed(text: string): number {
  // "RaceSpeedType object (9) 20" → extract the last number (actual speed)
  // "20 feet" → 20
  const numbers = [...text.matchAll(/(\d+)/g)].map((m) => parseInt(m[1], 10));
  // The actual speed is the last number (after the Django object ID)
  return numbers.length > 0 ? numbers[numbers.length - 1] : 0;
}

/**
 * Parse a single race detail page.
 */
export function parseRaceDetailHtml(html: string): RaceReference["raw"][number] | null {
  const $ = cheerio.load(html.replaceAll(PAGE_TRAIT_MARK, PART_SEPARATOR));

  const name = getPageTitle($, RACE_FRAME_HEADING);
  if (!name) return null;

  // Parse attributes table
  let size = "";
  let baseSpeed = 0;
  const abilityAdjustments: { ability: string; value: number }[] = [];
  let favoredClass: string | undefined;

  $("table tr").each((_, row) => {
    const cells = $(row).find("td, th");
    if (cells.length < 2) return;

    const label = $(cells[0]).text().trim().replace(/:$/, "");
    const valueCell = $(cells[1]);
    const valueText = valueCell.text().trim();

    if (/^Size$/i.test(label)) {
      size = parseSize(valueText);
    } else if (/base speed/i.test(label)) {
      baseSpeed = parseSpeed(valueText);
    } else if (ABILITY_NAMES.has(label)) {
      const value = parseAbilityValue(valueText);
      if (value !== 0) abilityAdjustments.push({ ability: label, value });
    } else if (/^favored class/i.test(label)) {
      const link = valueCell.find("a").first();
      const fc = link.length > 0 ? link.text().trim() : valueText;
      if (fc && !/^any$/i.test(fc)) favoredClass = fc;
    }
  });

  // Parse description
  const descParts: string[] = [];
  const descHeader = $("h3")
    .filter((_, el) => /^Description/i.test($(el).text().trim()))
    .first();

  if (descHeader.length > 0) {
    for (const el of findSectionElements(descHeader)) {
      const tag = getTagName(el);
      if (tag === "p" || tag === "div") {
        const text = el.text().trim();
        if (text) descParts.push(text);
      }
    }
  }
  const description = normalizeWs(descParts.join(" "));

  // Parse racial traits
  const features: NamedText[] = [];
  const traitsHeader = $("h3")
    .filter((_, el) => /^Racial Traits/i.test($(el).text().trim()))
    .first();

  if (traitsHeader.length > 0) {
    for (const el of findSectionElements(traitsHeader)) {
      const tag = getTagName(el);
      if (tag === "ul" || tag === "ol") {
        el.find("li").each((_, li) => {
          const text = normalizeWs($(li).text());
          if (text) features.push(parseFeatureText(text));
        });
      } else if (tag === "p") {
        const text = normalizeWs(el.text());
        if (text) features.push(parseFeatureText(text));
      }
    }
  }

  return {
    name,
    description,
    size,
    baseSpeed,
    abilityAdjustments,
    ...(favoredClass ? { favoredClass } : {}),
    features,
  };
}
