import { relations } from "drizzle-orm/relations";

import {
  activitiesInAccount,
  apiKeysInAccount,
  campaignsInCampaign,
  charactersInCharacter,
  contributorsInCharacter,
  contributorsInRules,
  emailVerificationsInAccount,
  entitySnapshotsInRules,
  inventoryInCharacter,
  invitesInCampaign,
  notificationsInAccount,
  oauthAccountsInAccount,
  passwordResetsInAccount,
  playerCharactersInCampaign,
  playersInCampaign,
  rulesetExtensionsInRules,
  rulesetsInRules,
  sessionsInAccount,
  starredRulesetsInAccount,
  usersInAccount,
} from "./schema";

export const activitiesInAccountRelations = relations(activitiesInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [activitiesInAccount.userId],
    references: [usersInAccount.id],
  }),
}));

export const apiKeysInAccountRelations = relations(apiKeysInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [apiKeysInAccount.userId],
    references: [usersInAccount.id],
  }),
}));

export const campaignsInCampaignRelations = relations(campaignsInCampaign, ({ one, many }) => ({
  rulesetsInRule: one(rulesetsInRules, {
    fields: [campaignsInCampaign.rulesetId],
    references: [rulesetsInRules.id],
  }),
  playersInCampaigns: many(playersInCampaign),
}));

export const charactersInCharacterRelations = relations(charactersInCharacter, ({ one, many }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [charactersInCharacter.userId],
    references: [usersInAccount.id],
  }),
  rulesetsInRule: one(rulesetsInRules, {
    fields: [charactersInCharacter.rulesetId],
    references: [rulesetsInRules.id],
  }),
  parentCharacter: one(charactersInCharacter, {
    fields: [charactersInCharacter.parentCharacterId],
    references: [charactersInCharacter.id],
    relationName: "character_parent_child",
  }),
  childCharacters: many(charactersInCharacter, { relationName: "character_parent_child" }),
  playerCharactersInCampaigns: many(playerCharactersInCampaign),
  inventoryInCharacters: many(inventoryInCharacter),
  contributorsInCharacters: many(contributorsInCharacter),
}));

export const contributorsInCharacterRelations = relations(contributorsInCharacter, ({ one }) => ({
  charactersInCharacter: one(charactersInCharacter, {
    fields: [contributorsInCharacter.characterId],
    references: [charactersInCharacter.id],
  }),
  usersInAccount: one(usersInAccount, {
    fields: [contributorsInCharacter.userId],
    references: [usersInAccount.id],
  }),
  invitedByUser: one(usersInAccount, {
    fields: [contributorsInCharacter.invitedBy],
    references: [usersInAccount.id],
    relationName: "character_contributors_invitedBy_users_id",
  }),
}));

export const contributorsInRulesRelations = relations(contributorsInRules, ({ one }) => ({
  rulesetsInRule: one(rulesetsInRules, {
    fields: [contributorsInRules.rulesetId],
    references: [rulesetsInRules.id],
  }),
  usersInAccount: one(usersInAccount, {
    fields: [contributorsInRules.userId],
    references: [usersInAccount.id],
  }),
  invitedByUser: one(usersInAccount, {
    fields: [contributorsInRules.invitedBy],
    references: [usersInAccount.id],
    relationName: "contributors_invitedBy_users_id",
  }),
}));

export const emailVerificationsInAccountRelations = relations(emailVerificationsInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [emailVerificationsInAccount.userId],
    references: [usersInAccount.id],
  }),
}));

export const entitySnapshotsInRulesRelations = relations(entitySnapshotsInRules, ({ one }) => ({
  rulesetsInRule: one(rulesetsInRules, {
    fields: [entitySnapshotsInRules.rulesetId],
    references: [rulesetsInRules.id],
  }),
}));

export const inventoryInCharacterRelations = relations(inventoryInCharacter, ({ one }) => ({
  charactersInCharacter: one(charactersInCharacter, {
    fields: [inventoryInCharacter.characterId],
    references: [charactersInCharacter.id],
  }),
}));

export const invitesInCampaignRelations = relations(invitesInCampaign, ({ one }) => ({
  playersInCampaign: one(playersInCampaign, {
    fields: [invitesInCampaign.playerId],
    references: [playersInCampaign.id],
  }),
  usersInAccount: one(usersInAccount, {
    fields: [invitesInCampaign.userId],
    references: [usersInAccount.id],
  }),
}));

export const notificationsInAccountRelations = relations(notificationsInAccount, ({ one }) => ({
  recipient: one(usersInAccount, {
    fields: [notificationsInAccount.recipientId],
    references: [usersInAccount.id],
    relationName: "notifications_recipientId_users_id",
  }),
  actor: one(usersInAccount, {
    fields: [notificationsInAccount.actorId],
    references: [usersInAccount.id],
    relationName: "notifications_actorId_users_id",
  }),
  activity: one(activitiesInAccount, {
    fields: [notificationsInAccount.activityId],
    references: [activitiesInAccount.id],
  }),
}));

export const oauthAccountsInAccountRelations = relations(oauthAccountsInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [oauthAccountsInAccount.userId],
    references: [usersInAccount.id],
  }),
}));

export const passwordResetsInAccountRelations = relations(passwordResetsInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [passwordResetsInAccount.userId],
    references: [usersInAccount.id],
  }),
}));

export const playerCharactersInCampaignRelations = relations(playerCharactersInCampaign, ({ one }) => ({
  playersInCampaign: one(playersInCampaign, {
    fields: [playerCharactersInCampaign.playerId],
    references: [playersInCampaign.id],
  }),
  charactersInCharacter: one(charactersInCharacter, {
    fields: [playerCharactersInCampaign.characterId],
    references: [charactersInCharacter.id],
  }),
}));

export const playersInCampaignRelations = relations(playersInCampaign, ({ one, many }) => ({
  invitesInCampaigns: many(invitesInCampaign),
  playerCharactersInCampaigns: many(playerCharactersInCampaign),
  usersInAccount: one(usersInAccount, {
    fields: [playersInCampaign.userId],
    references: [usersInAccount.id],
  }),
  campaignsInCampaign: one(campaignsInCampaign, {
    fields: [playersInCampaign.campaignId],
    references: [campaignsInCampaign.id],
  }),
}));

export const rulesetExtensionsInRulesRelations = relations(rulesetExtensionsInRules, ({ one }) => ({
  ruleset: one(rulesetsInRules, {
    fields: [rulesetExtensionsInRules.rulesetId],
    references: [rulesetsInRules.id],
    relationName: "rulesetExtensions_rulesetId_rulesets_id",
  }),
  extension: one(rulesetsInRules, {
    fields: [rulesetExtensionsInRules.extensionId],
    references: [rulesetsInRules.id],
    relationName: "rulesetExtensions_extensionId_rulesets_id",
  }),
}));

export const rulesetsInRulesRelations = relations(rulesetsInRules, ({ one, many }) => ({
  campaignsInCampaigns: many(campaignsInCampaign),
  charactersInCharacters: many(charactersInCharacter),
  rulesetsInRule: one(rulesetsInRules, {
    fields: [rulesetsInRules.rulesetId],
    references: [rulesetsInRules.id],
    relationName: "rulesetsInRules_rulesetId_rulesetsInRules_id",
  }),
  rulesetsInRules: many(rulesetsInRules, {
    relationName: "rulesetsInRules_rulesetId_rulesetsInRules_id",
  }),
  usersInAccount: one(usersInAccount, {
    fields: [rulesetsInRules.userId],
    references: [usersInAccount.id],
  }),
  starredRulesetsInAccounts: many(starredRulesetsInAccount),
  entitySnapshotsInRules: many(entitySnapshotsInRules),
  rulesetExtensionsAsTarget: many(rulesetExtensionsInRules, {
    relationName: "rulesetExtensions_rulesetId_rulesets_id",
  }),
  rulesetExtensionsAsExtension: many(rulesetExtensionsInRules, {
    relationName: "rulesetExtensions_extensionId_rulesets_id",
  }),
  contributorsInRules: many(contributorsInRules),
}));

export const sessionsInAccountRelations = relations(sessionsInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [sessionsInAccount.userId],
    references: [usersInAccount.id],
  }),
}));

export const starredRulesetsInAccountRelations = relations(starredRulesetsInAccount, ({ one }) => ({
  usersInAccount: one(usersInAccount, {
    fields: [starredRulesetsInAccount.userId],
    references: [usersInAccount.id],
  }),
  rulesetsInRule: one(rulesetsInRules, {
    fields: [starredRulesetsInAccount.rulesetId],
    references: [rulesetsInRules.id],
  }),
}));

export const usersInAccountRelations = relations(usersInAccount, ({ many }) => ({
  activitiesInAccounts: many(activitiesInAccount),
  apiKeysInAccounts: many(apiKeysInAccount),
  notificationsReceived: many(notificationsInAccount, { relationName: "notifications_recipientId_users_id" }),
  notificationsActed: many(notificationsInAccount, { relationName: "notifications_actorId_users_id" }),
  invitesInCampaigns: many(invitesInCampaign),
  charactersInCharacters: many(charactersInCharacter),
  playersInCampaigns: many(playersInCampaign),
  sessionsInAccounts: many(sessionsInAccount),
  rulesetsInRules: many(rulesetsInRules),
  starredRulesetsInAccounts: many(starredRulesetsInAccount),
  emailVerificationsInAccounts: many(emailVerificationsInAccount),
  passwordResetsInAccounts: many(passwordResetsInAccount),
  contributorsInRules: many(contributorsInRules),
  contributorsInCharacters: many(contributorsInCharacter),
  oauthAccountsInAccounts: many(oauthAccountsInAccount),
}));
