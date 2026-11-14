/**
 * The languages' rules' words: the ability whose modifier gives a character its language picks, the skill whose ranks
 * add picks (Linguistics: a language a rank), and the type that keeps a language secret.
 */

import type { SkillName } from "./skills.ts";

/** The ability whose permanent modifier gives a character a language pick a point. */
export const LANGUAGE_PICK_ABILITY = "Intelligence";
/** The skill whose ranks each give a character a language pick: Linguistics. */
export const LANGUAGE_SKILL: SkillName = "Linguistics";
/**
 * The types a language is of, one of them secret (`SECRET_LANGUAGE_TYPE`): a closed list, so the rules read a secret
 * language whatever a ruleset calls its languages.
 */
export const LANGUAGE_TYPES = ["Secret", "Sign", "Spoken", "Written"] as const;
/**
 * The type of a secret language, which a character speaks only when a modifier grants it (the druid's Druidic): no
 * pick takes one.
 */
export const SECRET_LANGUAGE_TYPE = "Secret";
