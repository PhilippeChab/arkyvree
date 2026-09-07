import type {
  abilitiesInRules,
  activitiesInAccount,
  aptitudesInRules,
  campaignsInCampaign,
  characterAbilitiesInCharacter,
  charactersInCharacter,
  contributorsInRules,
  emailVerificationsInAccount,
  entitySnapshotsInRules,
  oauthAccountsInAccount,
  passwordResetsInAccount,
  featsInRules,
  featsAptitudesInRules,
  inventoryInCharacter,
  invitesInCampaign,
  itemsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelSavesInRules,
  klassLevelsInRules,
  klassSkillsInRules,
  languagesInCharacter,
  languagesInRules,
  mechanicsInRules,
  levelFeatsInCharacter,
  levelsInCharacter,
  levelSkillsInCharacter,
  levelPowersInCharacter,
  modifiersInCustomization,
  playerCharactersInCampaign,
  playersInCampaign,
  propertiesInCustomization,
  racesInRules,
  requirementsInCustomization,
  rulesetsInRules,
  savesInRules,
  sessionsInAccount,
  skillsInRules,
  powersInRules,
  powersAptitudesInRules,
  klassLevelPowersInRules,
  usersInAccount,
} from "@/drizzle/schema.ts";

export type User = typeof usersInAccount.$inferSelect;
export type Session = typeof sessionsInAccount.$inferSelect;
export type Activity = typeof activitiesInAccount.$inferSelect;
export type Character = typeof charactersInCharacter.$inferSelect;
export type CharacterLevel = typeof levelsInCharacter.$inferSelect;
export type CharacterLevelSkill = typeof levelSkillsInCharacter.$inferSelect;
export type CharacterLevelPower = typeof levelPowersInCharacter.$inferSelect;
export type CharacterLevelFeat = typeof levelFeatsInCharacter.$inferSelect;
export type CharacterInventory = typeof inventoryInCharacter.$inferSelect;
export type CharacterLanguage = typeof languagesInCharacter.$inferSelect;
export type Campaign = typeof campaignsInCampaign.$inferSelect;
export type Player = typeof playersInCampaign.$inferSelect;
export type Skill = typeof skillsInRules.$inferSelect;
export type Power = typeof powersInRules.$inferSelect;
export type PowerAptitude = typeof powersAptitudesInRules.$inferSelect;
export type PowerWithAptitudes = Power & {
  powersAptitudesInRules: (PowerAptitude & { aptitudesInRule: Aptitude })[];
};
export type KlassLevelPower = typeof klassLevelPowersInRules.$inferSelect;
export type Feat = typeof featsInRules.$inferSelect;
export type FeatAptitude = typeof featsAptitudesInRules.$inferSelect;
export type FeatWithAptitudes = Feat & {
  featsAptitudesInRules: (FeatAptitude & { aptitudesInRule: Aptitude })[];
};
export type Klass = typeof klassesInRules.$inferSelect;
export type KlassLevel = typeof klassLevelsInRules.$inferSelect;
export type KlassLevelFeat = typeof klassLevelFeatsInRules.$inferSelect;
export type KlassSkill = typeof klassSkillsInRules.$inferSelect;
export type Language = typeof languagesInRules.$inferSelect;
export type Race = typeof racesInRules.$inferSelect;
export type Item = typeof itemsInRules.$inferSelect;
export type Mechanic = typeof mechanicsInRules.$inferSelect;
export type Property = typeof propertiesInCustomization.$inferSelect;
export type Requirement = typeof requirementsInCustomization.$inferSelect;
export type Modifier = typeof modifiersInCustomization.$inferSelect;
export type Ruleset = typeof rulesetsInRules.$inferSelect;
export type Aptitude = typeof aptitudesInRules.$inferSelect;
export type Invite = typeof invitesInCampaign.$inferSelect;
export type PlayerCharacter = typeof playerCharactersInCampaign.$inferSelect;
export type RulesetAbility = typeof abilitiesInRules.$inferSelect;
export type RulesetSave = typeof savesInRules.$inferSelect;
export type KlassLevelSave = typeof klassLevelSavesInRules.$inferSelect;
export type CharacterAbility = typeof characterAbilitiesInCharacter.$inferSelect;
export type EmailVerification = typeof emailVerificationsInAccount.$inferSelect;
export type PasswordReset = typeof passwordResetsInAccount.$inferSelect;
export type EntitySnapshot = typeof entitySnapshotsInRules.$inferSelect;
export type Contributor = typeof contributorsInRules.$inferSelect;
export type OauthAccount = typeof oauthAccountsInAccount.$inferSelect;
