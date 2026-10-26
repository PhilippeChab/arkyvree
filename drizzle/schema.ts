import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  json,
  numeric,
  pgEnum,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const account = pgSchema("account");

export const usersInAccount = account.table(
  "users",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    emailAddress: text("email_address").notNull(),
    passwordDigest: text("password_digest"),
    username: text(),
    emailVerifiedAt: timestamp("email_verified_at", { mode: "string", withTimezone: true }),
    pendingEmailAddress: text("pending_email_address"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { mode: "string", withTimezone: true }),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email").using("btree", table.emailAddress.asc().nullsLast()),
    uniqueIndex("users_username").using("btree", table.username.asc().nullsLast()),
    index("users_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
  ],
);

export const activitiesInAccount = account.table(
  "activities",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    targetId: uuid("target_id").notNull(),
    targetTable: text("target_table").notNull(),
    type: text().notNull(),
    data: json(),
  },
  (table) => [
    index("activities_target_id_target_table").using(
      "btree",
      table.targetId.asc().nullsLast(),
      table.targetTable.asc().nullsLast(),
    ),
    index("activities_type").using("btree", table.type.asc().nullsLast()),
    index("activities_user_id").using("btree", table.userId.asc().nullsLast()),
    index("activities_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "activities_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const character = pgSchema("character");

export const rules = pgSchema("rules");

export const modulesInRules = rules.table("modules", {
  baseRules: text("base_rules").primaryKey().notNull(),
});

export const rulesetKind = pgEnum("ruleset_kind", ["ruleset", "extension"]);

export const rulesetStatus = pgEnum("ruleset_status", ["Draft", "Published", "Archived"]);

export const rulesetsInRules = rules.table(
  "rulesets",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    name: text().notNull(),
    rulesetId: uuid("ruleset_id"),
    ancestorRulesetIds: uuid("ancestor_ruleset_ids").array().default([]).notNull(),
    extensionRulesetIds: uuid("extension_ruleset_ids").array().default([]).notNull(),
    description: text().notNull(),
    userId: uuid("user_id"),
    /** True for system-seeded bases and extensions; false for user forks (including orphaned ones). */
    system: boolean().default(false).notNull(),
    private: boolean().default(false).notNull(),
    status: rulesetStatus().default("Draft").notNull(),
    kind: rulesetKind().default("ruleset").notNull(),
    baseRules: text("base_rules").notNull().$type<"Dungeons & Dragons: 3.5">(),
  },
  (table) => [
    foreignKey({
      columns: [table.baseRules],
      foreignColumns: [modulesInRules.baseRules],
      name: "rulesets_base_rules_fkey",
    }),
    uniqueIndex("rulesets_name_unique_idx").using("btree", table.name.asc().nullsLast()),
    index("rulesets_user_id_private_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.private.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [table.id],
      name: "rulesets_ruleset_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "rulesets_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const charactersInCharacter = character.table(
  "characters",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    rulesetId: uuid("ruleset_id").notNull(),
    kind: text().notNull(),
    parentCharacterId: uuid("parent_character_id"),
    name: text().notNull(),
    description: text(),
    notes: text(),
    privateNotes: text("private_notes"),
    shareToken: text("share_token"),
    lastChangedAt: timestamp("last_changed_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "characters_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "characters_ruleset_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parentCharacterId],
      foreignColumns: [table.id],
      name: "characters_parent_character_id_fkey",
    }).onDelete("cascade"),
    index("characters_parent_character_id_idx")
      .using("btree", table.parentCharacterId.asc().nullsLast())
      .where(sql`(parent_character_id IS NOT NULL)`),
    uniqueIndex("characters_share_token_unique_idx")
      .using("btree", table.shareToken.asc().nullsLast())
      .where(sql`(share_token IS NOT NULL)`),
    uniqueIndex("characters_one_live_child_per_kind_idx")
      .using("btree", table.parentCharacterId.asc().nullsLast(), table.kind.asc().nullsLast())
      .where(sql`((deleted_at IS NULL) AND (parent_character_id IS NOT NULL))`),
    check("characters_no_self_parent_check", sql`id <> parent_character_id`),
  ],
);

export const campaign = pgSchema("campaign");

export const campaignsInCampaign = campaign.table(
  "campaigns",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    rulesetId: uuid("ruleset_id").notNull(),
    name: text().notNull(),
    description: text(),
  },
  (table) => [
    index("campaigns_ruleset_id_name_idx").using(
      "btree",
      table.rulesetId.asc().nullsLast(),
      table.name.asc().nullsLast().op("text_pattern_ops"),
    ),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "campaigns_ruleset_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const entityTypesInRules = rules.table(
  "entity_types",
  {
    type: text().primaryKey().notNull(),
    ownerType: text("owner_type"),
    owned: boolean().generatedAlwaysAs(sql`(owner_type IS NOT NULL)`),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerType],
      foreignColumns: [table.type],
      name: "entity_types_owner_type_fkey",
    }),
    unique("entity_types_type_owner_type_key").on(table.type, table.ownerType),
    unique("entity_types_type_owned_key").on(table.type, table.owned),
  ],
);

export const entitiesInRules = rules.table(
  "entities",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    rulesetId: uuid("ruleset_id").notNull(),
    campaignId: uuid("campaign_id"),
    campaignKey: uuid("campaign_key").generatedAlwaysAs(
      sql`COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    type: text().notNull(),
    name: text(),
    description: text(),
    ownerId: uuid("owner_id"),
    ownerType: text("owner_type"),
    owned: boolean().generatedAlwaysAs(sql`(owner_id IS NOT NULL)`),
    position: integer(),
    partition: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("entities_campaign_idx")
      .using("btree", table.campaignId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(campaign_id IS NOT NULL)`),
    uniqueIndex("entities_owner_position_unique_idx")
      .using("btree", table.ownerId.asc().nullsLast().op("uuid_ops"), table.position.asc().nullsLast().op("int4_ops"))
      .where(sql`(owner_id IS NOT NULL)`),
    index("entities_ruleset_type_campaign_idx").using(
      "btree",
      table.rulesetId.asc().nullsLast().op("uuid_ops"),
      table.type.asc().nullsLast().op("uuid_ops"),
      table.campaignId.asc().nullsLast().op("text_ops"),
    ),
    index("entities_search_idx").using(
      "gin",
      table.name.asc().nullsLast().op("gin_trgm_ops"),
      table.description.asc().nullsLast().op("gin_trgm_ops"),
    ),
    uniqueIndex("entities_with_campaign_unique_idx")
      .using(
        "btree",
        table.rulesetId.asc().nullsLast().op("text_ops"),
        table.campaignId.asc().nullsLast().op("uuid_ops"),
        table.type.asc().nullsLast().op("uuid_ops"),
        table.partition.asc().nullsLast().op("uuid_ops"),
        table.name.asc().nullsLast().op("uuid_ops"),
      )
      .where(sql`((campaign_id IS NOT NULL) AND (name IS NOT NULL))`),
    uniqueIndex("entities_without_campaign_unique_idx")
      .using(
        "btree",
        table.rulesetId.asc().nullsLast().op("text_ops"),
        table.type.asc().nullsLast().op("uuid_ops"),
        table.partition.asc().nullsLast().op("uuid_ops"),
        table.name.asc().nullsLast().op("uuid_ops"),
      )
      .where(sql`((campaign_id IS NULL) AND (name IS NOT NULL))`),
    foreignKey({
      columns: [table.campaignId],
      foreignColumns: [campaignsInCampaign.id],
      name: "entities_campaign_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ownerId, table.ownerType],
      foreignColumns: [table.id, table.type],
      name: "entities_owner_id_owner_type_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.rulesetId, table.campaignKey, table.ownerId],
      foreignColumns: [table.id, table.rulesetId, table.campaignKey],
      name: "entities_owner_id_ruleset_id_campaign_key_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "entities_ruleset_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.type, table.owned],
      foreignColumns: [entityTypesInRules.type, entityTypesInRules.owned],
      name: "entities_type_owned_fkey",
    }),
    foreignKey({
      columns: [table.type, table.ownerType],
      foreignColumns: [entityTypesInRules.type, entityTypesInRules.ownerType],
      name: "entities_type_owner_type_fkey",
    }),
    unique("entities_id_type_key").on(table.id, table.type),
    unique("entities_id_ruleset_id_campaign_key_key").on(table.id, table.rulesetId, table.campaignKey),
    check("entities_check", sql`(name IS NOT NULL) OR ((owner_id IS NOT NULL) AND ("position" IS NOT NULL))`),
  ],
);

export const advancementsInCharacter = character.table(
  "advancements",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    characterId: uuid("character_id").notNull(),
    position: integer().notNull(),
    trackId: uuid("track_id"),
    trackType: text("track_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("advancements_character_position_idx")
      .using(
        "btree",
        table.characterId.asc().nullsLast().op("int4_ops"),
        table.position.asc().nullsLast().op("int4_ops"),
      )
      .where(sql`(deleted_at IS NULL)`),
    uniqueIndex("advancements_character_track_idx").using(
      "btree",
      table.characterId.asc().nullsLast().op("uuid_ops"),
      table.trackId.asc().nullsLast().op("uuid_ops"),
    ),
    index("advancements_track_idx")
      .using("btree", table.trackId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(track_id IS NOT NULL)`),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [charactersInCharacter.id],
      name: "advancements_character_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.trackId, table.trackType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "advancements_track_id_track_type_fkey",
    }),
    check("advancements_position_check", sql`"position" > 0`),
  ],
);

export const stepsInCharacter = character.table(
  "steps",
  {
    step: text().primaryKey().notNull(),
    entityType: text("entity_type"),
    viaType: text("via_type"),
    hasEntity: boolean("has_entity").generatedAlwaysAs(sql`(entity_type IS NOT NULL)`),
    hasVia: boolean("has_via").generatedAlwaysAs(sql`(via_type IS NOT NULL)`),
    onDelete: text("on_delete").notNull(),
    repeats: boolean().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.entityType],
      foreignColumns: [entityTypesInRules.type],
      name: "steps_entity_type_fkey",
    }),
    foreignKey({
      columns: [table.viaType],
      foreignColumns: [entityTypesInRules.type],
      name: "steps_via_type_fkey",
    }),
    unique("steps_step_has_entity_has_via_key").on(table.step, table.hasEntity, table.hasVia),
    unique("steps_step_repeats_key").on(table.step, table.repeats),
    unique("steps_step_entity_type_key").on(table.step, table.entityType),
    unique("steps_step_via_type_key").on(table.step, table.viaType),
    check("steps_on_delete_check", sql`on_delete = ANY (ARRAY['refuse'::text, 'delete'::text])`),
  ],
);

export const advancementPicksInCharacter = character.table(
  "advancement_picks",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    advancementId: uuid("advancement_id").notNull(),
    step: text().notNull(),
    entityId: uuid("entity_id"),
    entityType: text("entity_type"),
    viaId: uuid("via_id"),
    viaType: text("via_type"),
    hasEntity: boolean("has_entity").generatedAlwaysAs(sql`(entity_id IS NOT NULL)`),
    hasVia: boolean("has_via").generatedAlwaysAs(sql`(via_id IS NOT NULL)`),
    entityKey: uuid("entity_key").generatedAlwaysAs(
      sql`COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    amount: integer(),
    ordinal: smallint().default(0).notNull(),
    repeats: boolean().notNull(),
    tier: integer(),
    parentPickId: uuid("parent_pick_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("advancement_picks_entity_idx")
      .using("btree", table.entityId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(entity_id IS NOT NULL)`),
    index("advancement_picks_parent_idx")
      .using("btree", table.parentPickId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(parent_pick_id IS NOT NULL)`),
    uniqueIndex("advancement_picks_unique_idx").using(
      "btree",
      table.advancementId.asc().nullsLast().op("uuid_ops"),
      table.step.asc().nullsLast().op("uuid_ops"),
      table.entityKey.asc().nullsLast().op("uuid_ops"),
      table.ordinal.asc().nullsLast().op("uuid_ops"),
    ),
    index("advancement_picks_via_idx")
      .using("btree", table.viaId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(via_id IS NOT NULL)`),
    foreignKey({
      columns: [table.advancementId],
      foreignColumns: [advancementsInCharacter.id],
      name: "advancement_picks_advancement_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.entityId, table.entityType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "advancement_picks_entity_id_entity_type_fkey",
    }),
    foreignKey({
      columns: [table.parentPickId],
      foreignColumns: [table.id],
      name: "advancement_picks_parent_pick_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.step, table.entityType],
      foreignColumns: [stepsInCharacter.step, stepsInCharacter.entityType],
      name: "advancement_picks_step_entity_type_fkey",
    }),
    foreignKey({
      columns: [table.step, table.hasEntity, table.hasVia],
      foreignColumns: [stepsInCharacter.step, stepsInCharacter.hasEntity, stepsInCharacter.hasVia],
      name: "advancement_picks_step_has_entity_has_via_fkey",
    }),
    foreignKey({
      columns: [table.step, table.repeats],
      foreignColumns: [stepsInCharacter.step, stepsInCharacter.repeats],
      name: "advancement_picks_step_repeats_fkey",
    }).onUpdate("cascade"),
    foreignKey({
      columns: [table.step, table.viaType],
      foreignColumns: [stepsInCharacter.step, stepsInCharacter.viaType],
      name: "advancement_picks_step_via_type_fkey",
    }),
    foreignKey({
      columns: [table.viaId, table.viaType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "advancement_picks_via_id_via_type_fkey",
    }),
    check("advancement_picks_check", sql`repeats OR (ordinal = 0)`),
    check("advancement_picks_ordinal_check", sql`ordinal >= 0`),
  ],
);

export const storage = pgSchema("storage");

export const blobsInStorage = storage.table(
  "blobs",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    key: text().notNull(),
    filename: text().notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    metadata: json().default({}).notNull(),
    attachedAt: timestamp("attached_at", { mode: "string", withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blobs_key_unique_idx").using("btree", table.key.asc().nullsLast()),
    index("blobs_pending_idx")
      .using("btree", table.createdAt.asc().nullsLast())
      .where(sql`(attached_at IS NULL)`),
    index("blobs_attached_idx")
      .using("btree", table.createdAt.asc().nullsLast())
      .where(sql`(attached_at IS NOT NULL)`),
  ],
);

export const attachmentsInStorage = storage.table(
  "attachments",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    name: text().notNull(),
    blobId: uuid("blob_id").notNull(),
  },
  (table) => [
    uniqueIndex("attachments_record_name_unique_idx").using(
      "btree",
      table.recordType.asc().nullsLast(),
      table.recordId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("attachments_record_idx").using(
      "btree",
      table.recordType.asc().nullsLast(),
      table.recordId.asc().nullsLast(),
    ),
    index("attachments_blob_id_idx").using("btree", table.blobId.asc().nullsLast()),
    foreignKey({
      columns: [table.blobId],
      foreignColumns: [blobsInStorage.id],
      name: "attachments_blob_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const characterRolesInCharacter = character.table(
  "character_roles",
  {
    role: text().primaryKey().notNull(),
    entityType: text("entity_type").notNull(),
    single: boolean().notNull(),
    onDelete: text("on_delete").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.entityType],
      foreignColumns: [entityTypesInRules.type],
      name: "character_roles_entity_type_fkey",
    }),
    unique("character_roles_role_entity_type_single_key").on(table.role, table.entityType, table.single),
    check("character_roles_on_delete_check", sql`on_delete = ANY (ARRAY['refuse'::text, 'delete'::text])`),
  ],
);

export const contentPackagesInRules = rules.table("content_packages", {
  name: text().primaryKey().notNull(),
  type: text().notNull(),
  version: integer().notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contributorRole = pgEnum("contributor_role", ["Admin", "Editor", "Viewer"]);

export const contributorsInCharacter = character.table(
  "character_contributors",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    characterId: uuid("character_id").notNull(),
    userId: uuid("user_id"),
    email: text().notNull(),
    role: contributorRole().notNull().default("Editor"),
    status: text().notNull().default("Pending"),
    invitedBy: uuid("invited_by").notNull(),
  },
  (table) => [
    index("character_contributors_character_status_idx").using(
      "btree",
      table.characterId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("character_contributors_user_status_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    uniqueIndex("character_contributors_character_user_unique")
      .using("btree", table.characterId.asc().nullsLast(), table.userId.asc().nullsLast())
      .where(sql`status IN ('Pending', 'Active') AND deleted_at IS NULL`),
    uniqueIndex("character_contributors_character_email_unique")
      .using("btree", table.characterId.asc().nullsLast(), table.email.asc().nullsLast())
      .where(sql`user_id IS NULL AND status IN ('Pending', 'Active') AND deleted_at IS NULL`),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [charactersInCharacter.id],
      name: "character_contributors_character_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "character_contributors_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invitedBy],
      foreignColumns: [usersInAccount.id],
      name: "character_contributors_invited_by_fk",
    }).onDelete("cascade"),
    check("character_contributors_status_check", sql`status = ANY (ARRAY['Pending', 'Active', 'Rejected', 'Revoked'])`),
    check("character_contributors_email_or_user", sql`(user_id IS NOT NULL) OR (email IS NOT NULL)`),
  ],
);

export const contributorsInRules = rules.table(
  "contributors",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    rulesetId: uuid("ruleset_id").notNull(),
    userId: uuid("user_id"),
    email: text().notNull(),
    role: contributorRole().notNull().default("Editor"),
    status: text().notNull().default("Pending"),
    invitedBy: uuid("invited_by").notNull(),
  },
  (table) => [
    index("contributors_ruleset_status_idx").using(
      "btree",
      table.rulesetId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("contributors_user_status_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    uniqueIndex("contributors_ruleset_user_unique")
      .using("btree", table.rulesetId.asc().nullsLast(), table.userId.asc().nullsLast())
      .where(sql`status IN ('Pending', 'Active') AND deleted_at IS NULL`),
    uniqueIndex("contributors_ruleset_email_unique")
      .using("btree", table.rulesetId.asc().nullsLast(), table.email.asc().nullsLast())
      .where(sql`user_id IS NULL AND status IN ('Pending', 'Active') AND deleted_at IS NULL`),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "contributors_ruleset_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "contributors_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invitedBy],
      foreignColumns: [usersInAccount.id],
      name: "contributors_invited_by_fk",
    }).onDelete("cascade"),
    check("contributors_status_check", sql`status = ANY (ARRAY['Pending', 'Active', 'Rejected', 'Revoked'])`),
    check("contributors_email_or_user", sql`(user_id IS NOT NULL) OR (email IS NOT NULL)`),
  ],
);

export const customization = pgSchema("customization");

export const emailVerificationsInAccount = account.table(
  "email_verifications",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    code: text().notNull(),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => [
    index("email_verifications_user_id").using("btree", table.userId.asc().nullsLast()),
    index("email_verifications_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "email_verifications_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const fieldDefsInRules = rules.table(
  "field_defs",
  {
    ownerKind: text("owner_kind").notNull(),
    ownerType: text("owner_type").notNull(),
    entityType: text("entity_type").generatedAlwaysAs(sql`
CASE
    WHEN (owner_kind = 'entity'::text) THEN owner_type
    ELSE NULL::text
END`),
    field: text().notNull(),
    valueKind: text("value_kind").notNull(),
    multiple: boolean().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.entityType],
      foreignColumns: [entityTypesInRules.type],
      name: "field_defs_entity_type_fkey",
    }),
    primaryKey({ columns: [table.ownerType, table.field], name: "field_defs_pkey" }),
    unique("field_defs_owner_type_field_value_kind_multiple_key").on(
      table.ownerType,
      table.field,
      table.valueKind,
      table.multiple,
    ),
    check(
      "field_defs_check",
      sql`((owner_kind = 'ruleset'::text) = (owner_type = 'rulesets'::text)) AND ((owner_kind = 'character'::text) = (owner_type = 'characters'::text))`,
    ),
    check(
      "field_defs_owner_kind_check",
      sql`owner_kind = ANY (ARRAY['entity'::text, 'ruleset'::text, 'character'::text])`,
    ),
    check("field_defs_value_kind_check", sql`value_kind = ANY (ARRAY['text'::text, 'number'::text, 'flag'::text])`),
  ],
);

export const entityFieldsInRules = rules.table(
  "entity_fields",
  {
    entityId: uuid("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    field: text().notNull(),
    ordinal: smallint().default(0).notNull(),
    valueKind: text("value_kind").notNull(),
    multiple: boolean().notNull(),
    textValue: text("text_value"),
    numberValue: numeric("number_value"),
    flagValue: boolean("flag_value"),
    valueKey: text("value_key").generatedAlwaysAs(
      sql`COALESCE(md5(text_value), (trim_scale(number_value))::text, (flag_value)::text)`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("entity_fields_set_value_idx")
      .using(
        "btree",
        table.entityId.asc().nullsLast().op("text_ops"),
        table.field.asc().nullsLast().op("text_ops"),
        table.valueKey.asc().nullsLast().op("text_ops"),
      )
      .where(sql`multiple`),
    index("entity_fields_field_idx").using(
      "btree",
      table.field.asc().nullsLast().op("text_ops"),
      table.entityId.asc().nullsLast().op("uuid_ops"),
    ),
    index("entity_fields_text_idx").using("hash", table.textValue.asc().nullsLast().op("text_ops")),
    foreignKey({
      columns: [table.entityId, table.entityType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "entity_fields_entity_id_entity_type_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.entityType, table.field, table.valueKind, table.multiple],
      foreignColumns: [
        fieldDefsInRules.ownerType,
        fieldDefsInRules.field,
        fieldDefsInRules.valueKind,
        fieldDefsInRules.multiple,
      ],
      name: "entity_fields_entity_type_field_value_kind_multiple_fkey",
    }).onUpdate("cascade"),
    primaryKey({ columns: [table.entityId, table.field, table.ordinal], name: "entity_fields_pkey" }),
    check("entity_fields_check", sql`multiple OR (ordinal = 0)`),
    check(
      "entity_fields_check1",
      sql`((text_value IS NOT NULL) = (value_kind = 'text'::text)) AND ((number_value IS NOT NULL) = (value_kind = 'number'::text)) AND ((flag_value IS NOT NULL) = (value_kind = 'flag'::text))`,
    ),
    check(
      "entity_fields_number_value_check",
      sql`number_value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])`,
    ),
    check("entity_fields_ordinal_check", sql`ordinal >= 0`),
  ],
);

export const linkRoleKindsInRules = rules.table(
  "link_role_kinds",
  {
    role: text().notNull(),
    fromType: text("from_type").notNull(),
    single: boolean().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fromType],
      foreignColumns: [entityTypesInRules.type],
      name: "link_role_kinds_from_type_fkey",
    }),
    primaryKey({ columns: [table.role, table.fromType], name: "link_role_kinds_pkey" }),
    unique("link_role_kinds_role_from_type_single_key").on(table.role, table.fromType, table.single),
  ],
);

export const linkRolesInRules = rules.table(
  "link_roles",
  {
    role: text().notNull(),
    fromType: text("from_type").notNull(),
    toType: text("to_type").notNull(),
    viaType: text("via_type"),
    hasVia: boolean("has_via").generatedAlwaysAs(sql`(via_type IS NOT NULL)`),
    single: boolean().notNull(),
    onDelete: text("on_delete").notNull(),
    viaOnDelete: text("via_on_delete").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fromType],
      foreignColumns: [entityTypesInRules.type],
      name: "link_roles_from_type_fkey",
    }),
    foreignKey({
      columns: [table.role, table.fromType, table.single],
      foreignColumns: [linkRoleKindsInRules.role, linkRoleKindsInRules.fromType, linkRoleKindsInRules.single],
      name: "link_roles_role_from_type_single_fkey",
    }).onUpdate("cascade"),
    foreignKey({
      columns: [table.toType],
      foreignColumns: [entityTypesInRules.type],
      name: "link_roles_to_type_fkey",
    }),
    foreignKey({
      columns: [table.viaType],
      foreignColumns: [entityTypesInRules.type],
      name: "link_roles_via_type_fkey",
    }),
    primaryKey({ columns: [table.role, table.fromType, table.toType], name: "link_roles_pkey" }),
    unique("link_roles_role_from_type_to_type_single_key").on(table.role, table.fromType, table.toType, table.single),
    unique("link_roles_role_from_type_to_type_has_via_key").on(table.role, table.fromType, table.toType, table.hasVia),
    unique("link_roles_role_from_type_to_type_via_type_key").on(
      table.role,
      table.fromType,
      table.toType,
      table.viaType,
    ),
    check("link_roles_on_delete_check", sql`on_delete = ANY (ARRAY['refuse'::text, 'unlink'::text, 'delete'::text])`),
    check("link_roles_via_on_delete_check", sql`via_on_delete = ANY (ARRAY['refuse'::text, 'unlink'::text])`),
  ],
);

export const entityLinksInRules = rules.table(
  "entity_links",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fromId: uuid("from_id").notNull(),
    fromType: text("from_type").notNull(),
    role: text().notNull(),
    single: boolean().notNull(),
    toId: uuid("to_id").notNull(),
    toType: text("to_type").notNull(),
    viaId: uuid("via_id"),
    viaType: text("via_type"),
    hasVia: boolean("has_via").generatedAlwaysAs(sql`(via_id IS NOT NULL)`),
    tier: integer(),
    amount: integer(),
    free: boolean().default(false).notNull(),
    ordinal: integer().default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("entity_links_single_idx")
      .using("btree", table.fromId.asc().nullsLast().op("uuid_ops"), table.role.asc().nullsLast().op("text_ops"))
      .where(sql`single`),
    index("entity_links_to_idx").using(
      "btree",
      table.toId.asc().nullsLast().op("text_ops"),
      table.role.asc().nullsLast().op("text_ops"),
    ),
    index("entity_links_via_idx")
      .using("btree", table.viaId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(via_id IS NOT NULL)`),
    foreignKey({
      columns: [table.fromId, table.fromType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "entity_links_from_id_from_type_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fromType, table.role, table.toType, table.hasVia],
      foreignColumns: [
        linkRolesInRules.role,
        linkRolesInRules.fromType,
        linkRolesInRules.toType,
        linkRolesInRules.hasVia,
      ],
      name: "entity_links_role_from_type_to_type_has_via_fkey",
    }),
    foreignKey({
      columns: [table.fromType, table.role, table.single, table.toType],
      foreignColumns: [
        linkRolesInRules.role,
        linkRolesInRules.fromType,
        linkRolesInRules.toType,
        linkRolesInRules.single,
      ],
      name: "entity_links_role_from_type_to_type_single_fkey",
    }).onUpdate("cascade"),
    foreignKey({
      columns: [table.fromType, table.role, table.toType, table.viaType],
      foreignColumns: [
        linkRolesInRules.role,
        linkRolesInRules.fromType,
        linkRolesInRules.toType,
        linkRolesInRules.viaType,
      ],
      name: "entity_links_role_from_type_to_type_via_type_fkey",
    }).onUpdate("cascade"),
    foreignKey({
      columns: [table.toId, table.toType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "entity_links_to_id_to_type_fkey",
    }),
    foreignKey({
      columns: [table.viaId, table.viaType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "entity_links_via_id_via_type_fkey",
    }),
    unique("entity_links_from_id_role_to_id_key").on(table.fromId, table.role, table.toId),
    check("entity_links_ordinal_check", sql`ordinal >= 0`),
  ],
);

export const entitySnapshotsInRules = rules.table(
  "entity_snapshots",
  {
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    rulesetId: uuid("ruleset_id").notNull(),
    entityType: text("entity_type").notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    forkedEntityId: uuid("forked_entity_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("entity_snapshots_ruleset_id_entity_type").using(
      "btree",
      table.rulesetId.asc().nullsLast(),
      table.entityType.asc().nullsLast(),
    ),
    index("entity_snapshots_ruleset_type_source").using(
      "btree",
      table.rulesetId.asc().nullsLast(),
      table.entityType.asc().nullsLast(),
      table.sourceEntityId.asc().nullsLast(),
    ),
    unique("entity_snapshots_ruleset_type_source_unique").on(table.rulesetId, table.entityType, table.sourceEntityId),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "entity_snapshots_ruleset_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const exportsInAccount = account.table(
  "exports",
  {
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    userId: uuid("user_id").notNull(),
    type: text().notNull(),
    mimeType: text("mime_type").notNull(),
    fileName: text("file_name").notNull(),
    data: bytea("data").notNull(),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => [
    index("exports_user_id_idx").using("btree", table.userId.asc().nullsLast()),
    index("exports_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "exports_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const fieldsInCharacter = character.table(
  "fields",
  {
    characterId: uuid("character_id").notNull(),
    ownerType: text("owner_type").default("characters").notNull(),
    field: text().notNull(),
    ordinal: smallint().default(0).notNull(),
    valueKind: text("value_kind").notNull(),
    multiple: boolean().notNull(),
    textValue: text("text_value"),
    numberValue: numeric("number_value"),
    flagValue: boolean("flag_value"),
    valueKey: text("value_key").generatedAlwaysAs(
      sql`COALESCE(md5(text_value), (trim_scale(number_value))::text, (flag_value)::text)`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("fields_set_value_idx")
      .using(
        "btree",
        table.characterId.asc().nullsLast().op("text_ops"),
        table.field.asc().nullsLast().op("text_ops"),
        table.valueKey.asc().nullsLast().op("text_ops"),
      )
      .where(sql`multiple`),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [charactersInCharacter.id],
      name: "fields_character_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ownerType, table.field, table.valueKind, table.multiple],
      foreignColumns: [
        fieldDefsInRules.ownerType,
        fieldDefsInRules.field,
        fieldDefsInRules.valueKind,
        fieldDefsInRules.multiple,
      ],
      name: "fields_owner_type_field_value_kind_multiple_fkey",
    }).onUpdate("cascade"),
    primaryKey({ columns: [table.characterId, table.field, table.ordinal], name: "fields_pkey" }),
    check("fields_check", sql`multiple OR (ordinal = 0)`),
    check(
      "fields_check1",
      sql`((text_value IS NOT NULL) = (value_kind = 'text'::text)) AND ((number_value IS NOT NULL) = (value_kind = 'number'::text)) AND ((flag_value IS NOT NULL) = (value_kind = 'flag'::text))`,
    ),
    check(
      "fields_number_value_check",
      sql`number_value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])`,
    ),
    check("fields_ordinal_check", sql`ordinal >= 0`),
    check("fields_owner_type_check", sql`owner_type = 'characters'::text`),
  ],
);

export const itemTypesInCharacter = character.table(
  "item_types",
  {
    entityType: text("entity_type").primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.entityType],
      foreignColumns: [entityTypesInRules.type],
      name: "item_types_entity_type_fkey",
    }),
  ],
);

export const inventoryInCharacter = character.table(
  "inventory",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    characterId: uuid("character_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: integer().notNull(),
    totalCharges: integer("total_charges"),
    remainingCharges: integer("remaining_charges"),
    equipped: boolean().default(false).notNull(),
    itemType: text("item_type").notNull(),
    location: text(),
    groups: smallint().array().default([]).notNull(),
  },
  (table) => [
    index("character_inventory_character_id").using("btree", table.characterId.asc().nullsLast()),
    index("character_inventory_item_id").using("btree", table.itemId.asc().nullsLast()),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [charactersInCharacter.id],
      name: "inventory_character_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.itemId, table.itemType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "inventory_item_entity_fkey",
    }),
    foreignKey({
      columns: [table.itemType],
      foreignColumns: [itemTypesInCharacter.entityType],
      name: "inventory_item_type_fkey",
    }),
    check("inventory_quantity_check", sql`quantity > 0`),
    check(
      "inventory_check",
      sql`(total_charges IS NULL) OR ((total_charges >= 0) AND (remaining_charges IS NOT NULL))`,
    ),
    check(
      "inventory_check1",
      sql`(remaining_charges IS NULL) OR ((remaining_charges >= 0) AND (total_charges IS NOT NULL))`,
    ),
  ],
);

export const role = pgEnum("role", ["Game Master", "Player Character"]);

export const playersInCampaign = campaign.table(
  "players",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id"),
    campaignId: uuid("campaign_id").notNull(),
    role: role().notNull(),
  },
  (table) => [
    index("players_campaign_id").using("btree", table.campaignId.asc().nullsLast()),
    index("players_user_id").using("btree", table.userId.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "players_user_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.campaignId],
      foreignColumns: [campaignsInCampaign.id],
      name: "players_campaign_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const invitesInCampaign = campaign.table(
  "invites",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id"),
    email: text(),
    playerId: uuid("player_id").notNull(),
    status: text().default("Pending").notNull(),
  },
  (table) => [
    index("invites_email_status_idx").using("btree", table.email.asc().nullsLast(), table.status.asc().nullsLast()),
    index("invites_player_id_status_idx").using(
      "btree",
      table.playerId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("invites_user_id_player_id_status_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.playerId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("invites_user_id_status_idx").using("btree", table.userId.asc().nullsLast(), table.status.asc().nullsLast()),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [playersInCampaign.id],
      name: "invites_player_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "invites_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "invites_status_check",
      sql`status = ANY (ARRAY['Pending'::text, 'Accepted'::text, 'Rejected'::text, 'Expired'::text, 'Revoked'::text])`,
    ),
    check("invites_user_or_email_check", sql`(user_id IS NOT NULL) OR (email IS NOT NULL)`),
  ],
);

export const linksInCharacter = character.table(
  "links",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    characterId: uuid("character_id").notNull(),
    role: text().notNull(),
    single: boolean().notNull(),
    entityId: uuid("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    amount: integer(),
    ordinal: smallint().default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("links_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
    uniqueIndex("links_single_idx")
      .using("btree", table.characterId.asc().nullsLast().op("text_ops"), table.role.asc().nullsLast().op("text_ops"))
      .where(sql`single`),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [charactersInCharacter.id],
      name: "links_character_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.entityId, table.entityType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "links_entity_id_entity_type_fkey",
    }),
    foreignKey({
      columns: [table.role, table.single, table.entityType],
      foreignColumns: [
        characterRolesInCharacter.role,
        characterRolesInCharacter.entityType,
        characterRolesInCharacter.single,
      ],
      name: "links_role_entity_type_single_fkey",
    }).onUpdate("cascade"),
    unique("links_character_id_role_entity_id_ordinal_key").on(
      table.characterId,
      table.role,
      table.entityId,
      table.ordinal,
    ),
    check("links_ordinal_check", sql`ordinal >= 0`),
  ],
);

export const modifiersInCustomization = customization.table(
  "modifiers",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceType: text("source_type").notNull(),
    target: text().notNull(),
    value: text().notNull(),
    valueType: text("value_type").notNull(),
    operator: text().notNull(),
  },
  (table) => [
    index("modifiers_source_idx").using("btree", table.sourceId.asc().nullsLast(), table.sourceType.asc().nullsLast()),
    check("modifiers_value_type_check", sql`value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])`),
    check(
      "modifiers_operator_check",
      sql`operator = ANY (ARRAY['add'::text, 'subtract'::text, 'multiply'::text, 'divide'::text, 'set'::text])`,
    ),
  ],
);

export const notificationsInAccount = account.table(
  "notifications",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    recipientId: uuid("recipient_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    activityId: uuid("activity_id"),
    type: text().notNull(),
    targetId: uuid("target_id").notNull(),
    targetTable: text("target_table").notNull(),
    data: json(),
    readAt: timestamp("read_at", { mode: "string", withTimezone: true }),
  },
  (table) => [
    index("notifications_recipient_unread_idx")
      .using("btree", table.recipientId.asc().nullsLast(), table.createdAt.desc().nullsLast())
      .where(sql`read_at IS NULL`),
    index("notifications_recipient_id_created_at_idx").using(
      "btree",
      table.recipientId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("notifications_activity_id_idx").using("btree", table.activityId.asc().nullsLast()),
    index("notifications_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
    foreignKey({
      columns: [table.recipientId],
      foreignColumns: [usersInAccount.id],
      name: "notifications_recipient_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [usersInAccount.id],
      name: "notifications_actor_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.activityId],
      foreignColumns: [activitiesInAccount.id],
      name: "notifications_activity_id_fkey",
    }).onDelete("set null"),
  ],
);

export const oauthAccountsInAccount = account.table(
  "oauth_accounts",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    provider: text().notNull(),
    providerAccountId: text("provider_account_id").notNull(),
  },
  (table) => [
    index("oauth_accounts_user_id").using("btree", table.userId.asc().nullsLast()),
    uniqueIndex("oauth_accounts_provider_provider_account_id")
      .using("btree", table.provider.asc().nullsLast(), table.providerAccountId.asc().nullsLast())
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "oauth_accounts_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const passwordResetsInAccount = account.table(
  "password_resets",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    code: text().notNull(),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => [
    index("password_resets_user_id").using("btree", table.userId.asc().nullsLast()),
    index("password_resets_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "password_resets_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const playerCharactersInCampaign = campaign.table(
  "player_characters",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    playerId: uuid("player_id").notNull(),
    characterId: uuid("character_id").notNull(),
    visibility: text().default("Private").notNull(),
  },
  (table) => [
    index("player_characters_player_id_character_id_idx").using(
      "btree",
      table.playerId.asc().nullsLast(),
      table.characterId.asc().nullsLast(),
    ),
    uniqueIndex("player_characters_character_id_active_idx")
      .using("btree", table.characterId.asc().nullsLast())
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [playersInCampaign.id],
      name: "player_characters_player_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [charactersInCharacter.id],
      name: "player_characters_character_id_fkey",
    }).onDelete("cascade"),
    check(
      "player_characters_visibility_check",
      sql`visibility = ANY (ARRAY['Private'::text, 'Public'::text, 'Partial'::text])`,
    ),
  ],
);

export const requirementsInCustomization = customization.table(
  "requirements",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    entityId: uuid("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    level: text().notNull(),
    target: text(),
    value: text(),
    valueType: text("value_type"),
    operator: text(),
    chainingOperator: text("chaining_operator"),
  },
  (table) => [
    index("requirements_entity_id_idx").using("btree", table.entityId.asc().nullsLast()),
    index("requirements_entity_type_idx").using("btree", table.entityType.asc().nullsLast()),
    unique("requirements_entity_id_entity_type_level_key").on(table.entityId, table.entityType, table.level),
    check(
      "requirements_value_type_check",
      sql`value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])`,
    ),
    check(
      "requirements_operator_check",
      sql`operator = ANY (ARRAY['equal'::text, 'not_equal'::text, 'greater_than'::text, 'less_than'::text, 'greater_than_or_equal'::text, 'less_than_or_equal'::text, 'contains'::text, 'not_contains'::text, 'starts_with'::text, 'ends_with'::text, 'matches_regex'::text, 'not_matches_regex'::text, 'is_empty'::text, 'not_empty'::text])`,
    ),
    check(
      "requirements_check",
      sql`(chaining_operator = ANY (ARRAY['and'::text, 'or'::text])) AND (((chaining_operator IS NULL) AND (operator IS NOT NULL) AND (value IS NOT NULL) AND (value_type IS NOT NULL) AND (target IS NOT NULL)) OR ((chaining_operator IS NOT NULL) AND (operator IS NULL) AND (value IS NULL) AND (value_type IS NULL) AND (target IS NULL)))`,
    ),
  ],
);

export const rulesetExtensionsInRules = rules.table(
  "ruleset_extensions",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    rulesetId: uuid("ruleset_id").notNull(),
    extensionId: uuid("extension_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "ruleset_extensions_ruleset_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.extensionId],
      foreignColumns: [rulesetsInRules.id],
      name: "ruleset_extensions_extension_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.rulesetId, table.extensionId], name: "ruleset_extensions_pkey" }),
  ],
);

export const rulesetFieldsInRules = rules.table(
  "ruleset_fields",
  {
    rulesetId: uuid("ruleset_id").notNull(),
    ownerType: text("owner_type").default("rulesets").notNull(),
    field: text().notNull(),
    ordinal: smallint().default(0).notNull(),
    valueKind: text("value_kind").notNull(),
    multiple: boolean().notNull(),
    textValue: text("text_value"),
    numberValue: numeric("number_value"),
    flagValue: boolean("flag_value"),
    valueKey: text("value_key").generatedAlwaysAs(
      sql`COALESCE(md5(text_value), (trim_scale(number_value))::text, (flag_value)::text)`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ruleset_fields_set_value_idx")
      .using(
        "btree",
        table.rulesetId.asc().nullsLast().op("text_ops"),
        table.field.asc().nullsLast().op("text_ops"),
        table.valueKey.asc().nullsLast().op("text_ops"),
      )
      .where(sql`multiple`),
    foreignKey({
      columns: [table.ownerType, table.field, table.valueKind, table.multiple],
      foreignColumns: [
        fieldDefsInRules.ownerType,
        fieldDefsInRules.field,
        fieldDefsInRules.valueKind,
        fieldDefsInRules.multiple,
      ],
      name: "ruleset_fields_owner_type_field_value_kind_multiple_fkey",
    }).onUpdate("cascade"),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "ruleset_fields_ruleset_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.rulesetId, table.field, table.ordinal], name: "ruleset_fields_pkey" }),
    check("ruleset_fields_check", sql`multiple OR (ordinal = 0)`),
    check(
      "ruleset_fields_check1",
      sql`((text_value IS NOT NULL) = (value_kind = 'text'::text)) AND ((number_value IS NOT NULL) = (value_kind = 'number'::text)) AND ((flag_value IS NOT NULL) = (value_kind = 'flag'::text))`,
    ),
    check(
      "ruleset_fields_number_value_check",
      sql`number_value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])`,
    ),
    check("ruleset_fields_ordinal_check", sql`ordinal >= 0`),
    check("ruleset_fields_owner_type_check", sql`owner_type = 'rulesets'::text`),
  ],
);

export const rulesetRolesInRules = rules.table(
  "ruleset_roles",
  {
    role: text().primaryKey().notNull(),
    toType: text("to_type").notNull(),
    onDelete: text("on_delete").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.toType],
      foreignColumns: [entityTypesInRules.type],
      name: "ruleset_roles_to_type_fkey",
    }),
    unique("ruleset_roles_role_to_type_key").on(table.role, table.toType),
    check("ruleset_roles_on_delete_check", sql`on_delete = ANY (ARRAY['refuse'::text, 'unlink'::text])`),
  ],
);

export const rulesetLinksInRules = rules.table(
  "ruleset_links",
  {
    rulesetId: uuid("ruleset_id").notNull(),
    role: text().notNull(),
    toId: uuid("to_id").notNull(),
    toType: text("to_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("ruleset_links_to_idx").using("btree", table.toId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.role, table.toType],
      foreignColumns: [rulesetRolesInRules.role, rulesetRolesInRules.toType],
      name: "ruleset_links_role_to_type_fkey",
    }),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "ruleset_links_ruleset_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.toId, table.toType],
      foreignColumns: [entitiesInRules.id, entitiesInRules.type],
      name: "ruleset_links_to_id_to_type_fkey",
    }),
    primaryKey({ columns: [table.rulesetId, table.role], name: "ruleset_links_pkey" }),
  ],
);

export const sessionsInAccount = account.table(
  "sessions",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    id: uuid()
      .default(sql`public.gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => [
    index("sessions_user_id").using("btree", table.userId.asc().nullsLast()),
    index("sessions_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "sessions_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const starredRulesetsInAccount = account.table(
  "starred_rulesets",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
    userId: uuid("user_id").notNull(),
    rulesetId: uuid("ruleset_id").notNull(),
  },
  (table) => [
    index("starred_rulesets_user_id").using("btree", table.userId.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInAccount.id],
      name: "starred_rulesets_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.rulesetId],
      foreignColumns: [rulesetsInRules.id],
      name: "starred_rulesets_ruleset_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.userId, table.rulesetId], name: "starred_rulesets_pkey" }),
  ],
);
