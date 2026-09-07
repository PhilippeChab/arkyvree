import * as cheerio from "cheerio";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

// ---------------------------------------------------------------------------
// Class HTML Parser — dndtools.net structure
//
// HTML layout:
//   <h2>Site Tagline</h2>                    ← skip
//   <h2>Class Name</h2>                      ← second h2
//   <h3>Hit die</h3> <p>d10</p>
//   <h3>Starting gold</h3> <p>...</p>
//   <h3>Skill points</h3> <p>4 + Int</p>
//   <h3>Class Skills</h3>
//   <table> (skill rows with links)
//   <h3>Requirements</h3> (prestige classes)
//   <h3>Class Features</h3>
//   <h4>Feature Name (Ex)</h4> <p>description</p>
//   <h3>Advancement</h3>
//   <table> (Level/BAB/Fort/Ref/Will/Special)
//   <h3>Spells for ClassName</h3>
// ---------------------------------------------------------------------------

export function parseClassHtml(html: string, sourceUrl: string, book: string): ClassReference["raw"] & { _meta: ClassReference["_meta"] } {
  const $ = cheerio.load(html);

  const name = parseClassName($);
  const description = parseDescription($);
  const hitDie = parseHitDie($);
  const skillPointsPerLevel = parseSkillPoints($);
  const classSkills = parseClassSkills($);
  const prerequisites = parsePrerequisites($);
  const alignment = parseAlignment($);
  const { progression, hasCantrips } = parseProgression($);
  const classFeatures = parseClassFeatures($, progression);
  const spellsKnown = parseSpellsKnownTable($);
  const bonusSpellAbility = detectBonusSpellAbility($);

  if (alignment && !prerequisites.parsed.alignment) {
    prerequisites.parsed.alignment = alignment;
  }

  return {
    _meta: {
      type: "class",
      sourceUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    name,
    description,
    hitDie,
    skillPointsPerLevel,
    classSkills,
    prerequisites,
    progression,
    classFeatures,
    ...(spellsKnown.length > 0 ? { spellsKnown } : {}),
    ...(hasCantrips ? { hasCantrips } : {}),
    ...(bonusSpellAbility ? { bonusSpellAbility } : {}),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOWERCASE_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "if", "in", "of", "on", "or", "the", "to", "vs"]);

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      // Always capitalize first word
      if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      // Capitalize words starting with ( — e.g. "(Planar)"
      if (lower.startsWith("(")) return "(" + lower.charAt(1).toUpperCase() + lower.slice(2);
      // Keep articles/prepositions lowercase
      if (LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Class name — second <h2> (first is site tagline)
// ---------------------------------------------------------------------------

function parseClassName($: cheerio.CheerioAPI): string {
  const h2s = $("h2").toArray();
  // Skip site tagline — find the h2 that looks like a class name
  for (const el of h2s) {
    const text = $(el).text().trim();
    // Skip the site tagline and other non-class headings
    if (text.match(/^(Feats|D&D|Welcome|Home|About|Search|Login)/i)) continue;
    if (text.length > 60) continue;
    if (text) return titleCase(text);
  }
  // Fallback
  if (h2s.length > 1) return titleCase($(h2s[1]).text().trim());
  if (h2s.length > 0) return titleCase($(h2s[0]).text().trim());
  return "Unknown";
}

// ---------------------------------------------------------------------------
// Description — paragraphs between class name h2 and first h3
// ---------------------------------------------------------------------------

function parseDescription($: cheerio.CheerioAPI): string {
  const paragraphs: string[] = [];

  // Find the class name h2
  const classH2 = findClassNameH2($);
  if (classH2.length > 0) {
    let el = classH2.next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      // Stop at any section heading
      if (tag === "h2" || tag === "h3" || tag === "h4") break;
      if (tag === "p") {
        const text = el.text().trim();
        // Skip short text, page references, and "all of the following" boilerplate
        if (text && text.length >= 20 &&
            !text.match(/^\(.*p\.\s*\d+\)$/) &&
            !text.match(/^All of the following/i)) {
          paragraphs.push(text);
        }
      }
      // Check inside divs (nice-textile) — but skip if it contains feature headers
      if (tag === "div" && !el.find("h3, h4, strong, b").length) {
        el.find("p").each((_, p) => {
          const text = $(p).text().trim();
          if (text && text.length >= 20) paragraphs.push(text);
        });
      }
      el = el.next();
    }
  }

  return paragraphs.slice(0, 3).join(" ");
}

// ---------------------------------------------------------------------------
// Hit Die — <h3>Hit die</h3> followed by text
// ---------------------------------------------------------------------------

function parseHitDie($: cheerio.CheerioAPI): string {
  const header = findSectionHeader($, /^Hit die$/i);
  if (header.length > 0) {
    const text = getTextAfterHeader(header);
    const match = text.match(/d(\d+)/i);
    if (match) return `d${match[1]}`;
  }

  // Fallback: regex on body text
  const bodyText = $("body").text();
  const hdMatch = bodyText.match(/Hit\s+Die[:\s]*d(\d+)/i);
  if (hdMatch) return `d${hdMatch[1]}`;

  return "d8";
}

// ---------------------------------------------------------------------------
// Skill Points — <h3>Skill points</h3> followed by text
// ---------------------------------------------------------------------------

function parseSkillPoints($: cheerio.CheerioAPI): string {
  const header = findSectionHeader($, /^Skill points$/i);
  if (header.length > 0) {
    const text = getTextAfterHeader(header);
    const match = text.match(/(\d+)\s*\+\s*Int/i);
    if (match) return `${match[1]} + Int modifier`;
  }

  // Fallback: regex on body text
  const bodyText = $("body").text();
  const spMatch = bodyText.match(/Skill Points?\s+(?:at Each|per)\s+(?:Additional\s+)?Level[:\s]*(\d+)\s*\+/i);
  if (spMatch) return `${spMatch[1]} + Int modifier`;

  return "2 + Int modifier";
}

// ---------------------------------------------------------------------------
// Class Skills — table under <h3>Class skills</h3>
// ---------------------------------------------------------------------------

/** Known Knowledge subspecialties for expansion */
const KNOWLEDGE_SUBSPECIALTIES: Record<string, string> = {
  "arcana": "Knowledge (Arcana)",
  "architecture and engineering": "Knowledge (Architecture and Engineering)",
  "dungeoneering": "Knowledge (Dungeoneering)",
  "geography": "Knowledge (Geography)",
  "history": "Knowledge (History)",
  "local": "Knowledge (Local)",
  "nature": "Knowledge (Nature)",
  "nobility and royalty": "Knowledge (Nobility and Royalty)",
  "psionics": "Knowledge (Psionics)",
  "religion": "Knowledge (Religion)",
  "the planes": "Knowledge (The Planes)",
};

const ALL_KNOWLEDGE = Object.values(KNOWLEDGE_SUBSPECIALTIES);

function parseClassSkills($: cheerio.CheerioAPI): string[] {
  const skills: string[] = [];

  const header = findSectionHeader($, /^Class Skills$/i);
  if (header.length === 0) return skills;

  // Look for the skills table after the header
  let el = header.next();
  while (el.length > 0) {
    const tag = el.prop("tagName")?.toLowerCase();
    if (tag === "h3" || tag === "h2") break;

    if (tag === "table") {
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
          const subMatch = text.match(/Knowledge\s*\(([^)]+)\)/i)
            ?? skillName.match(/Knowledge\s*\(([^)]+)\)/i);
          if (subMatch) {
            const sub = subMatch[1].toLowerCase().trim();
            if (/^all\b/i.test(sub)) {
              skills.push(...ALL_KNOWLEDGE);
            } else {
              const mapped = KNOWLEDGE_SUBSPECIALTIES[sub];
              skills.push(mapped ?? `Knowledge (${titleCase(sub)})`);
            }
          } else {
            // Check URL for subspecialty
            const href = link.attr("href") ?? "";
            const slugMatch = href.match(/\/skills\/knowledge-([^/]+)\//);
            if (slugMatch) {
              const sub = slugMatch[1].replace(/-/g, " ").toLowerCase();
              const mapped = KNOWLEDGE_SUBSPECIALTIES[sub];
              skills.push(mapped ?? `Knowledge (${titleCase(sub)})`);
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

    el = el.next();
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

function parseAlignment($: cheerio.CheerioAPI): string | undefined {
  // dndtools.net: <h3>Requirements</h3> → <p><strong>Alignment:</strong> ...</p>
  const reqHeader = findSectionHeader($, /^Requirements?$/i);
  if (reqHeader.length > 0) {
    let el = reqHeader.next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h3" || tag === "h2") break;
      const text = el.text().trim();
      const alignMatch = text.match(/^Alignment:\s*(.+)/i);
      if (alignMatch) return alignMatch[1].trim();
      el = el.next();
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

function parsePrerequisites($: cheerio.CheerioAPI): ClassReference["raw"]["prerequisites"] {
  const text = extractPrerequisiteText($);
  const parsed = parsePrerequisiteText(text);
  return { text, parsed };
}

function extractPrerequisiteText($: cheerio.CheerioAPI): string {
  // dndtools.net: <h4>Requirements</h4> followed by content
  const reqHeader = findSectionHeader($, /^Requirements?$/i);
  if (reqHeader.length > 0) {
    const lines: string[] = [];
    let el = reqHeader.next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h3" || tag === "h2") break;
      // Collapse whitespace within each line but preserve newlines as section separators
      const rawText = el.text();
      const subLines = rawText.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (subLines.length) lines.push(subLines.join("\n"));
      el = el.next();
    }
    return lines.join("\n");
  }

  // Fallback: old h6 structure
  const h6Header = $("h6").filter((_, el) => $(el).text().trim().match(/^Requirements?$/i) !== null);
  if (h6Header.length > 0) {
    const lines: string[] = [];
    let el = h6Header.first().next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h6" || tag === "h3" || tag === "table") break;
      const text = el.text().trim();
      if (text) lines.push(text);
      el = el.next();
    }
    return lines.join("\n");
  }

  const bodyText = $("body").text();
  const match = bodyText.match(/To qualify[^.]*\.\s*([\s\S]*?)(?:Class Skills|Class Features|Hit Die)/i);
  if (match) return match[1].trim();

  return "";
}

function parsePrerequisiteText(text: string): ClassReference["raw"]["prerequisites"]["parsed"] {
  const parsed: ClassReference["raw"]["prerequisites"]["parsed"] = {};

  // BAB
  const babMatch = text.match(/Base Attack Bonus[:\s]*\+(\d+)/i);
  if (babMatch) parsed.bab = parseInt(babMatch[1], 10);

  // Skills
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
  if (skills.length > 0) parsed.skills = skills;

  // Feats
  const feats: string[] = [];
  const featSection = text.match(/Feats?[:\s]+([\s\S]*?)(?=[\s.]+(?:Skills?|Spells?|Special|Alignment|Race|Base (?:Save Bonus|Attack Bonus)|Class|Speak Language|Patron|Domain)\s*:|\n\n|$)/i);
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
  if (feats.length > 0) parsed.feats = feats;

  // Spellcasting
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
    casterLevels.push({ type: spellOfMatch[1].toLowerCase() as "divine" | "arcane", level: parseInt(spellOfMatch[2], 10) });
  }

  const castTypeMatch = text.match(/(?:Able to|ability to) cast (arcane|divine) spells/i);
  if (castTypeMatch && casterLevels.every(c => c.type !== castTypeMatch[1].toLowerCase())) {
    casterLevels.push({ type: castTypeMatch[1].toLowerCase() as "divine" | "arcane", level: 1 });
  }

  if (casterLevels.length > 0) parsed.casterLevel = casterLevels;

  // Alignment — stop at next labeled section (Skills:, Special:, Feats:, etc.) or end of line
  const alignMatch = text.match(/Alignment:\s*([\w\s,-]+?)(?=\s+(?:Skills?|Special|Feats?|Base Attack|Race|Spells?|Class):|[.\n]|$)/im);
  if (alignMatch) parsed.alignment = alignMatch[1].trim();

  // Race / Special
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
  if (specials.length > 0) parsed.special = specials;

  // Class levels
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
  if (classLevels.length > 0) parsed.classLevels = classLevels;

  // Saves
  const saveRegex = /(?:Fort(?:itude)?|Ref(?:lex)?|Will)\s+(?:save\s+)?(?:bonus\s*)?\+(\d+)/gi;
  const saveMatches = [...text.matchAll(saveRegex)];
  if (saveMatches.length > 0) {
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
    if (saves.length > 0) parsed.saves = saves;
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Progression table
// ---------------------------------------------------------------------------

function parseProgression($: cheerio.CheerioAPI): { progression: ClassReference["raw"]["progression"]; hasCantrips?: boolean } {
  const progression: ClassReference["raw"]["progression"] = [];
  let hasCantrips: boolean | undefined;

  $("table").each((_, table) => {
    const tbody = $(table).children("tbody");

    // Find ALL header rows (rows with <th> cells) from the table
    const headerRows = $(table).find("tr").filter((_, row) => $(row).children("th").length > 0);
    if (headerRows.length === 0) return;

    // Find the header row that contains Level and BAB columns
    // This may be the first row (simple) or the second (when first row is spanning groups)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mainHeaderRow: cheerio.Cheerio<any> | null = null;
    headerRows.each((_, row) => {
      if (mainHeaderRow) return;
      const ths: string[] = [];
      $(row).children("th").each((_, th) => { ths.push($(th).text().trim().toLowerCase()); });
      const hasLevel = ths.some((h) => h.includes("level"));
      const hasBab = ths.some((h) => h.includes("base") || h.includes("attack") || h === "bab");
      if (hasLevel && hasBab) mainHeaderRow = $(row);
    });

    if (!mainHeaderRow) return;

    // Data rows are in <tbody> or directly in the table
    const dataRowContainer = tbody.length > 0 ? tbody : $(table);
    const directRows = dataRowContainer.children("tr");

    // Build column map including colspan expansion
    const firstRowHeaders: string[] = [];
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const headerRow = mainHeaderRow as cheerio.Cheerio<import("domhandler").AnyNode>;
    headerRow.children("th").each((_, th) => {
      const text = $(th).text().trim().toLowerCase();
      const colspan = parseInt($(th).attr("colspan") ?? "1", 10);
      firstRowHeaders.push(text);
      for (let i = 1; i < colspan; i++) {
        firstRowHeaders.push(`${text}:${i}`);
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
          subHeaders.push($(th).text().trim().toLowerCase());
        });
        if (subHeaders.length > 0 && subHeaders[0] === "0") {
          hasCantrips = true;
        }
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
    let spellStartIdx = firstRowHeaders.findIndex((h) => h.includes("spells per day") || h.includes("spells") || h === "spellcasting");
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

    let expectedLevel = 1;
    directRows.each((_, row) => {
      const cells: string[] = [];
      $(row).children("td").each((_, cell) => {
        $(cell).find("sup").remove();
        cells.push($(cell).text().trim());
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
            .map((s) => s.trim()
              .replace(/'(\w+)'/g, " $1")
              .replace(/\s+/g, " ").trim())
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
        if (joined.includes("+1 level")) {
          spellsPerDay = joined;
        } else {
          spellsPerDay = spellValues.join(",");
        }
      }

      progression.push({ level, bab, fortSave, refSave, willSave, special, spellsPerDay });
    });

    if (progression.length > 0) return false;
  });

  return { progression, hasCantrips };
}

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
    } else if (depth === 0 && ch === "." && i + 1 < text.length && /\s/.test(text[i + 1]) && /[A-Za-z]/.test(text[i + 2] ?? "")) {
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

// ---------------------------------------------------------------------------
// Class features — driven by the advancement table's Special column
//
// Strategy:
//   1. Collect unique feature names from the Special column (authoritative list)
//   2. Always include "Weapon and Armor Proficiency" and "Spells" (not in Special)
//   3. Collect all text blocks from the Class Features section
//   4. Match each feature name to its description in the text
// ---------------------------------------------------------------------------

type RawFeature = ClassReference["raw"]["classFeatures"][number];

/** Names that always count as features even if not in the Special column.
 *  These are common features described on class pages but not listed in
 *  the progression table's Special column. */
const IMPLICIT_FEATURES = [
  "Weapon and Armor Proficiency",
  "Spells",
  "Spells per Day",
  "Spells per Day/Spells Known",
  "Spells and Caster Level",
  "AC Bonus",
  "Spontaneous Casting",
  "Chaotic, Evil, Good, and Lawful Spells",
  "Spellbooks",
  "Aura",
  "Deity, Domains, and Domain Spells",
  "Fast Movement",
  "Flurry of Blows",
];

function parseClassFeatures(
  $: cheerio.CheerioAPI,
  progression: ClassReference["raw"]["progression"],
): ClassReference["raw"]["classFeatures"] {
  // Step 1: Build the authoritative feature name list from the Special column
  const featureNames = new Set<string>();
  for (const name of IMPLICIT_FEATURES) featureNames.add(normalizeFeatureName(name));

  for (const row of progression) {
    for (const s of row.special) {
      const cleaned = cleanSpecialEntry(s);
      if (cleaned && cleaned.length > 1) featureNames.add(normalizeFeatureName(cleaned));
    }
  }

  // Step 2: Collect all text blocks from the Class Features section
  let cfHeader = findSectionHeader($, /^Class Features$/i);
  if (cfHeader.length === 0) {
    cfHeader = $("h6").filter((_, el) => /^Class Features$/i.test($(el).text().trim())).first();
  }
  if (cfHeader.length === 0) return [];

  // Build a map of feature name → { type, description } from the page content
  // Sources: <h4> headings, <p><strong>Name:</strong> desc, plain "Name:" paragraphs
  const featureHeaderPattern = /^(.+?)\s*(\((Ex|Su|Sp)\))?\s*$/;
  const contentMap = new Map<string, { type?: string; desc: string }>();

  let el = cfHeader.next();
  let currentFeature: string | null = null;

  while (el.length > 0) {
    const tag = el.prop("tagName")?.toLowerCase();
    if (tag === "h2" || tag === "h3") break;

    // h4 heading — potential feature or sub-section header
    if (tag === "h4") {
      const h4Text = el.text().trim();
      const match = h4Text.match(featureHeaderPattern);
      if (match) {
        const name = match[1].trim();
        if (isKnownFeature(name, featureNames)) {
          currentFeature = normalizeFeatureName(name);
          contentMap.set(currentFeature, {
            type: match[3] ? `(${match[3]})` : undefined,
            desc: "",
          });
        } else {
          // Check for "Feature Benefits" / "Feature Options" sub-section header
          // e.g. "Terrain Mastery Benefits" → parse children as "Terrain Mastery: X"
          const subMatch = name.match(/^(.+?)\s+(?:Benefits|Options|Choices|Selections)$/i);
          if (subMatch) {
            const parentName = subMatch[1];
            let next = el.next();
            while (next.length > 0) {
              const nextTag = next.prop("tagName")?.toLowerCase();
              if (nextTag === "h2" || nextTag === "h3" || nextTag === "h4" || nextTag === "table") break;
              if (nextTag === "p") {
                const pText = next.text().trim();
                const subFeatureMatch = pText.match(/^([A-Z][^:]{1,60}?)\s*:\s*([\s\S]*)/);
                if (subFeatureMatch) {
                  // Keep parentheticals that are part of the name like "(Planar)"
                  const subName = `${parentName}: ${subFeatureMatch[1].trim()}`;
                  const subDesc = subFeatureMatch[2].trim();
                  contentMap.set(normalizeFeatureName(subName), { desc: subDesc });
                }
              }
              next = next.next();
            }
          }
          currentFeature = null;
        }
      }
      el = el.next();
      continue;
    }

    // Paragraph — could be inline feature or continuation
    if (tag === "p") {
      let handled = false;

      // Check for <strong>Name:</strong> pattern
      const strong = el.find("strong, b").first();
      if (strong.length > 0) {
        const headerText = strong.text().trim().replace(/:$/, "");
        const match = headerText.match(featureHeaderPattern);
        if (match && match[1].length < 100) {
          const name = match[1].trim();
          if (isKnownFeature(name, featureNames)) {
            currentFeature = findMatchingFeatureKey(name, featureNames) ?? normalizeFeatureName(name);
            const fullText = el.text().trim();
            const desc = fullText.substring(fullText.indexOf(headerText) + headerText.length)
              .replace(/^[:\s]+/, "").trim();
            contentMap.set(currentFeature, {
              type: match[3] ? `(${match[3]})` : undefined,
              desc,
            });
            handled = true;
          } else if (match[3]) {
            // Unknown bold heading WITH type marker (Ex/Su/Sp) — likely a sub-option
            // of the current feature (e.g. "Earthgrip (Sp)" under "Stone Power")
          } else {
            // Unknown bold heading WITHOUT type marker — break continuation chain
            currentFeature = null;
            handled = true;
          }
        }
      }

      // Check for plain text "Name (Ex):" or "Name:" pattern
      if (!handled) {
        const plainText = el.text().trim();
        const plainMatch = plainText.match(/^([A-Z][^:]{2,60}?)\s*(?:\((Ex|Su|Sp)\)\s*)?:\s+([\s\S]*)/);
        if (plainMatch) {
          const name = plainMatch[1].trim();
          if (isKnownFeature(name, featureNames)) {
            currentFeature = normalizeFeatureName(name);
            contentMap.set(currentFeature, {
              type: plainMatch[2] ? `(${plainMatch[2]})` : undefined,
              desc: plainMatch[3].trim(),
            });
            handled = true;
          }
        }
      }

      // Continuation paragraph — append to current feature
      if (!handled && currentFeature && contentMap.has(currentFeature)) {
        const text = el.text().trim();
        if (text) {
          const entry = contentMap.get(currentFeature)!;
          entry.desc = entry.desc ? `${entry.desc} ${text}` : text;
        }
      }
    }

    // Table — check for sub-option tables (e.g. Loremaster Secrets)
    if (tag === "table" && currentFeature) {
      const { nameCol, effectCol } = findSubOptionColumns($, el);
      if (nameCol >= 0) {
        el.find("tr").each((_, row) => {
          const cells = $(row).find("td").toArray().map((td) => $(td).text().trim());
          if (cells.length <= nameCol || !cells[nameCol]) return;
          if ($(row).find("td[colspan]").length > 0) return;
          const subName = cells[nameCol].replace(/\s*\*$/, "");
          const effect = effectCol >= 0 && cells[effectCol] ? cells[effectCol] : "";
          const key = normalizeFeatureName(`${currentFeature}: ${subName}`);
          contentMap.set(key, { desc: effect });
        });
      }
    }

    el = el.next();
  }

  // Scan ALL tables on the page for sub-option tables linked to known features
  // (some tables like Loremaster Secrets appear outside the Class Features section)
  $("table").each((_, table) => {
    const { nameCol, effectCol } = findSubOptionColumns($, $(table));
    if (nameCol < 0) return;

    // Find the parent feature from the table title (first th in first row, often spanning)
    const titleRow = $(table).find("tr").first();
    const titleTh = titleRow.find("th[colspan], th").first();
    const titleText = titleTh.text().trim().toLowerCase();

    // Match title to a known feature (e.g. "Loremaster Secrets" → "secret")
    let parentKey: string | null = null;
    for (const [key] of contentMap) {
      if (titleText.includes(key) || key.includes(titleText.replace(/s$/, ""))) {
        parentKey = key;
        break;
      }
    }
    if (!parentKey) return;

    $(table).find("tr").each((_, row) => {
      const cells = $(row).find("td").toArray().map((td) => $(td).text().trim());
      if (cells.length <= nameCol || !cells[nameCol]) return;
      if ($(row).find("td[colspan]").length > 0) return;
      const subName = cells[nameCol].replace(/\s*\*$/, "");
      const effect = effectCol >= 0 && cells[effectCol] ? cells[effectCol] : "";
      const key = normalizeFeatureName(`${parentKey}: ${subName}`);
      if (!contentMap.has(key)) {
        contentMap.set(key, { desc: effect });
      }
    });
  });

  // Step 3: Build the features array in progression order
  const features: RawFeature[] = [];
  const seen = new Set<string>();

  // Add implicit features first (WAP, Spells)
  for (const name of IMPLICIT_FEATURES) {
    const key = normalizeFeatureName(name);
    if (contentMap.has(key) && !seen.has(key)) {
      seen.add(key);
      const entry = contentMap.get(key)!;
      features.push({ name, type: entry.type, description: entry.desc });
    }
  }

  // Add features in progression order (deduplicated by normalized name)
  for (const row of progression) {
    for (const s of row.special) {
      const cleaned = cleanSpecialEntry(s);
      const key = normalizeFeatureName(cleaned);
      if (seen.has(key) || !key) continue;
      seen.add(key);

      // Look up description from contentMap (try normalized, then plural variants)
      let entry = contentMap.get(key);
      if (!entry) entry = contentMap.get(key + "s");
      if (!entry) entry = contentMap.get(key.replace(/y$/, "ies"));

      if (entry) {
        features.push({ name: titleCase(cleaned), type: entry.type, description: entry.desc });
      } else {
        features.push({ name: titleCase(cleaned), description: "" });
      }
    }
  }

  // Add sub-features from tables and sub-section headings (e.g. "Secret: Instant Mastery")
  for (const [key, entry] of contentMap) {
    if (seen.has(key)) continue;
    if (key.includes(":")) {
      seen.add(key);
      features.push({ name: titleCase(key), type: entry.type, description: entry.desc });
    }
  }

  return features;
}

/**
 * Clean a Special column entry to its base feature name.
 * "Sneak Attack +1d6" → "Sneak Attack"
 * "hexblade's curse 2/day" → "hexblade's curse"
 * "Ignore spell failure 10%" → "Ignore spell failure"
 * "Slow Fall 20 ft." → "Slow Fall"
 * "Damage Reduction 3/-" → "Damage Reduction"
 */
function cleanSpecialEntry(s: string): string {
  return s
    .replace(/\s*\+\d+(?:d\d+)?(?:\/\+\d+(?:d\d+)?)*$/, "") // +1, +1d6, +1/+1d6
    .replace(/\s*\+?\d+\/day$/i, "")    // 2/day, +1/day
    .replace(/\s*\d+%$/, "")           // 10%
    .replace(/\s*\d+\s*(?:ft\.?|feet)$/i, "")  // 20 ft.
    .replace(/\s*\d+\/[-–]$/, "")      // 3/-
    .replace(/\s*\d+\/(?:week|round)$/i, "") // 1/week
    .replace(/\s*\(\d+(?:st|nd|rd|th)\)$/, "") // (1st)
    .replace(/\s*\(\d+(?:st|nd|rd|th) type\)$/i, "") // (1st type)
    .replace(/\s*\([^)]*\d+\/day[^)]*\)$/i, "") // (elemental 1/day)
    .replace(/\s*\((?:black|brown|dire|large|small|tiny|huge|plant|elemental|magic|lawful|adamantine|move action|free action|two|four|radius)[^)]*\)$/i, "") // (black), (magic), (huge elemental), etc.
    .replace(/\s*(?:any distance)$/i, "") // any distance
    .replace(/^(?:1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+/i, "") // "1st Favored Enemy" → "Favored Enemy"
    .replace(/\s*\+\d+\s+(?:level of existing .*spellcasting class)$/i, "") // "+1 level of existing..."
    .replace(/^[^A-Za-z]*/, "") // strip leading non-alpha chars (broken parens, etc.)
    .replace(/\s*\([^)]*\d[^)]*\)?\s*$/, "") // strip trailing parenthetical containing numbers: (+1), (2d8), (1/day)
    .replace(/\s*\([^)]*$/, "") // strip any unclosed paren at end
    .replace(/^([^(]*)\)$/, "$1") // strip orphaned trailing ) only when no opening (
    .replace(/\d+\/day$/, "") // leftover "2/day" after paren strip
    .trim()
    .replace(/^(?:huge |large |small )?elemental$/i, ""); // orphaned fragments from broken wild shape cells
}

/** Find name and effect column indices from a sub-option table */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSubOptionColumns($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): { nameCol: number; effectCol: number } {
  // Find the header row with the most <th> cells (skip title rows with 1 spanning th, and footnote rows)
  const headerRows = table.find("tr").filter((_, row) => $(row).children("th").length > 1);
  if (headerRows.length === 0) return { nameCol: -1, effectCol: -1 };

  // Use the row with the most th cells
  let bestRow = headerRows.first();
  let bestCount = bestRow.children("th").length;
  headerRows.each((_, row) => {
    const count = $(row).children("th").length;
    if (count > bestCount) { bestRow = $(row); bestCount = count; }
  });

  const headers = bestRow.children("th").toArray().map((th) => $(th).text().trim().toLowerCase());
  const nameCol = headers.findIndex((h) => /^(secret|name|ability|trick|mastery|option|maneuver)$/i.test(h));
  const effectCol = headers.findIndex((h) => /^(effect|benefit|description)$/i.test(h));
  return { nameCol, effectCol };
}

/** Find the exact key in the known features set that matches this name */
function findMatchingFeatureKey(name: string, knownFeatures: Set<string>): string | undefined {
  const norm = normalizeFeatureName(name);
  if (knownFeatures.has(norm)) return norm;
  const lower = name.toLowerCase();
  if (knownFeatures.has(lower)) return lower;
  if (knownFeatures.has(lower + "s")) return lower + "s";
  if (knownFeatures.has(lower.replace(/s$/, ""))) return lower.replace(/s$/, "");
  if (knownFeatures.has(norm + "s")) return norm + "s";
  if (knownFeatures.has(norm.replace(/s$/, ""))) return norm.replace(/s$/, "");
  for (const known of knownFeatures) {
    if (known.startsWith(norm + " ") || known.startsWith(lower + " ")) return known;
  }
  for (const known of knownFeatures) {
    if (norm.startsWith(known) && norm.length > known.length) {
      const suffix = norm.substring(known.length);
      if (/^[^a-z\s]/.test(suffix.trim())) return known;
    }
  }
  return undefined;
}

/** Normalize a feature name for matching — strips plurals, collapses whitespace */
function normalizeFeatureName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/\s+/g, " "); // collapse double spaces
  // "Special Abilities" → "special ability"
  n = n.replace(/ies$/, "y");
  return n;
}

/** Check if a feature name matches any known feature (case-insensitive, with plural matching) */
function isKnownFeature(name: string, knownFeatures: Set<string>): boolean {
  const norm = normalizeFeatureName(name);
  if (knownFeatures.has(norm)) return true;
  const lower = name.toLowerCase();
  if (knownFeatures.has(lower)) return true;
  // Plural variants
  if (knownFeatures.has(lower + "s") || knownFeatures.has(lower.replace(/s$/, ""))) return true;
  if (knownFeatures.has(norm + "s") || knownFeatures.has(norm.replace(/s$/, ""))) return true;
  // Check if any known feature starts with this name
  // e.g. "Mounted Weapon Bonus" matches "Mounted Weapon Bonus (Lance)"
  for (const known of knownFeatures) {
    if (known.startsWith(norm + " ") || known.startsWith(lower + " ")) return true;
  }
  // Check if this name starts with a known feature + non-alpha suffix
  // e.g. "Rage +1/Day" matches "Rage" (suffix starts with +)
  // But NOT "Terrain Mastery Benefits" matching "Terrain Mastery" (suffix is a word)
  for (const known of knownFeatures) {
    if (norm.startsWith(known) && norm.length > known.length) {
      const suffix = norm.substring(known.length);
      if (/^[^a-z\s]/.test(suffix.trim())) return true; // +1/day, (lance), etc. — but not "Benefits"
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Spells Known table
// ---------------------------------------------------------------------------

function parseSpellsKnownTable($: cheerio.CheerioAPI): string[] {
  const results: string[] = [];

  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("th").each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    const headerText = headers.join(" ");
    // Skip progression tables (have BAB/attack columns)
    if (headerText.includes("base") || headerText.includes("attack") || headerText.includes("bab")) return;
    // Skip skill tables
    if (headerText.includes("skill")) return;
    // Match: explicit "known" label OR a Level + ordinal-only table (no BAB/Fort/etc.)
    const hasLevel = headers.some((h) => h.includes("level"));
    const hasOrdinals = headers.some((h) => /^\d+(?:st|nd|rd|th)$/.test(h));
    const isKnownTable = headerText.includes("known") || (hasLevel && hasOrdinals && !headerText.includes("fort") && !headerText.includes("special"));
    if (!isKnownTable) return;

    $(table).find("tr").each((_, row) => {
      const cells: string[] = [];
      $(row).find("td").each((_, td) => {
        $(td).find("sup").remove();
        cells.push($(td).text().trim());
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

// ---------------------------------------------------------------------------
// Bonus spell ability detection
// ---------------------------------------------------------------------------

function detectBonusSpellAbility($: cheerio.CheerioAPI): string | undefined {
  const bodyText = $("body").text();
  const match = bodyText.match(/bonus spells are based on (Intelligence|Wisdom|Charisma)/i);
  if (match) return match[1];

  // "receives bonus spells for a high Charisma score" (Warmage, Wu Jen, etc.)
  const bonusForMatch = bodyText.match(/bonus spells for a high (Intelligence|Wisdom|Charisma)/i);
  if (bonusForMatch) return bonusForMatch[1];

  const dcMatch = bodyText.match(/saves? (?:for these spells )?(?:have |has )?a DC of 10 \+ .*?\+ .*?(Intelligence|Wisdom|Charisma)/i);
  if (dcMatch) return dcMatch[1];

  const abilityMatch = bodyText.match(/must have (?:a |an )?(Intelligence|Wisdom|Charisma) score (?:equal to )?(?:at )?least 10/i);
  if (abilityMatch) return abilityMatch[1];

  return undefined;
}

// ---------------------------------------------------------------------------
// Shared utilities for dndtools.net HTML structure
// ---------------------------------------------------------------------------

/** Find the class name h2 — skip site tagline */
function findClassNameH2($: cheerio.CheerioAPI) {
  const h2s = $("h2").toArray();
  for (const el of h2s) {
    const text = $(el).text().trim();
    if (text.match(/^(Feats|D&D|Welcome|Home|About|Search|Login)/i)) continue;
    if (text.length > 60) continue;
    if (text) return $(el);
  }
  return h2s.length > 1 ? $(h2s[1]) : $(h2s[0] ?? []);
}

/** Find a section header (h3 or h4) whose text matches a pattern */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSectionHeader($: cheerio.CheerioAPI, pattern: RegExp): cheerio.Cheerio<any> {
  // Try h3 first, then h4
  const h3 = $("h3").filter((_, el) => pattern.test($(el).text().trim())).first();
  if (h3.length > 0) return h3;
  return $("h4").filter((_, el) => pattern.test($(el).text().trim())).first();
}

/** Get the text content after a header, from the next sibling(s) until the next header */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTextAfterHeader(header: cheerio.Cheerio<any>): string {
  const parts: string[] = [];
  let el = header.next();
  while (el.length > 0) {
    const tag = el.prop("tagName")?.toLowerCase();
    if (tag === "h3" || tag === "h4" || tag === "h2") break;
    const text = el.text().trim();
    if (text) parts.push(text);
    if (tag === "p" || tag === "div") break;
    el = el.next();
  }
  // If no sibling had content, try parent's text after the header
  if (parts.length === 0) {
    const parent = header.parent();
    if (parent.length > 0) {
      const fullText = parent.text();
      const headerText = header.text().trim();
      const idx = fullText.indexOf(headerText);
      if (idx >= 0) {
        const after = fullText.substring(idx + headerText.length).trim();
        const firstLine = after.split("\n")[0].trim();
        if (firstLine) return firstLine;
      }
    }
  }
  return parts.join(" ");
}
