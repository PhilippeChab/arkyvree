import { featsInRules, powersInRules } from "@/drizzle/schema.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  Items,
  Klasses,
  Languages,
  Mechanics,
  Powers,
  Races,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

export interface EntityWithId {
  id: string;
  [key: string]: unknown;
}

// Customization source type mapping — entity types that have modifiers use a different sourceType
export const ENTITY_TYPE_TO_SOURCE_TYPE: Record<string, string> = {
  feats: "feats",
  powers: "powers",
  items: "items",
  races: "races",
  klass_levels: "klass_levels",
};

// Tables that participate in the name-based sibling fallback. Limited to
// feats and powers because those are the entity types D&D sourcebooks
// commonly reprint (e.g. a spell appearing in CA + CD). For other entity
// types (races, classes, abilities, saves, skills, items, languages,
// mechanics) a same-name match across extensions is more likely a genuine
// collision than a reprint — auto-merging "Human" or "Fighter" between two
// homebrew packages would silently corrupt content. Aptitudes are also
// excluded; they have their own name-grouping pass since name = identity
// universally for them.
//
// `NAME_FALLBACK_ENTITY_TYPES` is the canonical list — re-export it from
// here and consume it in `RulesetsService.assertExtensionsNameCompatible`
// so the runtime pairing and the subscribe-time block agree on which
// types pair.
export const NAME_FALLBACK_ENTITY_TYPES = ["feats", "powers"] as const;
export const NAME_FALLBACK_TABLES = [
  { entityType: "feats", table: featsInRules },
  { entityType: "powers", table: powersInRules },
] as const;

export const ENTITY_REPOS = {
  abilities: Abilities,
  saves: Saves,
  skills: Skills,
  feats: Feats,
  powers: Powers,
  items: Items,
  races: Races,
  languages: Languages,
  klasses: Klasses,
  aptitudes: Aptitudes,
  mechanics: Mechanics,
} as const;
