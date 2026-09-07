import { pgSchema, index, foreignKey, timestamp, uuid, text, uniqueIndex, check, numeric, json, unique, integer, boolean, primaryKey, pgEnum, smallint, customType } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const bytea = customType<{ data: Buffer }>({
	dataType() { return "bytea"; },
});

export const campaign = pgSchema("campaign");
export const rules = pgSchema("rules");
export const account = pgSchema("account");
export const character = pgSchema("character");
export const customization = pgSchema("customization");
export const storage = pgSchema("storage");
export const alignment = pgEnum("alignment", ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'])
export const baseRules = pgEnum("base_rules", ['Dungeons & Dragons: 3.5'])
export const gender = pgEnum("gender", ['Male', 'Female', 'Other'])
export const location = pgEnum("location", ['Head', 'Neck', 'Shoulders', 'Torso', 'Wrists', 'Hands', 'Waist', 'Finger', 'Trinket', 'Main Hand', 'Off Hand', 'Two Handed', 'Other'])
export const role = pgEnum("role", ['Game Master', 'Player Character'])
export const rulesetStatus = pgEnum("ruleset_status", ['Draft', 'Published', 'Archived'])
export const rulesetKind = pgEnum("ruleset_kind", ['ruleset', 'extension'])
export const sizeType = pgEnum("size_type", ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'])
export const contributorRole = pgEnum("contributor_role", ['Admin', 'Editor', 'Viewer'])

export const campaignsInCampaign = campaign.table("campaigns", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	name: text().notNull(),
	description: text(),
}, (table) => [
	index("campaigns_ruleset_id_name_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast().op("text_pattern_ops")),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "campaigns_ruleset_id_fkey"
		}).onDelete("cascade"),
]);

export const aptitudesInRules = rules.table("aptitudes", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
}, (table) => [
	index("aptitudes_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("aptitudes_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("aptitudes_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	index("aptitudes_ruleset_id_name_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "aptitudes_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "aptitudes_campaign_id_fkey"
		}).onDelete("cascade"),
]);

export const activitiesInAccount = account.table("activities", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	targetId: uuid("target_id").notNull(),
	targetTable: text("target_table").notNull(),
	type: text().notNull(),
	data: json(),
}, (table) => [
	index("activities_target_id_target_table").using("btree", table.targetId.asc().nullsLast(), table.targetTable.asc().nullsLast()),
	index("activities_type").using("btree", table.type.asc().nullsLast()),
	index("activities_user_id").using("btree", table.userId.asc().nullsLast()),
	index("activities_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "activities_user_id_fkey"
		}).onDelete("cascade"),
]);

export const notificationsInAccount = account.table("notifications", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	recipientId: uuid("recipient_id").notNull(),
	actorId: uuid("actor_id").notNull(),
	activityId: uuid("activity_id"),
	type: text().notNull(),
	targetId: uuid("target_id").notNull(),
	targetTable: text("target_table").notNull(),
	data: json(),
	readAt: timestamp("read_at", { mode: 'string', withTimezone: true }),
}, (table) => [
	index("notifications_recipient_unread_idx").using("btree", table.recipientId.asc().nullsLast(), table.createdAt.desc().nullsLast()).where(sql`read_at IS NULL`),
	index("notifications_recipient_id_created_at_idx").using("btree", table.recipientId.asc().nullsLast(), table.createdAt.desc().nullsLast()),
	index("notifications_activity_id_idx").using("btree", table.activityId.asc().nullsLast()),
	index("notifications_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
	foreignKey({
			columns: [table.recipientId],
			foreignColumns: [usersInAccount.id],
			name: "notifications_recipient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [usersInAccount.id],
			name: "notifications_actor_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.activityId],
			foreignColumns: [activitiesInAccount.id],
			name: "notifications_activity_id_fkey"
		}).onDelete("set null"),
]);

export const abilitiesInRules = rules.table("abilities", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text().notNull(),
}, (table) => [
	index("abilities_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("abilities_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("abilities_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "abilities_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "abilities_campaign_id_fkey"
		}).onDelete("cascade"),
]);

export const itemsInRules = rules.table("items", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	sourceItemId: uuid("source_item_id"),
	isTemplate: boolean("is_template").default(false).notNull(),
	name: text().notNull(),
	description: text(),
	weight: numeric({ precision: 6, scale:  2 }),
	costGp: numeric("cost_gp", { precision: 10, scale:  2 }),
	type: text("type"),
	slot: location().default("Other").notNull(),
	}, (table) => [
	index("items_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	index("items_source_item_id").using("btree", table.sourceItemId.asc().nullsLast()),
	uniqueIndex("items_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("items_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	index("items_ruleset_id_is_template_idx").using("btree", table.rulesetId.asc().nullsLast(), table.isTemplate.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "items_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "items_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceItemId],
			foreignColumns: [table.id],
			name: "items_source_item_id_fkey"
		}).onDelete("restrict"),
	check("items_weight_check", sql`weight >= (0)::numeric`),
	check("items_cost_gp_check", sql`cost_gp >= (0)::numeric`),
]);

export const klassLevelsInRules = rules.table("klass_levels", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	klassId: uuid("klass_id").notNull(),
	level: integer().notNull(),
}, (table) => [
	index("klass_levels_klass_id").using("btree", table.klassId.asc().nullsLast()),
	uniqueIndex("klass_levels_klass_id_level").using("btree", table.klassId.asc().nullsLast(), table.level.asc().nullsLast()),
	foreignKey({
			columns: [table.klassId],
			foreignColumns: [klassesInRules.id],
			name: "klass_levels_klass_id_fkey"
		}).onDelete("cascade"),
	unique("klass_levels_klass_id_level_key").on(table.klassId, table.level),
	check("klass_levels_level_check", sql`(level >= 1) AND (level <= 20)`),
]);

export const invitesInCampaign = campaign.table("invites", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id"),
	email: text(),
	playerId: uuid("player_id").notNull(),
	status: text().default('Pending').notNull(),
}, (table) => [
	index("invites_email_status_idx").using("btree", table.email.asc().nullsLast(), table.status.asc().nullsLast()),
	index("invites_player_id_status_idx").using("btree", table.playerId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("invites_user_id_player_id_status_idx").using("btree", table.userId.asc().nullsLast(), table.playerId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("invites_user_id_status_idx").using("btree", table.userId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [playersInCampaign.id],
			name: "invites_player_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "invites_user_id_fkey"
		}).onDelete("cascade"),
	check("invites_status_check", sql`status = ANY (ARRAY['Pending'::text, 'Accepted'::text, 'Rejected'::text, 'Expired'::text, 'Revoked'::text])`),
	check("invites_user_or_email_check", sql`(user_id IS NOT NULL) OR (email IS NOT NULL)`),
]);

export const klassesInRules = rules.table("klasses", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	hd: integer().notNull(),
	parentId: uuid("parent_id"),
	kind: text().notNull().default('pc'),
}, (table) => [
	index("klasses_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("klasses_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast(), table.kind.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("klasses_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast(), table.kind.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	index("klasses_ruleset_id_deleted_at_idx").using("btree", table.rulesetId.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "klasses_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "klasses_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "klasses_parent_id_fkey"
		}).onDelete("cascade"),
	check("klasses_hd_check", sql`hd = ANY (ARRAY[4, 6, 8, 10, 12])`),
]);

export const charactersInCharacter = character.table("characters", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	raceId: uuid("race_id").notNull(),
	kind: text().notNull().default('pc'),
	parentCharacterId: uuid("parent_character_id"),
	xp: integer().notNull(),
	name: text().notNull(),
	alignment: alignment().notNull(),
	age: integer(),
	gender: gender().notNull(),
	height: text(),
	weight: text(),
	deity: text(),
	description: text(),
	notes: text(),
	privateNotes: text("private_notes"),
	shareToken: text("share_token"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "characters_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "characters_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.raceId],
			foreignColumns: [racesInRules.id],
			name: "characters_race_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.parentCharacterId],
			foreignColumns: [table.id],
			name: "characters_parent_character_id_fkey"
		}).onDelete("cascade"),
	index("characters_parent_character_id_idx").using("btree", table.parentCharacterId.asc().nullsLast()).where(sql`(parent_character_id IS NOT NULL)`),
	uniqueIndex("characters_one_bonded_per_kind_per_master_idx").using("btree", table.parentCharacterId.asc().nullsLast(), table.kind.asc().nullsLast()).where(sql`(deleted_at IS NULL AND parent_character_id IS NOT NULL)`),
	uniqueIndex("characters_share_token_unique_idx").using("btree", table.shareToken.asc().nullsLast()).where(sql`(share_token IS NOT NULL)`),
	check("characters_xp_check", sql`xp >= 0`),
	check("characters_age_check", sql`age IS NULL OR age > 0`),
	check("characters_kind_parent_check", sql`(kind = 'pc') = (parent_character_id IS NULL)`),
	check("characters_no_self_parent_check", sql`id <> parent_character_id`),
]);

export const contributorsInCharacter = character.table("character_contributors", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	characterId: uuid("character_id").notNull(),
	userId: uuid("user_id"),
	email: text().notNull(),
	role: contributorRole().notNull().default('Editor'),
	status: text().notNull().default('Pending'),
	invitedBy: uuid("invited_by").notNull(),
}, (table) => [
	index("character_contributors_character_status_idx").using("btree", table.characterId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("character_contributors_user_status_idx").using("btree", table.userId.asc().nullsLast(), table.status.asc().nullsLast()),
	uniqueIndex("character_contributors_character_user_unique").using("btree", table.characterId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`status IN ('Pending', 'Active') AND deleted_at IS NULL`),
	uniqueIndex("character_contributors_character_email_unique").using("btree", table.characterId.asc().nullsLast(), table.email.asc().nullsLast()).where(sql`user_id IS NULL AND status IN ('Pending', 'Active') AND deleted_at IS NULL`),
	foreignKey({
		columns: [table.characterId],
		foreignColumns: [charactersInCharacter.id],
		name: "character_contributors_character_id_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInAccount.id],
		name: "character_contributors_user_id_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.invitedBy],
		foreignColumns: [usersInAccount.id],
		name: "character_contributors_invited_by_fk"
	}).onDelete("cascade"),
	check("character_contributors_status_check", sql`status = ANY (ARRAY['Pending', 'Active', 'Rejected', 'Revoked'])`),
	check("character_contributors_email_or_user", sql`(user_id IS NOT NULL) OR (email IS NOT NULL)`),
]);

export const featsInRules = rules.table("feats", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	stackable: boolean().default(false).notNull(),
	selectable: boolean().default(true).notNull(),
}, (table) => [
	index("feats_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("feats_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("feats_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	index("feats_ruleset_id_deleted_at_idx").using("btree", table.rulesetId.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "feats_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "feats_campaign_id_fkey"
		}).onDelete("cascade"),
]);

export const levelsInCharacter = character.table("levels", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	characterId: uuid("character_id").notNull(),
	klassLevelId: uuid("klass_level_id").notNull(),
	hp: integer().notNull(),
	abilityId: uuid("ability_id"),
}, (table) => [
	index("character_levels_character_id").using("btree", table.characterId.asc().nullsLast()),
	index("character_levels_klass_level_id").using("btree", table.klassLevelId.asc().nullsLast()),
	foreignKey({
			columns: [table.characterId],
			foreignColumns: [charactersInCharacter.id],
			name: "levels_character_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.klassLevelId],
			foreignColumns: [klassLevelsInRules.id],
			name: "levels_klass_level_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.abilityId],
			foreignColumns: [abilitiesInRules.id],
			name: "levels_ability_id_fkey"
		}).onDelete("set null"),
	unique("levels_character_id_klass_level_id_key").on(table.characterId, table.klassLevelId),
	check("levels_hp_check", sql`hp > 0`),
]);

export const playerCharactersInCampaign = campaign.table("player_characters", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	playerId: uuid("player_id").notNull(),
	characterId: uuid("character_id").notNull(),
	visibility: text().default('Private').notNull(),
}, (table) => [
	index("player_characters_player_id_character_id_idx").using("btree", table.playerId.asc().nullsLast(), table.characterId.asc().nullsLast()),
	uniqueIndex("player_characters_character_id_active_idx")
		.using("btree", table.characterId.asc().nullsLast())
		.where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [playersInCampaign.id],
			name: "player_characters_player_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.characterId],
			foreignColumns: [charactersInCharacter.id],
			name: "player_characters_character_id_fkey"
		}).onDelete("cascade"),
	check("player_characters_visibility_check", sql`visibility = ANY (ARRAY['Private'::text, 'Public'::text, 'Partial'::text])`),
]);

export const modifiersInCustomization = customization.table("modifiers", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	sourceId: uuid("source_id").notNull(),
	sourceType: text("source_type").notNull(),
	target: text().notNull(),
	value: text().notNull(),
	valueType: text("value_type").notNull(),
	operator: text().notNull(),
}, (table) => [
	index("modifiers_source_id_idx").using("btree", table.sourceId.asc().nullsLast()),
	index("modifiers_source_type_idx").using("btree", table.sourceType.asc().nullsLast()),
	check("modifiers_value_type_check", sql`value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])`),
	check("modifiers_operator_check", sql`operator = ANY (ARRAY['add'::text, 'subtract'::text, 'multiply'::text, 'divide'::text, 'set'::text])`),
]);

export const propertiesInCustomization = customization.table("properties", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	entityType: text("entity_type").notNull(),
	value: text().notNull(),
	type: text().notNull(),
	description: text(),
}, (table) => [
	index("properties_entity_id_idx").using("btree", table.entityId.asc().nullsLast()),
	unique("properties_entity_id_entity_type_type_value_key").on(table.entityId, table.entityType, table.type, table.value),
	index("properties_type_entity_type_idx").using("btree", table.type.asc().nullsLast(), table.entityType.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	index("properties_type_value_idx").using("btree", table.type.asc().nullsLast(), table.value.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
]);

export const playersInCampaign = campaign.table("players", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id"),
	campaignId: uuid("campaign_id").notNull(),
	role: role().notNull(),
}, (table) => [
	index("players_campaign_id").using("btree", table.campaignId.asc().nullsLast()),
	index("players_user_id").using("btree", table.userId.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "players_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "players_campaign_id_fkey"
		}).onDelete("cascade"),
]);

export const languagesInRules = rules.table("languages", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	type: text().notNull(),
}, (table) => [
	index("languages_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("languages_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("languages_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "languages_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "languages_campaign_id_fkey"
		}).onDelete("cascade"),
]);

export const mechanicsInRules = rules.table("mechanics", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
}, (table) => [
	index("mechanics_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("mechanics_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("mechanics_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "mechanics_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "mechanics_campaign_id_fkey"
		}).onDelete("cascade"),
]);

export const requirementsInCustomization = customization.table("requirements", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	entityType: text("entity_type").notNull(),
	level: text().notNull(),
	target: text(),
	value: text(),
	valueType: text("value_type"),
	operator: text(),
	chainingOperator: text("chaining_operator"),
}, (table) => [
	index("requirements_entity_id_idx").using("btree", table.entityId.asc().nullsLast()),
	index("requirements_entity_type_idx").using("btree", table.entityType.asc().nullsLast()),
	unique("requirements_entity_id_entity_type_level_key").on(table.entityId, table.entityType, table.level),
	check("requirements_value_type_check", sql`value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])`),
	check("requirements_operator_check", sql`operator = ANY (ARRAY['equal'::text, 'not_equal'::text, 'greater_than'::text, 'less_than'::text, 'greater_than_or_equal'::text, 'less_than_or_equal'::text, 'contains'::text, 'not_contains'::text, 'starts_with'::text, 'ends_with'::text, 'matches_regex'::text, 'not_matches_regex'::text, 'is_empty'::text, 'not_empty'::text])`),
	check("requirements_check", sql`(chaining_operator = ANY (ARRAY['and'::text, 'or'::text])) AND (((chaining_operator IS NULL) AND (operator IS NOT NULL) AND (value IS NOT NULL) AND (value_type IS NOT NULL) AND (target IS NOT NULL)) OR ((chaining_operator IS NOT NULL) AND (operator IS NULL) AND (value IS NULL) AND (value_type IS NULL) AND (target IS NULL)))`),
]);

export const racesInRules = rules.table("races", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	size: sizeType().notNull(),
	baseSpeed: integer("base_speed").notNull(),
	parentId: uuid("parent_id"),
	kind: text().notNull().default('pc'),
}, (table) => [
	index("races_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("races_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast(), table.kind.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("races_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast(), table.kind.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "races_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "races_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "races_parent_id_fkey"
		}).onDelete("cascade"),
	check("races_base_speed_check", sql`base_speed > 0`),
]);

export const sessionsInAccount = account.table("sessions", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string', withTimezone: true }).notNull(),
}, (table) => [
	index("sessions_user_id").using("btree", table.userId.asc().nullsLast()),
	index("sessions_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "sessions_user_id_fkey"
		}).onDelete("cascade"),
]);

export const savesInRules = rules.table("saves", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	abilityId: uuid("ability_id").notNull(),
}, (table) => [
	index("saves_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("saves_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("saves_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "saves_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "saves_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.abilityId],
			foreignColumns: [abilitiesInRules.id],
			name: "saves_ability_id_fkey"
		}).onDelete("cascade"),
]);

export const rulesetsInRules = rules.table("rulesets", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	name: text().notNull(),
	rulesetId: uuid("ruleset_id"),
	ancestorRulesetIds: uuid("ancestor_ruleset_ids").array().default([]).notNull(),
	extensionRulesetIds: uuid("extension_ruleset_ids").array().default([]).notNull(),
	description: text().notNull(),
	userId: uuid("user_id"),
	/** True for system-seeded bases and extensions; false for user forks (including orphaned ones). */
	system: boolean().default(false).notNull(),
	private: boolean().default(false).notNull(),
	status: rulesetStatus().default('Draft').notNull(),
	kind: rulesetKind().default('ruleset').notNull(),
	baseRules: baseRules("base_rules").notNull(),
}, (table) => [
	uniqueIndex("rulesets_name_unique_idx").using("btree", table.name.asc().nullsLast()),
	index("rulesets_user_id_private_idx").using("btree", table.userId.asc().nullsLast(), table.private.asc().nullsLast()),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [table.id],
			name: "rulesets_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "rulesets_user_id_fkey"
		}).onDelete("cascade"),
]);

export const starredRulesetsInAccount = account.table("starred_rulesets", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	userId: uuid("user_id").notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
}, (table) => [
	index("starred_rulesets_user_id").using("btree", table.userId.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "starred_rulesets_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "starred_rulesets_ruleset_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.rulesetId], name: "starred_rulesets_pkey"}),
]);

export const usersInAccount = account.table("users", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	emailAddress: text("email_address").notNull(),
	passwordDigest: text("password_digest"),
	username: text(),
	emailVerifiedAt: timestamp("email_verified_at", { mode: 'string', withTimezone: true }),
	pendingEmailAddress: text("pending_email_address"),
	onboardingCompletedAt: timestamp("onboarding_completed_at", { mode: 'string', withTimezone: true }),
	expiresAt: timestamp("expires_at", { mode: 'string', withTimezone: true }),
}, (table) => [
	uniqueIndex("users_email").using("btree", table.emailAddress.asc().nullsLast()),
	uniqueIndex("users_username").using("btree", table.username.asc().nullsLast()),
	index("users_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
]);

export const oauthAccountsInAccount = account.table("oauth_accounts", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	provider: text().notNull(),
	providerAccountId: text("provider_account_id").notNull(),
}, (table) => [
	index("oauth_accounts_user_id").using("btree", table.userId.asc().nullsLast()),
	uniqueIndex("oauth_accounts_provider_provider_account_id").using("btree", table.provider.asc().nullsLast(), table.providerAccountId.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInAccount.id],
		name: "oauth_accounts_user_id_fkey"
	}).onDelete("cascade"),
]);

export const emailVerificationsInAccount = account.table("email_verifications", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	code: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string', withTimezone: true }).notNull(),
}, (table) => [
	index("email_verifications_user_id").using("btree", table.userId.asc().nullsLast()),
	index("email_verifications_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInAccount.id],
		name: "email_verifications_user_id_fkey"
	}).onDelete("cascade"),
]);

export const passwordResetsInAccount = account.table("password_resets", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	code: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string', withTimezone: true }).notNull(),
}, (table) => [
	index("password_resets_user_id").using("btree", table.userId.asc().nullsLast()),
	index("password_resets_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInAccount.id],
		name: "password_resets_user_id_fkey"
	}).onDelete("cascade"),
]);

export const skillsInRules = rules.table("skills", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	primaryAbilityId: uuid("primary_ability_id").notNull(),
}, (table) => [
	index("skills_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("skills_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("skills_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "skills_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "skills_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.primaryAbilityId],
			foreignColumns: [abilitiesInRules.id],
			name: "skills_primary_ability_id_fkey"
		}).onDelete("cascade"),
]);

export const powersInRules = rules.table("powers", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	campaignId: uuid("campaign_id"),
	name: text().notNull(),
	description: text(),
	saveId: uuid("save_id"),
	saveEffect: text("save_effect"),
}, (table) => [
	index("powers_ruleset_id_campaign_id").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast()),
	uniqueIndex("powers_with_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.campaignId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NOT NULL)`),
	uniqueIndex("powers_without_campaign_unique_idx").using("btree", table.rulesetId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(campaign_id IS NULL)`),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "powers_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaignsInCampaign.id],
			name: "powers_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.saveId],
			foreignColumns: [savesInRules.id],
			name: "powers_save_id_fkey"
		}).onDelete("set null"),
]);

export const klassSkillsInRules = rules.table("klass_skills", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	klassId: uuid("klass_id").notNull(),
	skillId: uuid("skill_id").notNull(),
}, (table) => [
	index("klass_skills_klass_id").using("btree", table.klassId.asc().nullsLast()),
	index("klass_skills_skill_id").using("btree", table.skillId.asc().nullsLast()),
	foreignKey({
			columns: [table.klassId],
			foreignColumns: [klassesInRules.id],
			name: "klass_skills_klass_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInRules.id],
			name: "klass_skills_skill_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.klassId, table.skillId], name: "klass_skills_pkey"}),
]);

export const featsAptitudesInRules = rules.table("feats_aptitudes", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	featId: uuid("feat_id").notNull(),
	aptitudeId: uuid("aptitude_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.featId],
			foreignColumns: [featsInRules.id],
			name: "feats_aptitudes_feat_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.aptitudeId],
			foreignColumns: [aptitudesInRules.id],
			name: "feats_aptitudes_aptitude_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.featId, table.aptitudeId], name: "feats_aptitudes_pkey"}),
]);

export const languagesInCharacter = character.table("languages", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	characterId: uuid("character_id").notNull(),
	languageId: uuid("language_id").notNull(),
}, (table) => [
	index("character_languages_character_id").using("btree", table.characterId.asc().nullsLast()),
	index("character_languages_language_id").using("btree", table.languageId.asc().nullsLast()),
	foreignKey({
			columns: [table.characterId],
			foreignColumns: [charactersInCharacter.id],
			name: "languages_character_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languagesInRules.id],
			name: "languages_language_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.characterId, table.languageId], name: "languages_pkey"}),
]);

export const characterAbilitiesInCharacter = character.table("character_abilities", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	characterId: uuid("character_id").notNull(),
	abilityId: uuid("ability_id").notNull(),
	score: integer().notNull(),
}, (table) => [
	index("character_abilities_ability_id").using("btree", table.abilityId.asc().nullsLast()),
	index("character_abilities_character_id").using("btree", table.characterId.asc().nullsLast()),
	index("character_abilities_character_id_alive_idx").using("btree", table.characterId.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.characterId],
			foreignColumns: [charactersInCharacter.id],
			name: "character_abilities_character_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.abilityId],
			foreignColumns: [abilitiesInRules.id],
			name: "character_abilities_ability_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.characterId, table.abilityId], name: "character_abilities_pkey"}),
	check("character_abilities_score_check", sql`(score >= 1) AND (score <= 100)`),
]);

export const klassLevelSavesInRules = rules.table("klass_level_saves", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	klassLevelId: uuid("klass_level_id").notNull(),
	saveId: uuid("save_id").notNull(),
	base: integer().notNull(),
}, (table) => [
	index("klass_level_saves_klass_level_id").using("btree", table.klassLevelId.asc().nullsLast()),
	index("klass_level_saves_save_id").using("btree", table.saveId.asc().nullsLast()),
	foreignKey({
			columns: [table.klassLevelId],
			foreignColumns: [klassLevelsInRules.id],
			name: "klass_level_saves_klass_level_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.saveId],
			foreignColumns: [savesInRules.id],
			name: "klass_level_saves_save_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.klassLevelId, table.saveId], name: "klass_level_saves_pkey"}),
	check("klass_level_saves_base_check", sql`(base >= 0) AND (base <= 12)`),
]);

export const klassLevelFeatsInRules = rules.table("klass_level_feats", {
	id: uuid().default(sql`public.gen_random_uuid()`).notNull(),
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	klassLevelId: uuid("klass_level_id").notNull(),
	featId: uuid("feat_id").notNull(),
	aptitudeId: uuid("aptitude_id").notNull(),
	free: boolean().default(false).notNull(),
}, (table) => [
	uniqueIndex("klass_level_feats_id_key").using("btree", table.id.asc().nullsLast()),
	index("klass_level_feats_feat_id").using("btree", table.featId.asc().nullsLast()),
	index("klass_level_feats_klass_level_id").using("btree", table.klassLevelId.asc().nullsLast()),
	foreignKey({
			columns: [table.klassLevelId],
			foreignColumns: [klassLevelsInRules.id],
			name: "klass_level_feats_klass_level_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.featId],
			foreignColumns: [featsInRules.id],
			name: "klass_level_feats_feat_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.aptitudeId],
			foreignColumns: [aptitudesInRules.id],
			name: "klass_level_feats_aptitude_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.klassLevelId, table.featId], name: "klass_level_feats_pkey"}),
]);

export const powersAptitudesInRules = rules.table("powers_aptitudes", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	powerId: uuid("power_id").notNull(),
	aptitudeId: uuid("aptitude_id").notNull(),
	level: integer(),
}, (table) => [
	foreignKey({
			columns: [table.powerId],
			foreignColumns: [powersInRules.id],
			name: "powers_aptitudes_power_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.aptitudeId],
			foreignColumns: [aptitudesInRules.id],
			name: "powers_aptitudes_aptitude_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.powerId, table.aptitudeId], name: "powers_aptitudes_pkey"}),
]);

export const klassLevelPowersInRules = rules.table("klass_level_powers", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	klassLevelId: uuid("klass_level_id").notNull(),
	powerId: uuid("power_id").notNull(),
	aptitudeId: uuid("aptitude_id").notNull(),
	free: boolean().default(false).notNull(),
}, (table) => [
	index("klass_level_powers_power_id").using("btree", table.powerId.asc().nullsLast()),
	index("klass_level_powers_klass_level_id").using("btree", table.klassLevelId.asc().nullsLast()),
	foreignKey({
			columns: [table.klassLevelId],
			foreignColumns: [klassLevelsInRules.id],
			name: "klass_level_powers_klass_level_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.powerId],
			foreignColumns: [powersInRules.id],
			name: "klass_level_powers_power_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.aptitudeId],
			foreignColumns: [aptitudesInRules.id],
			name: "klass_level_powers_aptitude_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.klassLevelId, table.powerId], name: "klass_level_powers_pkey"}),
]);

export const levelPowersInCharacter = character.table("level_powers", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	characterLevelId: uuid("character_level_id").notNull(),
	powerId: uuid("power_id").notNull(),
	aptitudeId: uuid("aptitude_id").notNull(),
}, (table) => [
	index("character_level_powers_character_level_id").using("btree", table.characterLevelId.asc().nullsLast()),
	index("character_level_powers_power_id").using("btree", table.powerId.asc().nullsLast()),
	foreignKey({
			columns: [table.characterLevelId],
			foreignColumns: [levelsInCharacter.id],
			name: "level_powers_character_level_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.powerId],
			foreignColumns: [powersInRules.id],
			name: "level_powers_power_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.aptitudeId],
			foreignColumns: [aptitudesInRules.id],
			name: "level_powers_aptitude_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.characterLevelId, table.powerId], name: "level_powers_pkey"}),
]);

export const levelSkillsInCharacter = character.table("level_skills", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	characterLevelId: uuid("character_level_id").notNull(),
	skillId: uuid("skill_id").notNull(),
	rank: integer().notNull(),
}, (table) => [
	index("character_level_skills_character_level_id").using("btree", table.characterLevelId.asc().nullsLast()),
	index("character_level_skills_skill_id").using("btree", table.skillId.asc().nullsLast()),
	index("character_level_skills_level_id_alive_idx").using("btree", table.characterLevelId.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.characterLevelId],
			foreignColumns: [levelsInCharacter.id],
			name: "level_skills_character_level_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInRules.id],
			name: "level_skills_skill_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.characterLevelId, table.skillId], name: "level_skills_pkey"}),
	check("level_skills_rank_check", sql`rank > 0`),
]);

export const levelFeatsInCharacter = character.table("level_feats", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	characterLevelId: uuid("character_level_id").notNull(),
	featId: uuid("feat_id").notNull(),
	aptitudeId: uuid("aptitude_id").notNull(),
}, (table) => [
	index("character_level_feats_character_level_id").using("btree", table.characterLevelId.asc().nullsLast()),
	index("character_level_feats_feat_id").using("btree", table.featId.asc().nullsLast()),
	foreignKey({
			columns: [table.characterLevelId],
			foreignColumns: [levelsInCharacter.id],
			name: "level_feats_character_level_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.featId],
			foreignColumns: [featsInRules.id],
			name: "level_feats_feat_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.aptitudeId],
			foreignColumns: [aptitudesInRules.id],
			name: "level_feats_aptitude_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.characterLevelId, table.featId], name: "level_feats_pkey"}),
]);

export const rulesetExtensionsInRules = rules.table("ruleset_extensions", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	rulesetId: uuid("ruleset_id").notNull(),
	extensionId: uuid("extension_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "ruleset_extensions_ruleset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.extensionId],
			foreignColumns: [rulesetsInRules.id],
			name: "ruleset_extensions_extension_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.rulesetId, table.extensionId], name: "ruleset_extensions_pkey"}),
]);

export const entitySnapshotsInRules = rules.table("entity_snapshots", {
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	entityType: text("entity_type").notNull(),
	sourceEntityId: uuid("source_entity_id").notNull(),
	forkedEntityId: uuid("forked_entity_id").notNull(),
	contentHash: text("content_hash").notNull(),
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("entity_snapshots_ruleset_id_entity_type").using("btree", table.rulesetId.asc().nullsLast(), table.entityType.asc().nullsLast()),
	index("entity_snapshots_ruleset_type_source").using("btree", table.rulesetId.asc().nullsLast(), table.entityType.asc().nullsLast(), table.sourceEntityId.asc().nullsLast()),
	unique("entity_snapshots_ruleset_type_source_unique").on(table.rulesetId, table.entityType, table.sourceEntityId),
	foreignKey({
			columns: [table.rulesetId],
			foreignColumns: [rulesetsInRules.id],
			name: "entity_snapshots_ruleset_id_fkey"
		}).onDelete("cascade"),
]);

export const contentPackagesInRules = rules.table("content_packages", {
	name: text().primaryKey().notNull(),
	type: text().notNull(),
	version: integer().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contributorsInRules = rules.table("contributors", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	rulesetId: uuid("ruleset_id").notNull(),
	userId: uuid("user_id"),
	email: text().notNull(),
	role: contributorRole().notNull().default('Editor'),
	status: text().notNull().default('Pending'),
	invitedBy: uuid("invited_by").notNull(),
}, (table) => [
	index("contributors_ruleset_status_idx").using("btree", table.rulesetId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("contributors_user_status_idx").using("btree", table.userId.asc().nullsLast(), table.status.asc().nullsLast()),
	uniqueIndex("contributors_ruleset_user_unique").using("btree", table.rulesetId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`status IN ('Pending', 'Active') AND deleted_at IS NULL`),
	uniqueIndex("contributors_ruleset_email_unique").using("btree", table.rulesetId.asc().nullsLast(), table.email.asc().nullsLast()).where(sql`user_id IS NULL AND status IN ('Pending', 'Active') AND deleted_at IS NULL`),
	foreignKey({
		columns: [table.rulesetId],
		foreignColumns: [rulesetsInRules.id],
		name: "contributors_ruleset_id_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInAccount.id],
		name: "contributors_user_id_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.invitedBy],
		foreignColumns: [usersInAccount.id],
		name: "contributors_invited_by_fk"
	}).onDelete("cascade"),
	check("contributors_status_check", sql`status = ANY (ARRAY['Pending', 'Active', 'Rejected', 'Revoked'])`),
	check("contributors_email_or_user", sql`(user_id IS NOT NULL) OR (email IS NOT NULL)`),
]);

export const inventoryInCharacter = character.table("inventory", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string', withTimezone: true }),
	characterId: uuid("character_id").notNull(),
	itemId: uuid("item_id").notNull(),
	quantity: integer().notNull(),
	totalCharges: integer("total_charges"),
	remainingCharges: integer("remaining_charges"),
	equipped: boolean().default(false).notNull(),
	location: location(),
	weaponSet: smallint("weapon_set"),
}, (table) => [
	index("character_inventory_character_id").using("btree", table.characterId.asc().nullsLast()),
	index("character_inventory_item_id").using("btree", table.itemId.asc().nullsLast()),
	foreignKey({
			columns: [table.characterId],
			foreignColumns: [charactersInCharacter.id],
			name: "inventory_character_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [itemsInRules.id],
			name: "inventory_item_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.characterId, table.itemId], name: "inventory_pkey"}),
	check("inventory_quantity_check", sql`quantity > 0`),
	check("inventory_check", sql`(total_charges IS NULL) OR ((total_charges >= 0) AND (remaining_charges IS NOT NULL))`),
	check("inventory_check1", sql`(remaining_charges IS NULL) OR ((remaining_charges >= 0) AND (total_charges IS NOT NULL))`),
]);

export const exportsInAccount = account.table("exports", {
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
	type: text().notNull(),
	mimeType: text("mime_type").notNull(),
	fileName: text("file_name").notNull(),
	data: bytea("data").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string', withTimezone: true }).notNull(),
}, (table) => [
	index("exports_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	index("exports_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAccount.id],
			name: "exports_user_id_fkey"
		}).onDelete("cascade"),
]);


export const blobsInStorage = storage.table("blobs", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	key: text().notNull(),
	filename: text().notNull(),
	contentType: text("content_type").notNull(),
	byteSize: integer("byte_size").notNull(),
	metadata: json().default({}).notNull(),
	attachedAt: timestamp("attached_at", { mode: 'string', withTimezone: true }),
}, (table) => [
	uniqueIndex("blobs_key_unique_idx").using("btree", table.key.asc().nullsLast()),
	index("blobs_pending_idx").using("btree", table.createdAt.asc().nullsLast()).where(sql`(attached_at IS NULL)`),
	index("blobs_attached_idx").using("btree", table.createdAt.asc().nullsLast()).where(sql`(attached_at IS NOT NULL)`),
]);

export const attachmentsInStorage = storage.table("attachments", {
	createdAt: timestamp("created_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', withTimezone: true }).defaultNow().notNull(),
	id: uuid().default(sql`public.gen_random_uuid()`).primaryKey().notNull(),
	recordType: text("record_type").notNull(),
	recordId: uuid("record_id").notNull(),
	name: text().notNull(),
	blobId: uuid("blob_id").notNull(),
}, (table) => [
	uniqueIndex("attachments_record_name_unique_idx")
		.using("btree", table.recordType.asc().nullsLast(), table.recordId.asc().nullsLast(), table.name.asc().nullsLast()),
	index("attachments_record_idx").using("btree", table.recordType.asc().nullsLast(), table.recordId.asc().nullsLast()),
	index("attachments_blob_id_idx").using("btree", table.blobId.asc().nullsLast()),
	foreignKey({
			columns: [table.blobId],
			foreignColumns: [blobsInStorage.id],
			name: "attachments_blob_id_fkey"
		}).onDelete("cascade"),
]);
