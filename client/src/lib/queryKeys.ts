export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
    linkedAccounts: ["auth", "linkedAccounts"] as const,
  },
  rulesets: {
    all: ["rulesets"] as const,
    lists: ["rulesets", "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["rulesets", "list", filters] as const,
    detail: (id: string) =>
      ["rulesets", "detail", id] as const,
    section: (id: string, section: string) =>
      ["rulesets", "detail", id, section] as const,
    classDetail: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId] as const,
    classLevels: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "levels"] as const,
    classSkills: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "skills"] as const,
    classSpells: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "spells"] as const,
    classSpellsKnown: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "spellsKnown"] as const,
    classSpellList: (id: string, classId: string, level?: number, search?: string) =>
      ["rulesets", "detail", id, "class", classId, "spellList", level, search] as const,
    classFeatPools: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "featPools"] as const,
    sectionGrouped: (id: string, section: string) =>
      ["rulesets", "detail", id, section, "grouped"] as const,
    familyVariants: (id: string, family: string) =>
      ["rulesets", "detail", id, "feats", "family", family] as const,
    entity: (id: string, entityType: string, entityId: string) =>
      ["rulesets", "detail", id, "entity", entityType, entityId] as const,
    targetCompletions: (id: string, prefix: string, kind: string, search: string, entityType?: string) =>
      ["rulesets", "detail", id, "targetCompletions", prefix, kind, search, entityType] as const,
    changes: (id: string) =>
      ["rulesets", "detail", id, "changes"] as const,
    languages: (id: string) =>
      ["rulesets", "detail", id, "languages"] as const,
  },
  campaigns: {
    all: ["campaigns"] as const,
    lists: ["campaigns", "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["campaigns", "list", filters] as const,
    detail: (id: string) =>
      ["campaigns", "detail", id] as const,
    section: (id: string, section: string) =>
      ["campaigns", "detail", id, section] as const,
    characterDetail: (campaignId: string, characterId: string) =>
      ["campaigns", "detail", campaignId, "character", characterId] as const,
  },
  characters: {
    all: ["characters"] as const,
    lists: ["characters", "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["characters", "list", filters] as const,
    detail: (id: string) =>
      ["characters", "detail", id] as const,
    contributors: (id: string) =>
      ["characters", "detail", id, "contributors"] as const,
    inventory: (id: string) =>
      ["characters", "detail", id, "inventory"] as const,
    unlinked: (campaignId: string, filters?: Record<string, unknown>) =>
      filters
        ? (["characters", "unlinked", campaignId, filters] as const)
        : (["characters", "unlinked", campaignId] as const),
    availableRaces: (rulesetId: string, filters?: Record<string, unknown>) =>
      ["characters", "availableRaces", rulesetId, filters] as const,
    rulesetItem: (rulesetId: string, itemId: string) =>
      ["characters", "rulesetItem", rulesetId, itemId] as const,
    itemSearch: (rulesetId: string, search: string) =>
      ["characters", "itemSearch", rulesetId, search] as const,
    levelUp: {
      all: (characterId: string) =>
        ["characters", "levelUp", characterId] as const,
      availableClasses: (characterId: string, search?: string, pendingKlassLevelIds?: string, pendingAbilityIds?: string, pendingFeatPicks?: string, pendingSkillAllocations?: string) =>
        ["characters", "levelUp", characterId, "availableClasses", search, pendingKlassLevelIds, pendingAbilityIds, pendingFeatPicks, pendingSkillAllocations] as const,
      attributes: (characterId: string, editingLevelId?: string, pendingCount?: number) =>
        ["characters", "levelUp", characterId, "attributes", editingLevelId, pendingCount] as const,
      skills: (characterId: string, classId?: string, editingLevelId?: string, abilityId?: string | null) =>
        ["characters", "levelUp", characterId, "skills", classId, editingLevelId, abilityId] as const,
      feats: (characterId: string, classId?: string, editingLevelId?: string) =>
        ["characters", "levelUp", characterId, "feats", classId, editingLevelId] as const,
      availableFeats: (characterId: string, aptitudeId: string | null, classId?: string, search?: string, editingLevelId?: string, selectedFeatPicks?: string) =>
        ["characters", "levelUp", characterId, "availableFeats", aptitudeId, classId, search, editingLevelId, selectedFeatPicks] as const,
      availableFeatsGrouped: (characterId: string, aptitudeId: string | null, classId?: string, search?: string, editingLevelId?: string, selectedFeatPicks?: string, pendingKlassLevelIds?: string, pendingFeatPicks?: string) =>
        ["characters", "levelUp", characterId, "availableFeatsGrouped", aptitudeId, classId, search, editingLevelId, selectedFeatPicks, pendingKlassLevelIds, pendingFeatPicks] as const,
      availableFeatFamily: (characterId: string, aptitudeId: string, family: string, classId?: string, editingLevelId?: string, selectedFeatPicks?: string, pendingKlassLevelIds?: string) =>
        ["characters", "levelUp", characterId, "availableFeatFamily", aptitudeId, family, classId, editingLevelId, selectedFeatPicks, pendingKlassLevelIds] as const,
      powers: (characterId: string, classId?: string, editingLevelId?: string) =>
        ["characters", "levelUp", characterId, "powers", classId, editingLevelId] as const,
      availablePowers: (characterId: string, aptitudeId: string | null, level: number | null, classId?: string, search?: string, editingLevelId?: string, selectedFeatPicks?: string, pendingKlassLevelIds?: string, pendingFeatPicks?: string) =>
        ["characters", "levelUp", characterId, "availablePowers", aptitudeId, level, classId, search, editingLevelId, selectedFeatPicks, pendingKlassLevelIds, pendingFeatPicks] as const,
      levelData: (characterId: string, characterLevelId: string) =>
        ["characters", "levelUp", characterId, "levelData", characterLevelId] as const,
      preview: (characterId: string, levelsKey: string, abilityKey?: string) =>
        ["characters", "levelUp", characterId, "preview", levelsKey, abilityKey] as const,
    },
  },
  shared: {
    character: (shareToken: string) =>
      ["shared", "character", shareToken] as const,
  },
  invites: {
    me: ["invites", "me"] as const,
    detail: (id: string | undefined) => ["invites", "detail", id] as const,
  },
  dashboard: {
    stats: ["dashboard", "stats"] as const,
  },
  activities: {
    all: ["activities"] as const,
    lists: ["activities", "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["activities", "list", filters] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    unreadCount: ["notifications", "unreadCount"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["notifications", "list", filters] as const,
  },
  attachments: {
    all: ["attachments"] as const,
    slot: (recordType: string, recordId: string, name: string) =>
      ["attachments", recordType, recordId, name] as const,
  },
};
