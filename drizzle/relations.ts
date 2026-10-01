import { relations } from "drizzle-orm/relations";
import { rulesetsInRules, campaignsInCampaign, aptitudesInRules, usersInAccount, activitiesInAccount, abilitiesInRules, itemsInRules, klassesInRules, klassLevelsInRules, playersInCampaign, invitesInCampaign, charactersInCharacter, racesInRules, featsInRules, levelsInCharacter, playerCharactersInCampaign, languagesInRules, sessionsInAccount, savesInRules, skillsInRules, powersInRules, powersAptitudesInRules, klassLevelPowersInRules, klassSkillsInRules, featsAptitudesInRules, languagesInCharacter, characterAbilitiesInCharacter, klassLevelSavesInRules, klassLevelFeatsInRules, levelPowersInCharacter, levelSkillsInCharacter, levelFeatsInCharacter, inventoryInCharacter, starredRulesetsInAccount, emailVerificationsInAccount, passwordResetsInAccount, entitySnapshotsInRules, rulesetExtensionsInRules, contributorsInRules, contributorsInCharacter, oauthAccountsInAccount, notificationsInAccount } from "./schema";

export const campaignsInCampaignRelations = relations(campaignsInCampaign, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [campaignsInCampaign.rulesetId],
		references: [rulesetsInRules.id]
	}),
	aptitudesInRules: many(aptitudesInRules),
	abilitiesInRules: many(abilitiesInRules),
	itemsInRules: many(itemsInRules),
	klassesInRules: many(klassesInRules),
	featsInRules: many(featsInRules),
	playersInCampaigns: many(playersInCampaign),
	languagesInRules: many(languagesInRules),
	racesInRules: many(racesInRules),
	savesInRules: many(savesInRules),
	skillsInRules: many(skillsInRules),
	powersInRules: many(powersInRules),
}));

export const rulesetsInRulesRelations = relations(rulesetsInRules, ({one, many}) => ({
	campaignsInCampaigns: many(campaignsInCampaign),
	aptitudesInRules: many(aptitudesInRules),
	abilitiesInRules: many(abilitiesInRules),
	itemsInRules: many(itemsInRules),
	klassesInRules: many(klassesInRules),
	charactersInCharacters: many(charactersInCharacter),
	featsInRules: many(featsInRules),
	languagesInRules: many(languagesInRules),
	racesInRules: many(racesInRules),
	savesInRules: many(savesInRules),
	rulesetsInRule: one(rulesetsInRules, {
		fields: [rulesetsInRules.rulesetId],
		references: [rulesetsInRules.id],
		relationName: "rulesetsInRules_rulesetId_rulesetsInRules_id"
	}),
	rulesetsInRules: many(rulesetsInRules, {
		relationName: "rulesetsInRules_rulesetId_rulesetsInRules_id"
	}),
	usersInAccount: one(usersInAccount, {
		fields: [rulesetsInRules.userId],
		references: [usersInAccount.id]
	}),
	skillsInRules: many(skillsInRules),
	powersInRules: many(powersInRules),
	starredRulesetsInAccounts: many(starredRulesetsInAccount),
	entitySnapshotsInRules: many(entitySnapshotsInRules),
	rulesetExtensionsAsTarget: many(rulesetExtensionsInRules, {
		relationName: "rulesetExtensions_rulesetId_rulesets_id"
	}),
	rulesetExtensionsAsExtension: many(rulesetExtensionsInRules, {
		relationName: "rulesetExtensions_extensionId_rulesets_id"
	}),
	contributorsInRules: many(contributorsInRules),
}));

export const aptitudesInRulesRelations = relations(aptitudesInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [aptitudesInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [aptitudesInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	featsAptitudesInRules: many(featsAptitudesInRules),
	powersAptitudesInRules: many(powersAptitudesInRules),
	klassLevelFeatsInRules: many(klassLevelFeatsInRules),
	klassLevelPowersInRules: many(klassLevelPowersInRules),
	levelFeatsInCharacters: many(levelFeatsInCharacter),
	levelPowersInCharacters: many(levelPowersInCharacter),
}));

export const activitiesInAccountRelations = relations(activitiesInAccount, ({one}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [activitiesInAccount.userId],
		references: [usersInAccount.id]
	}),
}));

export const usersInAccountRelations = relations(usersInAccount, ({many}) => ({
	activitiesInAccounts: many(activitiesInAccount),
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

export const notificationsInAccountRelations = relations(notificationsInAccount, ({one}) => ({
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

export const emailVerificationsInAccountRelations = relations(emailVerificationsInAccount, ({one}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [emailVerificationsInAccount.userId],
		references: [usersInAccount.id]
	}),
}));

export const passwordResetsInAccountRelations = relations(passwordResetsInAccount, ({one}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [passwordResetsInAccount.userId],
		references: [usersInAccount.id]
	}),
}));

export const abilitiesInRulesRelations = relations(abilitiesInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [abilitiesInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [abilitiesInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	levelsInCharacters: many(levelsInCharacter),
	savesInRules: many(savesInRules),
	skillsInRules: many(skillsInRules),
	characterAbilitiesInCharacters: many(characterAbilitiesInCharacter),
}));

export const itemsInRulesRelations = relations(itemsInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [itemsInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [itemsInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	inventoryInCharacters: many(inventoryInCharacter),
}));

export const klassLevelsInRulesRelations = relations(klassLevelsInRules, ({one, many}) => ({
	klassesInRule: one(klassesInRules, {
		fields: [klassLevelsInRules.klassId],
		references: [klassesInRules.id]
	}),
	levelsInCharacters: many(levelsInCharacter),
	klassLevelSavesInRules: many(klassLevelSavesInRules),
	klassLevelFeatsInRules: many(klassLevelFeatsInRules),
	klassLevelPowersInRules: many(klassLevelPowersInRules),
}));

export const klassesInRulesRelations = relations(klassesInRules, ({one, many}) => ({
	klassLevelsInRules: many(klassLevelsInRules),
	rulesetsInRule: one(rulesetsInRules, {
		fields: [klassesInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [klassesInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	klassSkillsInRules: many(klassSkillsInRules),
}));

export const invitesInCampaignRelations = relations(invitesInCampaign, ({one}) => ({
	playersInCampaign: one(playersInCampaign, {
		fields: [invitesInCampaign.playerId],
		references: [playersInCampaign.id]
	}),
	usersInAccount: one(usersInAccount, {
		fields: [invitesInCampaign.userId],
		references: [usersInAccount.id]
	}),
}));

export const playersInCampaignRelations = relations(playersInCampaign, ({one, many}) => ({
	invitesInCampaigns: many(invitesInCampaign),
	playerCharactersInCampaigns: many(playerCharactersInCampaign),
	usersInAccount: one(usersInAccount, {
		fields: [playersInCampaign.userId],
		references: [usersInAccount.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [playersInCampaign.campaignId],
		references: [campaignsInCampaign.id]
	}),
}));

export const charactersInCharacterRelations = relations(charactersInCharacter, ({one, many}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [charactersInCharacter.userId],
		references: [usersInAccount.id]
	}),
	rulesetsInRule: one(rulesetsInRules, {
		fields: [charactersInCharacter.rulesetId],
		references: [rulesetsInRules.id]
	}),
	racesInRule: one(racesInRules, {
		fields: [charactersInCharacter.raceId],
		references: [racesInRules.id]
	}),
	parentCharacter: one(charactersInCharacter, {
		fields: [charactersInCharacter.parentCharacterId],
		references: [charactersInCharacter.id],
		relationName: "character_parent_child"
	}),
	childCharacters: many(charactersInCharacter, { relationName: "character_parent_child" }),
	levelsInCharacters: many(levelsInCharacter),
	playerCharactersInCampaigns: many(playerCharactersInCampaign),
	languagesInCharacters: many(languagesInCharacter),
	characterAbilitiesInCharacters: many(characterAbilitiesInCharacter),
	inventoryInCharacters: many(inventoryInCharacter),
	contributorsInCharacters: many(contributorsInCharacter),
}));

export const contributorsInCharacterRelations = relations(contributorsInCharacter, ({one}) => ({
	charactersInCharacter: one(charactersInCharacter, {
		fields: [contributorsInCharacter.characterId],
		references: [charactersInCharacter.id]
	}),
	usersInAccount: one(usersInAccount, {
		fields: [contributorsInCharacter.userId],
		references: [usersInAccount.id]
	}),
	invitedByUser: one(usersInAccount, {
		fields: [contributorsInCharacter.invitedBy],
		references: [usersInAccount.id],
		relationName: "character_contributors_invitedBy_users_id"
	}),
}));

export const racesInRulesRelations = relations(racesInRules, ({one, many}) => ({
	charactersInCharacters: many(charactersInCharacter),
	rulesetsInRule: one(rulesetsInRules, {
		fields: [racesInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [racesInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
}));

export const featsInRulesRelations = relations(featsInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [featsInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [featsInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	featsAptitudesInRules: many(featsAptitudesInRules),
	klassLevelFeatsInRules: many(klassLevelFeatsInRules),
	levelFeatsInCharacters: many(levelFeatsInCharacter),
}));

export const levelsInCharacterRelations = relations(levelsInCharacter, ({one, many}) => ({
	charactersInCharacter: one(charactersInCharacter, {
		fields: [levelsInCharacter.characterId],
		references: [charactersInCharacter.id]
	}),
	klassLevelsInRule: one(klassLevelsInRules, {
		fields: [levelsInCharacter.klassLevelId],
		references: [klassLevelsInRules.id]
	}),
	abilitiesInRule: one(abilitiesInRules, {
		fields: [levelsInCharacter.abilityId],
		references: [abilitiesInRules.id]
	}),
	levelPowersInCharacters: many(levelPowersInCharacter),
	levelSkillsInCharacters: many(levelSkillsInCharacter),
	levelFeatsInCharacters: many(levelFeatsInCharacter),
}));

export const playerCharactersInCampaignRelations = relations(playerCharactersInCampaign, ({one}) => ({
	playersInCampaign: one(playersInCampaign, {
		fields: [playerCharactersInCampaign.playerId],
		references: [playersInCampaign.id]
	}),
	charactersInCharacter: one(charactersInCharacter, {
		fields: [playerCharactersInCampaign.characterId],
		references: [charactersInCharacter.id]
	}),
}));

export const languagesInRulesRelations = relations(languagesInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [languagesInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [languagesInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	languagesInCharacters: many(languagesInCharacter),
}));

export const sessionsInAccountRelations = relations(sessionsInAccount, ({one}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [sessionsInAccount.userId],
		references: [usersInAccount.id]
	}),
}));

export const savesInRulesRelations = relations(savesInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [savesInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [savesInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	abilitiesInRule: one(abilitiesInRules, {
		fields: [savesInRules.abilityId],
		references: [abilitiesInRules.id]
	}),
	klassLevelSavesInRules: many(klassLevelSavesInRules),
	powersInRules: many(powersInRules),
}));

export const skillsInRulesRelations = relations(skillsInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [skillsInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [skillsInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	abilitiesInRule: one(abilitiesInRules, {
		fields: [skillsInRules.primaryAbilityId],
		references: [abilitiesInRules.id]
	}),
	klassSkillsInRules: many(klassSkillsInRules),
	levelSkillsInCharacters: many(levelSkillsInCharacter),
}));

export const powersInRulesRelations = relations(powersInRules, ({one, many}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [powersInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	campaignsInCampaign: one(campaignsInCampaign, {
		fields: [powersInRules.campaignId],
		references: [campaignsInCampaign.id]
	}),
	savesInRule: one(savesInRules, {
		fields: [powersInRules.saveId],
		references: [savesInRules.id]
	}),
	powersAptitudesInRules: many(powersAptitudesInRules),
	klassLevelPowersInRules: many(klassLevelPowersInRules),
	levelPowersInCharacters: many(levelPowersInCharacter),
}));

export const powersAptitudesInRulesRelations = relations(powersAptitudesInRules, ({one}) => ({
	powersInRule: one(powersInRules, {
		fields: [powersAptitudesInRules.powerId],
		references: [powersInRules.id]
	}),
	aptitudesInRule: one(aptitudesInRules, {
		fields: [powersAptitudesInRules.aptitudeId],
		references: [aptitudesInRules.id]
	}),
}));

export const klassLevelPowersInRulesRelations = relations(klassLevelPowersInRules, ({one}) => ({
	klassLevelsInRule: one(klassLevelsInRules, {
		fields: [klassLevelPowersInRules.klassLevelId],
		references: [klassLevelsInRules.id]
	}),
	powersInRule: one(powersInRules, {
		fields: [klassLevelPowersInRules.powerId],
		references: [powersInRules.id]
	}),
	aptitudesInRule: one(aptitudesInRules, {
		fields: [klassLevelPowersInRules.aptitudeId],
		references: [aptitudesInRules.id]
	}),
}));

export const klassSkillsInRulesRelations = relations(klassSkillsInRules, ({one}) => ({
	klassesInRule: one(klassesInRules, {
		fields: [klassSkillsInRules.klassId],
		references: [klassesInRules.id]
	}),
	skillsInRule: one(skillsInRules, {
		fields: [klassSkillsInRules.skillId],
		references: [skillsInRules.id]
	}),
}));

export const featsAptitudesInRulesRelations = relations(featsAptitudesInRules, ({one}) => ({
	featsInRule: one(featsInRules, {
		fields: [featsAptitudesInRules.featId],
		references: [featsInRules.id]
	}),
	aptitudesInRule: one(aptitudesInRules, {
		fields: [featsAptitudesInRules.aptitudeId],
		references: [aptitudesInRules.id]
	}),
}));

export const languagesInCharacterRelations = relations(languagesInCharacter, ({one}) => ({
	charactersInCharacter: one(charactersInCharacter, {
		fields: [languagesInCharacter.characterId],
		references: [charactersInCharacter.id]
	}),
	languagesInRule: one(languagesInRules, {
		fields: [languagesInCharacter.languageId],
		references: [languagesInRules.id]
	}),
}));

export const characterAbilitiesInCharacterRelations = relations(characterAbilitiesInCharacter, ({one}) => ({
	charactersInCharacter: one(charactersInCharacter, {
		fields: [characterAbilitiesInCharacter.characterId],
		references: [charactersInCharacter.id]
	}),
	abilitiesInRule: one(abilitiesInRules, {
		fields: [characterAbilitiesInCharacter.abilityId],
		references: [abilitiesInRules.id]
	}),
}));

export const klassLevelSavesInRulesRelations = relations(klassLevelSavesInRules, ({one}) => ({
	klassLevelsInRule: one(klassLevelsInRules, {
		fields: [klassLevelSavesInRules.klassLevelId],
		references: [klassLevelsInRules.id]
	}),
	savesInRule: one(savesInRules, {
		fields: [klassLevelSavesInRules.saveId],
		references: [savesInRules.id]
	}),
}));

export const klassLevelFeatsInRulesRelations = relations(klassLevelFeatsInRules, ({one}) => ({
	klassLevelsInRule: one(klassLevelsInRules, {
		fields: [klassLevelFeatsInRules.klassLevelId],
		references: [klassLevelsInRules.id]
	}),
	featsInRule: one(featsInRules, {
		fields: [klassLevelFeatsInRules.featId],
		references: [featsInRules.id]
	}),
	aptitudesInRule: one(aptitudesInRules, {
		fields: [klassLevelFeatsInRules.aptitudeId],
		references: [aptitudesInRules.id]
	}),
}));

export const levelPowersInCharacterRelations = relations(levelPowersInCharacter, ({one}) => ({
	levelsInCharacter: one(levelsInCharacter, {
		fields: [levelPowersInCharacter.characterLevelId],
		references: [levelsInCharacter.id]
	}),
	powersInRule: one(powersInRules, {
		fields: [levelPowersInCharacter.powerId],
		references: [powersInRules.id]
	}),
	aptitudesInRule: one(aptitudesInRules, {
		fields: [levelPowersInCharacter.aptitudeId],
		references: [aptitudesInRules.id]
	}),
}));

export const levelSkillsInCharacterRelations = relations(levelSkillsInCharacter, ({one}) => ({
	levelsInCharacter: one(levelsInCharacter, {
		fields: [levelSkillsInCharacter.characterLevelId],
		references: [levelsInCharacter.id]
	}),
	skillsInRule: one(skillsInRules, {
		fields: [levelSkillsInCharacter.skillId],
		references: [skillsInRules.id]
	}),
}));

export const levelFeatsInCharacterRelations = relations(levelFeatsInCharacter, ({one}) => ({
	levelsInCharacter: one(levelsInCharacter, {
		fields: [levelFeatsInCharacter.characterLevelId],
		references: [levelsInCharacter.id]
	}),
	featsInRule: one(featsInRules, {
		fields: [levelFeatsInCharacter.featId],
		references: [featsInRules.id]
	}),
	aptitudesInRule: one(aptitudesInRules, {
		fields: [levelFeatsInCharacter.aptitudeId],
		references: [aptitudesInRules.id]
	}),
}));

export const inventoryInCharacterRelations = relations(inventoryInCharacter, ({one}) => ({
	charactersInCharacter: one(charactersInCharacter, {
		fields: [inventoryInCharacter.characterId],
		references: [charactersInCharacter.id]
	}),
	itemsInRule: one(itemsInRules, {
		fields: [inventoryInCharacter.itemId],
		references: [itemsInRules.id]
	}),
}));

export const entitySnapshotsInRulesRelations = relations(entitySnapshotsInRules, ({one}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [entitySnapshotsInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
}));

export const starredRulesetsInAccountRelations = relations(starredRulesetsInAccount, ({one}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [starredRulesetsInAccount.userId],
		references: [usersInAccount.id]
	}),
	rulesetsInRule: one(rulesetsInRules, {
		fields: [starredRulesetsInAccount.rulesetId],
		references: [rulesetsInRules.id]
	}),
}));

export const rulesetExtensionsInRulesRelations = relations(rulesetExtensionsInRules, ({one}) => ({
	ruleset: one(rulesetsInRules, {
		fields: [rulesetExtensionsInRules.rulesetId],
		references: [rulesetsInRules.id],
		relationName: "rulesetExtensions_rulesetId_rulesets_id"
	}),
	extension: one(rulesetsInRules, {
		fields: [rulesetExtensionsInRules.extensionId],
		references: [rulesetsInRules.id],
		relationName: "rulesetExtensions_extensionId_rulesets_id"
	}),
}));

export const contributorsInRulesRelations = relations(contributorsInRules, ({one}) => ({
	rulesetsInRule: one(rulesetsInRules, {
		fields: [contributorsInRules.rulesetId],
		references: [rulesetsInRules.id]
	}),
	usersInAccount: one(usersInAccount, {
		fields: [contributorsInRules.userId],
		references: [usersInAccount.id]
	}),
	invitedByUser: one(usersInAccount, {
		fields: [contributorsInRules.invitedBy],
		references: [usersInAccount.id],
		relationName: "contributors_invitedBy_users_id"
	}),
}));

export const oauthAccountsInAccountRelations = relations(oauthAccountsInAccount, ({one}) => ({
	usersInAccount: one(usersInAccount, {
		fields: [oauthAccountsInAccount.userId],
		references: [usersInAccount.id]
	}),
}));