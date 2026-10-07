/** A prestige class's prerequisites, as its page's Requirements section writes them, read for what they ask. */

import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";

/** What a class's prerequisites ask for, read from their text. */
type Parsed = ClassReference["raw"]["prerequisites"]["parsed"];

/** A prestige class's prerequisites' text, read for what they ask: each kind of requirement its own reading. */
export class PrerequisiteText {
  constructor(readonly text: string) {}

  /** The spellcasting the prerequisites require: a spell level of a kind (arcane, divine, any), or a kind from 1st. */
  private requiredCasterLevels(): NonNullable<Parsed["casterLevel"]> {
    const casterLevels: { level: number; type: "divine" | "arcane" | "any" }[] = [];

    const spellLevelRegex = /(\d+)(?:st|nd|rd|th)[- ]level\s+(divine|arcane)\s*spells?/gi;
    let slMatch;
    while ((slMatch = spellLevelRegex.exec(this.text)) !== null)
      casterLevels.push({ type: slMatch[2].toLowerCase() as "divine" | "arcane", level: parseInt(slMatch[1], 10) });

    if (casterLevels.length === 0) {
      const genericMatch = this.text.match(/(?:Able to|ability to) cast (\d+)(?:st|nd|rd|th)[- ]level\s*spells?/i);
      if (genericMatch) casterLevels.push({ type: "any", level: parseInt(genericMatch[1], 10) });
    }

    const spellOfMatch = this.text.match(/(arcane|divine)\s+spells?\s+of\s+(\d+)(?:st|nd|rd|th)\s+level/i);
    if (spellOfMatch) {
      casterLevels.push({
        type: spellOfMatch[1].toLowerCase() as "divine" | "arcane",
        level: parseInt(spellOfMatch[2], 10),
      });
    }

    const castTypeMatch = this.text.match(/(?:Able to|ability to) cast (arcane|divine) spells/i);
    if (castTypeMatch && casterLevels.every((c) => c.type !== castTypeMatch[1].toLowerCase()))
      casterLevels.push({ type: castTypeMatch[1].toLowerCase() as "divine" | "arcane", level: 1 });

    return casterLevels;
  }

  /** The levels of classes the prerequisites require ("Rogue level 5th", "3 levels of fighter"). */
  private requiredClassLevels(): { className: string; level: number }[] {
    const classLevels: { className: string; level: number }[] = [];
    const classLevelRegex1 = /(\w+)\s+level\s+(\d+)(?:st|nd|rd|th)/gi;
    let classLevelMatch: RegExpExecArray | null;
    while ((classLevelMatch = classLevelRegex1.exec(this.text)) !== null) {
      const className = classLevelMatch[1].trim();
      const level = parseInt(classLevelMatch[2], 10);
      if (className.toLowerCase() === "caster" || className.toLowerCase() === "character") continue;
      classLevels.push({ className, level });
    }
    const classLevelRegex2 = /(\d+)\s+levels?\s+(?:of\s+)?(\w+)/gi;
    while ((classLevelMatch = classLevelRegex2.exec(this.text)) !== null) {
      const level = parseInt(classLevelMatch[1], 10);
      const className = classLevelMatch[2].trim();
      if (className.toLowerCase() === "existing" || className.toLowerCase() === "spellcasting") continue;
      classLevels.push({ className, level });
    }
    return classLevels;
  }

  /** The feats the prerequisites' Feats line lists, "Spell Focus (or any other metamagic feat)" as "any metamagic feat". */
  private requiredFeats(): string[] {
    const feats: string[] = [];
    const featSection = this.text.match(
      /Feats?[:\s]+([\s\S]*?)(?=[\s.]+(?:Skills?|Spells?|Special|Alignment|Race|Base (?:Save Bonus|Attack Bonus)|Class|Speak Language|Patron|Domain)\s*:|\n\n|$)/i,
    );
    if (featSection) {
      const featText = featSection[1].replace(/\n/g, " ").trim();
      const parts = featText.split(/,\s*(?:and\s+)?|\s+and\s+/);
      for (const part of parts) {
        let trimmed = part.trim().replace(/\.$/, "");
        // "Spell Focus (or any other metamagic feat)" → "any metamagic feat"
        trimmed = trimmed.replace(/^.+?\(or any (?:other )?(.+? feat)\)$/i, "any $1");
        if (trimmed && !trimmed.match(/^(or|any|must|have|the)$/i) && trimmed.length > 2 && trimmed.length < 60)
          feats.push(trimmed);
      }
    }
    return feats;
  }

  /** The base saves the prerequisites require ("Fort save +4"), each by its full name; none when they name none. */
  private requiredSaves(): { base: number; name: string }[] | undefined {
    const saveRegex = /(?:Fort(?:itude)?|Ref(?:lex)?|Will)\s+(?:save\s+)?(?:bonus\s*)?\+(\d+)/gi;
    const saveMatches = [...this.text.matchAll(saveRegex)];
    if (saveMatches.length === 0) return undefined;
    const saves: { base: number; name: string }[] = [];
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
  private requiredSkills(): { name: string; ranks: number }[] {
    const skills: { name: string; ranks: number }[] = [];
    const skillRegex = /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?)\s*:?\s*(\d+)\s+ranks?/gi;
    let skillMatch: RegExpExecArray | null;
    while ((skillMatch = skillRegex.exec(this.text)) !== null) {
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
  private requiredSpecials(): string[] {
    const specials: string[] = [];
    const raceMatch = this.text.match(/Race[:\s]+(.+?)(?:\.|,|\n|$)/i);
    if (raceMatch) specials.push(`Race: ${raceMatch[1].trim()}`);

    const specialMatch = this.text.match(/Special[:\s]+(.+?)(?:\n|$)/i);
    if (specialMatch) specials.push(specialMatch[1].trim());

    const mustRegex = /Must (?:have |be )(.+?)(?:\.|$)/gi;
    let mustMatch: RegExpExecArray | null;
    while ((mustMatch = mustRegex.exec(this.text)) !== null) specials.push(mustMatch[1].trim());

    return specials;
  }

  /** What the prerequisites ask for: a base attack bonus, skills, feats, spellcasting, an alignment and the rest. */
  parsed(): Parsed {
    const parsed: Parsed = {};

    // BAB
    const babMatch = this.text.match(/Base Attack Bonus[:\s]*\+(\d+)/i);
    if (babMatch) parsed.bab = parseInt(babMatch[1], 10);

    const skills = this.requiredSkills();
    if (skills.length > 0) parsed.skills = skills;

    const feats = this.requiredFeats();
    if (feats.length > 0) parsed.feats = feats;

    const casterLevels = this.requiredCasterLevels();
    if (casterLevels.length > 0) parsed.casterLevel = casterLevels;

    // Alignment — stop at next labeled section (Skills:, Special:, Feats:, etc.) or end of line
    const alignMatch = this.text.match(
      /Alignment:\s*([\w\s,-]+?)(?=\s+(?:Skills?|Special|Feats?|Base Attack|Race|Spells?|Class):|[.\n]|$)/im,
    );
    if (alignMatch) parsed.alignment = alignMatch[1].trim();

    const specials = this.requiredSpecials();
    if (specials.length > 0) parsed.special = specials;

    const classLevels = this.requiredClassLevels();
    if (classLevels.length > 0) parsed.classLevels = classLevels;

    const saves = this.requiredSaves();
    if (saves && saves.length > 0) parsed.saves = saves;

    return parsed;
  }
}
