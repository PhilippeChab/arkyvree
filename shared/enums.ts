/**
 * The database's enums, and the registered modules' base rules. Their values are written out rather than read from the
 * schema, which the client would then load whole; tests/shared/enums.test.ts checks the base rules against the migrated
 * database.
 */

import type { contributorRole, role, rulesetKind } from "@/drizzle/schema.ts";

/** A registered module's base rules: `rules.modules` holds them, and `rulesets.base_rules` names one. */
export type BaseRules = (typeof BASE_RULES_OPTIONS)[number];
/** A campaign player's role. */
export type CampaignRole = (typeof role.enumValues)[number];
export type ContributorRole = (typeof contributorRole.enumValues)[number];
export type RulesetKind = (typeof rulesetKind.enumValues)[number];

export const BASE_RULES_OPTIONS = ["Dungeons & Dragons: 3.5"] as const;
