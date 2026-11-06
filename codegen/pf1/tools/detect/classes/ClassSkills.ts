import { SKILL_ALIASES } from "@/codegen/pf1/tools/terms/classes.ts";
import { KNOWLEDGE_SKILLS, SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

import { splitList } from "./lists.ts";

/** A skill's key ability, after its name in a class skills' sentence: "Climb (Str)". */
const KEY_ABILITY = /\s*\((?:Str|Dex|Con|Int|Wis|Cha)\)$/;

/** The skills by their name, lowercased. */
const SKILLS_BY_NAME = new Map<string, string>(SKILL_NAMES.map((name) => [name.toLowerCase(), name]));

/**
 * A class's class skills, its sentence read ("The Fighter's class skills are Climb (Str), Craft (Int), Knowledge
 * (dungeoneering) (Int)…"): each skill by the skill list's name, every Knowledge skill for "Knowledge (all)" (or "all
 * skills taken individually"), a skill of subtypes by its own ("Craft (Int)": Craft). What names no skill is unread:
 * an expert's "any 10 skills".
 */
export class ClassSkills {
  constructor(sentence: string) {
    const list = /class skills are (.+?)\.?$/.exec(sentence.trim())?.[1];
    if (!list) {
      this.unplaced.push(sentence);
      return;
    }
    for (const item of splitList(list)) {
      const name = item.replace(KEY_ABILITY, "").toLowerCase();
      if (/^knowledge \(all\b/.test(name)) {
        this.skills.push(...KNOWLEDGE_SKILLS);
      } else {
        const skill = SKILL_ALIASES[name] ?? SKILLS_BY_NAME.get(name);
        if (skill) this.skills.push(skill);
        else this.unplaced.push(item);
      }
    }
  }

  /** Its skills, as the skill list names them. */
  private readonly skills: string[] = [];
  /** What its sentence names that's no skill. */
  private readonly unplaced: string[] = [];

  /** Its class skills, each once, by name. */
  names(): string[] {
    return [...new Set(this.skills)].toSorted();
  }

  /** What its sentence names that's no skill: "any 10 skills". */
  unread(): string[] {
    return this.unplaced;
  }
}
