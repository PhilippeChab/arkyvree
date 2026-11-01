/**
 * The database's enums, the values its CHECK constraints allow, and the registered modules' base rules. Their values are
 * written out rather than read from the schema, which the client would then load whole; tests/shared/enums.test.ts
 * checks the constraints' and the base rules' against the migrated database.
 */

import type { contributorRole, exportStatus, role, rulesetKind } from "@/drizzle/schema.ts";

/** A registered module's base rules: `rules.modules` holds them, and `rulesets.base_rules` names one. */
export type BaseRules = (typeof BASE_RULES_OPTIONS)[number];
/** A campaign player's role. */
export type CampaignRole = (typeof role.enumValues)[number];
export type ContributorRole = (typeof contributorRole.enumValues)[number];
/** A contributor's status, a ruleset's or a character's: what their tables' CHECK constraints allow. */
export type ContributorStatus = (typeof CONTRIBUTOR_STATUSES)[number];
/** Where an export stands: queued (`pending`), its file stored (`ready`), or given up on (`failed`). */
export type ExportStatus = (typeof exportStatus.enumValues)[number];

export type RulesetKind = (typeof rulesetKind.enumValues)[number];

export const BASE_RULES_OPTIONS = ["Dungeons & Dragons: 3.5"] as const;
/** A ruleset contributor's roles, highest first: the `contributor_role` enum's. */
export const CONTRIBUTOR_ROLES = ["Admin", "Editor", "Viewer"] as const satisfies readonly ContributorRole[];
export const CONTRIBUTOR_STATUSES = ["Pending", "Active", "Rejected", "Revoked"] as const;
