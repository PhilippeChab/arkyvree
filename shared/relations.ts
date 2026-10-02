import type {
  abilitiesInRules,
  aptitudesInRules,
  campaignsInCampaign,
  charactersInCharacter,
  featsAptitudesInRules,
  featsInRules,
  inventoryInCharacter,
  invitesInCampaign,
  itemsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelPowersInRules,
  klassLevelSavesInRules,
  klassLevelsInRules,
  klassSkillsInRules,
  languagesInRules,
  levelsInCharacter,
  mechanicsInRules,
  modifiersInCustomization,
  playersInCampaign,
  powersAptitudesInRules,
  powersInRules,
  propertiesInCustomization,
  racesInRules,
  requirementsInCustomization,
  rulesetsInRules,
  savesInRules,
  sessionsInAccount,
  skillsInRules,
  usersInAccount,
} from "@/drizzle/schema.ts";

export type User = typeof usersInAccount.$inferSelect;
export type Session = typeof sessionsInAccount.$inferSelect;
export type Character = typeof charactersInCharacter.$inferSelect;
export type CharacterLevel = typeof levelsInCharacter.$inferSelect;
export type CharacterInventory = typeof inventoryInCharacter.$inferSelect;
export type Campaign = typeof campaignsInCampaign.$inferSelect;
export type Player = typeof playersInCampaign.$inferSelect;
export type Skill = typeof skillsInRules.$inferSelect;
export type Power = typeof powersInRules.$inferSelect;
type PowerAptitude = typeof powersAptitudesInRules.$inferSelect;
export type PowerWithAptitudes = Power & {
  powersAptitudesInRules: (PowerAptitude & { aptitudesInRule: Aptitude })[];
};
export type KlassLevelPower = typeof klassLevelPowersInRules.$inferSelect;
export type Feat = typeof featsInRules.$inferSelect;
type FeatAptitude = typeof featsAptitudesInRules.$inferSelect;
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
export type RulesetAbility = typeof abilitiesInRules.$inferSelect;
export type RulesetSave = typeof savesInRules.$inferSelect;
export type KlassLevelSave = typeof klassLevelSavesInRules.$inferSelect;
