import { RACE_NAME_PATH, RACE_SPELLINGS } from "@/codegen/dnd3.5/tools/terms/races.ts";
import { toSkillSlug } from "@/codegen/dnd3.5/tools/terms/skills.ts";
import { BOOK_ABBREV_PATTERN } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import { eq, eqStr, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { domainFeat } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";

import { RequirementReading } from "./RequirementReading.ts";

/**
 * A class's feat prerequisites as the scraper split them, mended: a list split inside its parentheses ("Weapon Focus
 * (longbow", "shortbow", "or composite version of either)") is one prerequisite again, and the languages read into
 * the list ("Spell Focus (conjuration) Languages: Celestial", "Infernal") are dropped.
 */
function featPrerequisites(scraped: string[]): string[] {
  const feats: string[] = [];
  for (const entry of scraped) {
    const open = feats.at(-1);
    if (open && open.split("(").length > open.split(")").length) feats[feats.length - 1] = `${open}, ${entry}`;
    else feats.push(entry);
  }
  const languages = feats.findIndex((f) => /\bLanguages?:/.test(f));
  if (languages < 0) return feats;
  return [...feats.slice(0, languages), feats[languages].replace(/\s*\bLanguages?:.*$/, "")];
}

/** Distinguish mechanical special prerequisites (sneak attack, rage, spellcasting, etc.)
 *  from narrative/RP-only ones (deity worship, organization membership, rituals).
 *  Mechanical ones are tracked as unresolved so they show up as TODOs. */
function isMechanicalPrereq(text: string): boolean {
  return /animal companion|spell-like|psionic/i.test(text);
}

/**
 * Whether a special prerequisite is a class feature's name, a few words: "Evasion class feature", "Bardic knowledge and
 * evasion abilities"; not a sentence ending on one ("…before she can gain the class abilities").
 */
function namesClassFeature(text: string): boolean {
  return /^[A-Z][\w'-]*(?: [\w'-]+){0,4} (?:class feature|abilit(?:y|ies))$/.test(text);
}

/** A race requirement: "Race: Elf or half-elf", "Race: Dwarf". */
function raceRequirement(text: string): RequirementEntry | undefined {
  const match = text.match(/^Race:\s*(.+)$/i);
  if (!match) return undefined;

  const raceText = match[1].trim().replace(/\.$/, "");

  // "Any nondragon" type entries — can't express as a concrete requirement
  if (raceText.toLowerCase().startsWith("any")) return undefined;

  const races = raceText.split(/\s+or\s+/i).map((r) => r.trim().toLowerCase());
  const resolved = races.map((r) => RACE_SPELLINGS[r]).filter(Boolean);
  if (resolved.length === 0) return undefined;

  if (resolved.length === 1) return eqStr(RACE_NAME_PATH, resolved[0]);

  return or(...resolved.map((r) => eqStr(RACE_NAME_PATH, r)));
}

/**
 * The prerequisites a special entry lists, each on its own: "Flurry of blows ability; evasion ability; must be
 * chosen…", "Evasion class feature.Special: The character must…" (the scraper joins a Special line to the line before).
 */
function specialParts(entry: string): string[] {
  return entry
    .split(/[;.]\s*|,\s+/)
    .map((part) => part.trim().replace(/^Special:\s*/i, ""))
    .filter(Boolean);
}

/**
 * A class's prerequisites, as the scraper split them: the requirements they give, its BAB, skills, feats, spellcasting,
 * alignment, saves, class levels and special prerequisites in turn.
 */
export class ClassPrerequisites extends RequirementReading {
  constructor(parsed: ClassReference["raw"]["prerequisites"]["parsed"]) {
    super();
    const reqs = this.requirements;
    if (parsed.bab) reqs.push(gte("combat.bab", parsed.bab));

    if (parsed.skills) reqs.push(...this.skillRequirements(parsed.skills));

    if (parsed.feats) reqs.push(...this.featRequirements(parsed.feats));

    if (parsed.casterLevel) {
      for (const cl of parsed.casterLevel) {
        if (cl.type === "any")
          reqs.push(or(gte("spellcasting.arcane", cl.level), gte("spellcasting.divine", cl.level)));
        else reqs.push(gte(`spellcasting.${cl.type}`, cl.level));
      }
    }

    if (parsed.alignment) {
      const alignReqs = this.alignmentRequirement(parsed.alignment);
      if (alignReqs) reqs.push(alignReqs);
    }

    if (parsed.saves) {
      for (const s of parsed.saves) {
        const saveKey = s.name.toLowerCase();
        reqs.push(gte(`saves.${saveKey}.base`, s.base));
      }
    }

    // Class level requirements: "fighter level 4th", "5 levels of cleric"
    if (parsed.classLevels) {
      for (const cl of parsed.classLevels) {
        const slug = stripSeparators(cl.className);
        reqs.push(gte(`classes.${slug}.level`, cl.level));
      }
    }

    // Parse race, proficiency, and special ability requirements from special entries
    if (parsed.special) reqs.push(...this.specialRequirements(parsed.special));

    this.keepValidRequirements();
  }

  /** A compound feat requirement: "Weapon Focus (longbow or shortbow)". */
  private compoundFeatRequirement(text: string): RequirementEntry | undefined {
    // Pattern: "FeatName (optionA or optionB)", "FeatName (optionA, optionB, or optionC)"
    const match = text.match(/^(.+?)\s*\(([^)]+\s+or\s+[^)]+)\)$/i);
    if (!match) return undefined;

    const baseFeat = match[1].trim();
    const options = this.familyOptions(baseFeat, match[2]);

    if (options.length < 2) return undefined;

    return or(...options.map((opt) => eq(feat(`${baseFeat}: ${capitalize(opt)}`))));
  }

  /** The feats a class's prerequisites list, as requirements: one it can't read is unresolved. */
  private featRequirements(scraped: string[]): RequirementEntry[] {
    const reqs: RequirementEntry[] = [];
    const feats = featPrerequisites(scraped);
    for (let i = 0; i < feats.length; i++) {
      let f = feats[i];
      // Skip scraping artifacts (page references, HTML fragments, etc.)
      if (/\bpage \d+\b|^[^a-zA-Z]*$/i.test(f)) continue;

      // "Negotiator (or), Persuasive": either one
      if (/\s*\(or\)$/i.test(f) && i + 1 < feats.length) {
        reqs.push(or(eq(feat(f.replace(/\s*\(or\)$/i, ""))), eq(feat(feats[++i]))));
        continue;
      }
      // "Improved Unarmed Strike (or monk's unarmed strike ability)": the feat, which the alternative grants
      f = f.replace(/\s*\(or\b[^)]*\)$/i, "");
      // "Exotic Weapon Proficiency (kukri)": proficiency with the weapon, which may be martial
      const proficiency = this.exoticProficiencyRequirements(f);
      if (proficiency.length > 0) {
        reqs.push(...proficiency);
        continue;
      }
      const withoutChoice = this.featWithoutChoice(f);
      if (withoutChoice) {
        reqs.push(eq(feat(withoutChoice)));
        continue;
      }

      const familyReqs = this.familyFeatRequirements(f);
      if (familyReqs.length > 0) {
        reqs.push(...familyReqs);
        continue;
      }
      // "any" feats (e.g. "Weapon Focus (any thrown weapon)", "Spell Focus in two schools of magic",
      //   "Weapon Focus (with deity's favored weapon)")
      // → prefix wildcard on the feat family slug
      if (this.asksAnyOption(f)) {
        const anyReq = this.anyFeatRequirement(f);
        if (anyReq) reqs.push(anyReq);
        else this.unresolved.push(f);

        continue;
      }
      const compoundReq = this.compoundFeatRequirement(f);
      if (compoundReq) {
        reqs.push(compoundReq);
      } else {
        // Strip numeric/dice suffixes (e.g. "Sudden Strike +8d6" → "Sudden Strike")
        // and book abbreviation suffixes (e.g. "Brutal Throw (CAd)" → "Brutal Throw")
        reqs.push(eq(feat(f.replace(/\s*\+\d+(?:d\d+)?$/, "").replace(BOOK_ABBREV_PATTERN, ""))));
      }
    }
    return reqs;
  }

  /**
   * A special prerequisite's requirements: a race, a proficiency, the class features it names, which any class's of
   * their family meets ("Turn undead class feature", "Either sneak attack +1d6 or skirmish +1d6"), or another special
   * ability (`specialAbilityRequirement`).
   */
  private partRequirements(text: string): RequirementEntry[] {
    const race = raceRequirement(text);
    if (race) return [race];
    const proficiency = this.weaponProficiencyRequirements(text);
    if (proficiency.length > 0) return proficiency;
    const classFeatures = this.classFeatureRequirements(text);
    if (classFeatures.length > 0) return classFeatures;
    return this.specialAbilityRequirements(text);
  }

  /**
   * The skills a class's prerequisites list, as requirements (`skillRankRequirement`): an "or Y" entry folded into the
   * skill before it. A skill no check is made with is left out.
   */
  private skillRequirements(skills: { name: string; ranks: number }[]): RequirementEntry[] {
    const reqs: RequirementEntry[] = [];
    let lastSkillReqIdx = -1;
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];

      // "or Intimidate" as a separate entry → merge with previous skill req as OR
      if (/^or\s+/i.test(s.name)) {
        const name = s.name.replace(/^or\s+/i, "");
        const newTarget = `skills.${toSkillSlug(name)}.rank`;
        if (lastSkillReqIdx >= 0) {
          const prev = reqs[lastSkillReqIdx];
          // Skip if it resolves to the same path (e.g. Perform subtypes)
          if (!("chainingOperator" in prev) && prev.target === newTarget) continue;
          reqs[lastSkillReqIdx] = or(prev, gte(newTarget, s.ranks));
        } else {
          reqs.push(gte(newTarget, s.ranks));
          lastSkillReqIdx = reqs.length - 1;
        }
        continue;
      }
      // "Knowledge (any)", "Knowledge (arcana, local or psionics)", "Diplomacy or Intimidate", or the skill; none for
      // a skill no check is made with ("Speak Language (Terran)")
      const requirement = this.skillRankRequirement(s.name, s.ranks);
      if (!requirement) continue;
      reqs.push(requirement);
      lastSkillReqIdx = reqs.length - 1;
    }
    return reqs;
  }

  /**
   * A special ability's requirements: a domain's access, else a size (`sizeRequirements`), spellcasting
   * (`castingRequirements`) or any feat of a family (`familyFeatRequirements`), as a feat's prerequisite reads them.
   */
  private specialAbilityRequirements(text: string): RequirementEntry[] {
    // "access to the X domain"
    const domainMatch = text.match(/access to the (\w+) domain/i);
    if (domainMatch) {
      const domainName = domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1).toLowerCase();
      return [eq(feat(domainFeat(domainName)))];
    }
    for (const read of [this.sizeRequirements(text), this.castingRequirements(text), this.familyFeatRequirements(text)])
      if (read.length > 0) return read;
    return [];
  }

  /**
   * The requirements of a class's special prerequisites: a race read on its whole entry, else each prerequisite its
   * entry lists (`specialParts`, "Flurry of blows ability; evasion ability"), but those the class requires otherwise.
   * An entry none of whose prerequisites reads is unresolved when it's mechanical (an animal companion, a spell-like
   * ability); else a prerequisite naming a class feature nothing reads is ("Spell secret class ability"), and the
   * narrative ones (a deity, an organization) are dropped.
   */
  private specialRequirements(special: string[]): RequirementEntry[] {
    const reqs: RequirementEntry[] = [];
    const read = new Set(this.requirements.map((requirement) => JSON.stringify(requirement)));
    for (const entry of special) {
      const race = raceRequirement(entry);
      const parts = race ? [] : specialParts(entry);
      const partReqs = parts.map((part) => this.partRequirements(part));
      for (const requirement of race ? [race] : partReqs.flat()) {
        const key = JSON.stringify(requirement);
        if (read.has(key)) continue;
        read.add(key);
        reqs.push(requirement);
      }
      if (race) continue;
      if (partReqs.every((requirements) => requirements.length === 0) && isMechanicalPrereq(entry))
        this.unresolved.push(entry);
      else this.unresolved.push(...parts.filter((part, i) => partReqs[i].length === 0 && namesClassFeature(part)));
    }
    return reqs;
  }
}
