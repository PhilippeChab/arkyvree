import type { InviteKind } from "./invites.ts";

export const QUERY_KEYS = {
  auth: {
    me: ["auth", "me"] as const,
    /** Every sign-in, sign-up, verification, reset and sign-out request: whether one is in flight, whichever page sent it. */
    requests: ["auth", "requests"] as const,
    linkedAccounts: ["auth", "linkedAccounts"] as const,
  },
  rulesets: {
    lists: ["rulesets", "list"] as const,
    list: (filters?: Record<string, unknown>) => ["rulesets", "list", filters] as const,
    detail: (id: string) => ["rulesets", "detail", id] as const,
    section: (id: string, section: string) => ["rulesets", "detail", id, section] as const,
    /** A picker's search in a section; nested under the section so it refreshes with it. */
    sectionSearch: (id: string, section: string, search: string, scope?: string) =>
      ["rulesets", "detail", id, section, "autocomplete", search, scope] as const,
    /** The extensions a ruleset subscribes to. */
    extensions: (id: string) => ["rulesets", "detail", id, "extensions"] as const,
    /**
     * Every ability of the ruleset, for pickers. Nested under the Abilities
     * section key so invalidating the section refreshes the pickers too.
     */
    abilities: (id: string) => ["rulesets", "detail", id, "abilities", "options"] as const,
    /**
     * The templates of an item type (the weapons, armors or shields an item can be based on). Nested under the Items
     * section key so an item's write refreshes them too.
     */
    itemTemplates: (id: string, type: string) => ["rulesets", "detail", id, "items", "templates", type] as const,
    /** One item's details, as a character's add dialog reads them; nested like `itemTemplates`. */
    item: (id: string, itemId: string) => ["rulesets", "detail", id, "items", "item", itemId] as const,
    classDetail: (id: string, classId: string) => ["rulesets", "detail", id, "class", classId] as const,
    classLevels: (id: string, classId: string) => ["rulesets", "detail", id, "class", classId, "levels"] as const,
    classSkills: (id: string, classId: string) => ["rulesets", "detail", id, "class", classId, "skills"] as const,
    classSpellsPerDay: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "spells-per-day"] as const,
    classSpellsKnown: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "spellsKnown"] as const,
    classSpellLists: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "spellLists"] as const,
    classFeatPools: (id: string, classId: string) => ["rulesets", "detail", id, "class", classId, "featPools"] as const,
    sectionGrouped: (id: string, section: string) => ["rulesets", "detail", id, section, "grouped"] as const,
    familyVariants: (id: string, family: string, childOnly: boolean) =>
      ["rulesets", "detail", id, "feats", "family", family, childOnly] as const,
    entity: (id: string, entityType: string, entityId: string) =>
      ["rulesets", "detail", id, "entity", entityType, entityId] as const,
    targetCompletions: (id: string, prefix: string, kind: string, search: string, entityType?: string) =>
      ["rulesets", "detail", id, "targetCompletions", prefix, kind, search, entityType] as const,
    /** What a target path takes, once it's complete and its entity type takes it. */
    targetPath: (id: string, kind: string, path: string, entityType?: string) =>
      ["rulesets", "detail", id, "targetPath", kind, path, entityType] as const,
    changes: (id: string) => ["rulesets", "detail", id, "changes"] as const,
    /** Every language of the ruleset, for pickers; nested like `abilities`. */
    languages: (id: string) => ["rulesets", "detail", id, "languages", "options"] as const,
    /** Every save of the ruleset, for pickers and columns; nested like `abilities`. */
    saves: (id: string) => ["rulesets", "detail", id, "saves", "options"] as const,
    propertyTypeCompletions: (id: string, search: string, entityType?: string) =>
      ["rulesets", "detail", id, "propertyTypeCompletions", search, entityType] as const,
    propertyValueCompletions: (id: string, propertyType: string, search: string) =>
      ["rulesets", "detail", id, "propertyValueCompletions", propertyType, search] as const,
  },
  campaigns: {
    lists: ["campaigns", "list"] as const,
    list: (filters?: Record<string, unknown>) => ["campaigns", "list", filters] as const,
    /** Every campaign's own data and tabs: what a character's change can show in, whichever campaigns list it. */
    details: ["campaigns", "detail"] as const,
    detail: (id: string) => ["campaigns", "detail", id] as const,
    section: (id: string, section: string) => ["campaigns", "detail", id, section] as const,
    characterDetail: (campaignId: string, characterId: string) =>
      ["campaigns", "detail", campaignId, "character", characterId] as const,
  },
  characters: {
    lists: ["characters", "list"] as const,
    list: (filters?: Record<string, unknown>) => ["characters", "list", filters] as const,
    detail: (id: string) => ["characters", "detail", id] as const,
    contributors: (id: string) => ["characters", "detail", id, "contributors"] as const,
    inventory: (id: string) => ["characters", "detail", id, "inventory"] as const,
    modifiers: (id: string) => ["characters", "detail", id, "modifiers"] as const,
    unlinked: (campaignId: string, filters?: Record<string, unknown>) =>
      filters
        ? (["characters", "unlinked", campaignId, filters] as const)
        : (["characters", "unlinked", campaignId] as const),
    availableRaces: (rulesetId: string, filters?: Record<string, unknown>) =>
      ["characters", "availableRaces", rulesetId, filters] as const,
    /** A level-up read's cache: its key holds the query (or the body) it sends, so no parameter is left out of it. */
    levelUp: {
      all: (characterId: string) => ["characters", "levelUp", characterId] as const,
      attributes: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "attributes", query] as const,
      availableClasses: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "availableClasses", query] as const,
      availableFeatFamily: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "availableFeatFamily", query] as const,
      availableFeatsGrouped: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "availableFeatsGrouped", query] as const,
      availablePowers: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "availablePowers", query] as const,
      feats: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "feats", query] as const,
      levelData: (characterId: string, characterLevelId: string) =>
        ["characters", "levelUp", characterId, "levelData", characterLevelId] as const,
      powers: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "powers", query] as const,
      preview: (characterId: string, body: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "preview", body] as const,
      skills: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "skills", query] as const,
    },
  },
  legal: {
    ogl: ["legal", "ogl-1.0a"] as const,
  },
  shared: {
    character: (shareToken: string) => ["shared", "character", shareToken] as const,
  },
  invites: {
    all: ["invites"] as const,
    detail: (kind: InviteKind, id: string) => ["invites", kind, id] as const,
  },
  dashboard: {
    stats: ["dashboard", "stats"] as const,
  },
  activities: {
    all: ["activities"] as const,
    list: (filters?: Record<string, unknown>) => ["activities", "list", filters] as const,
    /** Where an activity's or a notification's target is now, resolved as it's opened. */
    target: (targetTable: string, targetId: string) => ["activities", "target", targetTable, targetId] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    unreadCount: ["notifications", "unreadCount"] as const,
    list: (filters?: Record<string, unknown>) => ["notifications", "list", filters] as const,
  },
  attachments: {
    slot: (recordType: string, recordId: string, name: string) => ["attachments", recordType, recordId, name] as const,
  },
};
