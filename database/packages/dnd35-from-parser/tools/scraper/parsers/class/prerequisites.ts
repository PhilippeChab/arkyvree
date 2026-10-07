/** A prestige class's prerequisites, as its page's <h3>Requirements</h3> writes them. */

import type * as cheerio from "cheerio";

import { findSectionHeader } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/sections.ts";
import { findSectionElements } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

type Parsed = ClassReference["raw"]["prerequisites"]["parsed"];

function extractPrerequisiteText($: cheerio.CheerioAPI): string {
  // dndtools.net: <h4>Requirements</h4> followed by content
  const reqHeader = findSectionHeader($, /^Requirements?$/i);
  if (reqHeader.length > 0) {
    const lines: string[] = [];
    for (const el of findSectionElements(reqHeader)) {
      // Collapse whitespace within each line but preserve newlines as section separators
      const subLines = el.text().split(/\n/).map(normalizeWs).filter(Boolean);
      if (subLines.length) lines.push(subLines.join("\n"));
    }
    return lines.join("\n");
  }

  // Fallback: old h6 structure
  const h6Header = $("h6").filter(
    (_, el) =>
      $(el)
        .text()
        .trim()
        .match(/^Requirements?$/i) !== null,
  );
  if (h6Header.length > 0) {
    const lines: string[] = [];
    for (const el of findSectionElements(h6Header.first(), ["h6", "h3", "table"])) {
      const text = el.text().trim();
      if (text) lines.push(text);
    }
    return lines.join("\n");
  }

  const bodyText = $("body").text();
  const match = bodyText.match(/To qualify[^.]*\.\s*([\s\S]*?)(?:Class Skills|Class Features|Hit Die)/i);
  if (match) return match[1].trim();

  return "";
}

function parsePrerequisiteText(text: string): Parsed {
  const parsed: Parsed = {};

  // BAB
  const babMatch = text.match(/Base Attack Bonus[:\s]*\+(\d+)/i);
  if (babMatch) parsed.bab = parseInt(babMatch[1], 10);

  const skills = requiredSkills(text);
  if (skills.length > 0) parsed.skills = skills;

  const feats = requiredFeats(text);
  if (feats.length > 0) parsed.feats = feats;

  const casterLevels = requiredCasterLevels(text);
  if (casterLevels.length > 0) parsed.casterLevel = casterLevels;

  // Alignment — stop at next labeled section (Skills:, Special:, Feats:, etc.) or end of line
  const alignMatch = text.match(
    /Alignment:\s*([\w\s,-]+?)(?=\s+(?:Skills?|Special|Feats?|Base Attack|Race|Spells?|Class):|[.\n]|$)/im,
  );
  if (alignMatch) parsed.alignment = alignMatch[1].trim();

  const specials = requiredSpecials(text);
  if (specials.length > 0) parsed.special = specials;

  const classLevels = requiredClassLevels(text);
  if (classLevels.length > 0) parsed.classLevels = classLevels;

  const saves = requiredSaves(text);
  if (saves && saves.length > 0) parsed.saves = saves;

  return parsed;
}

/** The spellcasting the prerequisites require: a spell level of a kind (arcane, divine, any), or a kind from 1st. */
function requiredCasterLevels(text: string): NonNullable<Parsed["casterLevel"]> {
  const casterLevels: { type: "divine" | "arcane" | "any"; level: number }[] = [];

  const spellLevelRegex = /(\d+)(?:st|nd|rd|th)[- ]level\s+(divine|arcane)\s*spells?/gi;
  let slMatch;
  while ((slMatch = spellLevelRegex.exec(text)) !== null) {
    casterLevels.push({ type: slMatch[2].toLowerCase() as "divine" | "arcane", level: parseInt(slMatch[1], 10) });
  }

  if (casterLevels.length === 0) {
    const genericMatch = text.match(/(?:Able to|ability to) cast (\d+)(?:st|nd|rd|th)[- ]level\s*spells?/i);
    if (genericMatch) {
      casterLevels.push({ type: "any", level: parseInt(genericMatch[1], 10) });
    }
  }

  const spellOfMatch = text.match(/(arcane|divine)\s+spells?\s+of\s+(\d+)(?:st|nd|rd|th)\s+level/i);
  if (spellOfMatch) {
    casterLevels.push({
      type: spellOfMatch[1].toLowerCase() as "divine" | "arcane",
      level: parseInt(spellOfMatch[2], 10),
    });
  }

  const castTypeMatch = text.match(/(?:Able to|ability to) cast (arcane|divine) spells/i);
  if (castTypeMatch && casterLevels.every((c) => c.type !== castTypeMatch[1].toLowerCase())) {
    casterLevels.push({ type: castTypeMatch[1].toLowerCase() as "divine" | "arcane", level: 1 });
  }
  return casterLevels;
}

/** The levels of classes the prerequisites require ("Rogue level 5th", "3 levels of fighter"). */
function requiredClassLevels(text: string): { className: string; level: number }[] {
  const classLevels: { className: string; level: number }[] = [];
  const classLevelRegex1 = /(\w+)\s+level\s+(\d+)(?:st|nd|rd|th)/gi;
  let classLevelMatch: RegExpExecArray | null;
  while ((classLevelMatch = classLevelRegex1.exec(text)) !== null) {
    const className = classLevelMatch[1].trim();
    const level = parseInt(classLevelMatch[2], 10);
    if (className.toLowerCase() === "caster" || className.toLowerCase() === "character") continue;
    classLevels.push({ className, level });
  }
  const classLevelRegex2 = /(\d+)\s+levels?\s+(?:of\s+)?(\w+)/gi;
  while ((classLevelMatch = classLevelRegex2.exec(text)) !== null) {
    const level = parseInt(classLevelMatch[1], 10);
    const className = classLevelMatch[2].trim();
    if (className.toLowerCase() === "existing" || className.toLowerCase() === "spellcasting") continue;
    classLevels.push({ className, level });
  }
  return classLevels;
}

/** The feats the prerequisites' Feats line lists, "Spell Focus (or any other metamagic feat)" as "any metamagic feat". */
function requiredFeats(text: string): string[] {
  const feats: string[] = [];
  const featSection = text.match(
    /Feats?[:\s]+([\s\S]*?)(?=[\s.]+(?:Skills?|Spells?|Special|Alignment|Race|Base (?:Save Bonus|Attack Bonus)|Class|Speak Language|Patron|Domain)\s*:|\n\n|$)/i,
  );
  if (featSection) {
    const featText = featSection[1].replace(/\n/g, " ").trim();
    const parts = featText.split(/,\s*(?:and\s+)?|\s+and\s+/);
    for (const part of parts) {
      let trimmed = part.trim().replace(/\.$/, "");
      // "Spell Focus (or any other metamagic feat)" → "any metamagic feat"
      trimmed = trimmed.replace(/^.+?\(or any (?:other )?(.+? feat)\)$/i, "any $1");
      if (trimmed && !trimmed.match(/^(or|any|must|have|the)$/i) && trimmed.length > 2 && trimmed.length < 60) {
        feats.push(trimmed);
      }
    }
  }
  return feats;
}

/** The base saves the prerequisites require ("Fort save +4"), each by its full name; none when they name none. */
function requiredSaves(text: string): { name: string; base: number }[] | undefined {
  const saveRegex = /(?:Fort(?:itude)?|Ref(?:lex)?|Will)\s+(?:save\s+)?(?:bonus\s*)?\+(\d+)/gi;
  const saveMatches = [...text.matchAll(saveRegex)];
  if (saveMatches.length === 0) return undefined;
  const saves: { name: string; base: number }[] = [];
  for (const s of saveMatches) {
    const m = s[0].match(/(Fort(?:itude)?|Ref(?:lex)?|Will)\s+(?:save\s+)?(?:bonus\s*)?\+(\d+)/i);
    if (m) {
      let saveName = m[1].toLowerCase();
      if (saveName.startsWith("fort")) saveName = "fortitude";
      if (saveName.startsWith("ref")) saveName = "reflex";
      saves.push({ name: saveName, base: parseInt(m[2], 10) });
    }
  }
  return saves;
}

/** The skills the prerequisites require, with their ranks: not "Any N skills", nor a word a sentence starts with. */
function requiredSkills(text: string): { name: string; ranks: number }[] {
  const skills: { name: string; ranks: number }[] = [];
  const skillRegex = /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?)\s*:?\s*(\d+)\s+ranks?/gi;
  let skillMatch: RegExpExecArray | null;
  while ((skillMatch = skillRegex.exec(text)) !== null) {
    const name = skillMatch[1].trim();
    const ranks = parseInt(skillMatch[2], 10);
    // Filter out non-skill matches and "Any N skills" patterns
    if (name.match(/^(Base|Must|And|The|Can|Has|Level)$/i)) continue;
    if (/^Any\b/i.test(name)) continue;
    skills.push({ name, ranks });
  }
  return skills;
}

/** What else the prerequisites require: a race, a special requirement, what a character "must have" or "must be". */
function requiredSpecials(text: string): string[] {
  const specials: string[] = [];
  const raceMatch = text.match(/Race[:\s]+(.+?)(?:\.|,|\n|$)/i);
  if (raceMatch) specials.push(`Race: ${raceMatch[1].trim()}`);

  const specialMatch = text.match(/Special[:\s]+(.+?)(?:\n|$)/i);
  if (specialMatch) specials.push(specialMatch[1].trim());

  const mustRegex = /Must (?:have |be )(.+?)(?:\.|$)/gi;
  let mustMatch: RegExpExecArray | null;
  while ((mustMatch = mustRegex.exec(text)) !== null) {
    specials.push(mustMatch[1].trim());
  }
  return specials;
}

export function parsePrerequisites($: cheerio.CheerioAPI): ClassReference["raw"]["prerequisites"] {
  const text = extractPrerequisiteText($);
  const parsed = parsePrerequisiteText(text);
  return { text, parsed };
}
