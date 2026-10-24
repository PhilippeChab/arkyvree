import type { InviteKind } from "@/client/src/components/invites/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

export const QUERY_KEYS = {
  auth: {
    me: ["auth", "me"] as const,
    /**
     * Every sign-in, sign-up, verification, reset and sign-out request: whether one is in flight, whichever page sent
     * it.
     */
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
     * How a new character of the ruleset sets its scores of a scored link (`link`), and the entities it scores in its
     * sheets' order. Nested under `creations`, which a write to the ruleset's content refreshes.
     */
    characterCreation: (id: string, link: string) => ["rulesets", "detail", id, "creation", link] as const,
    /** Every scored link's creation of the ruleset (`characterCreation`'s). */
    creations: (id: string) => ["rulesets", "detail", id, "creation"] as const,
    /**
     * The templates of an item type (the weapons, armors or shields an item can be based on). Nested under the Items
     * section key so an item's write refreshes them too.
     */
    itemTemplates: (id: string, type: string) => ["rulesets", "detail", id, "items", "templates", type] as const,
    /** One item's details, as a character's add dialog reads them; nested like `itemTemplates`. */
    item: (id: string, kind: string, itemId: string) => ["rulesets", "detail", id, kind, "item", itemId] as const,
    classDetail: (id: string, classId: string) => ["rulesets", "detail", id, "class", classId] as const,
    classLinks: (id: string, classId: string, segment: string) =>
      ["rulesets", "detail", id, "class", classId, segment] as const,
    classTable: (id: string, classId: string, table: string) =>
      ["rulesets", "detail", id, "class", classId, "table", table] as const,
    /** A class's levels, the entities it owns, nested in the class its saves refresh. */
    levels: (id: string, classId: string) => ["rulesets", "detail", id, "class", classId, "levels"] as const,
    classProgression: (id: string, classId: string) =>
      ["rulesets", "detail", id, "class", classId, "progression"] as const,
    sectionGrouped: (id: string, section: string) => ["rulesets", "detail", id, section, "grouped"] as const,
    familyVariants: (id: string, section: string, family: string, childOnly: boolean) =>
      ["rulesets", "detail", id, section, "family", family, childOnly] as const,
    entity: (id: string, entityType: string, entityId: string) =>
      ["rulesets", "detail", id, "entity", entityType, entityId] as const,
    /**
     * An entity's customization tab's rows (its modifiers, its requirements), nested in the ruleset its saves refresh.
     */
    customization: (id: string, entityType: string, entityId: string, tab: "modifiers" | "requirements") =>
      ["rulesets", "detail", id, "customization", entityType, entityId, tab] as const,
    targetCompletions: (id: string, prefix: string, kind: string, search: string, entityType?: string) =>
      ["rulesets", "detail", id, "targetCompletions", prefix, kind, search, entityType] as const,
    /** What a target path takes, once it's complete and its entity type takes it. */
    targetPath: (id: string, kind: string, path: string, entityType?: string) =>
      ["rulesets", "detail", id, "targetPath", kind, path, entityType] as const,
    changes: (id: string) => ["rulesets", "detail", id, "changes"] as const,
    /**
     * Every entity of a kind of the ruleset (its abilities, its saves), for pickers and columns: nested under its
     * kind's section key, so invalidating the section refreshes the pickers too.
     */
    options: (id: string, type: string) => ["rulesets", "detail", id, getUrlSegment(type), "options"] as const,
    /** The fields each entity's form shows, and the ruleset's Settings', as the ruleset declares them. */
    fields: (id: string) => ["rulesets", "detail", id, "fields"] as const,
    /** The ruleset's Settings: its own fields' values. */
    settings: (id: string) => ["rulesets", "detail", id, "settings"] as const,
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
    /**
     * What a character has of a picked link (`link`) and may pick, for its form's picks: nested in the character, which
     * a save refreshes.
     */
    links: (id: string, link: string, query: Record<string, unknown>) =>
      ["characters", "detail", id, "links", link, query] as const,
    /**
     * What keeps a slot from taking an item, as an inventory dialog asks it: nested in the inventory, which a save
     * refreshes.
     */
    inventoryPlacement: (id: string, query: Record<string, unknown>) =>
      ["characters", "detail", id, "inventory", "placement", query] as const,
    modifiers: (id: string) => ["characters", "detail", id, "modifiers"] as const,
    unlinked: (campaignId: string, filters?: Record<string, unknown>) =>
      filters
        ? (["characters", "unlinked", campaignId, filters] as const)
        : (["characters", "unlinked", campaignId] as const),
    /** A new character's creation pick's options (`column`'s), as the fields that narrow them hold (`filters`). */
    creationOptions: (rulesetId: string, column: string, filters?: Record<string, unknown>) =>
      ["characters", "creationOptions", rulesetId, column, filters] as const,
    /** A level-up read's cache: its key holds the query (or the body) it sends, so no parameter is left out of it. */
    levelUp: {
      all: (characterId: string) => ["characters", "levelUp", characterId] as const,
      plan: (characterId: string, body: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "plan", body] as const,
      savedPlan: (characterId: string, characterLevelId: string) =>
        ["characters", "levelUp", characterId, "savedPlan", characterLevelId] as const,
      stepOptions: (characterId: string, step: string, query: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "stepOptions", step, query] as const,
      steps: (characterId: string, query?: Record<string, unknown>) =>
        ["characters", "levelUp", characterId, "steps", query] as const,
    },
  },
  legal: {
    ogl: ["legal", "oglLicense"] as const,
  },
  /** What every base rules' rulesets share: their words, kinds and license, the same for anyone. */
  rules: ["rules"] as const,
  shared: {
    character: (shareToken: string) => ["shared", "character", shareToken] as const,
  },
  invites: {
    all: ["invites"] as const,
    /**
     * An answer's mutation, accept or reject: shared, so every surface can tell which invites are being answered,
     * whichever surface the click came from.
     */
    answer: ["invites", "answer"] as const,
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
    /** The unread notifications, which the bell counts and lists. */
    unread: ["notifications", "unread"] as const,
    list: (filters?: Record<string, unknown>) => ["notifications", "list", filters] as const,
  },
  attachments: {
    slot: (recordType: string, recordId: string, name: string) => ["attachments", recordType, recordId, name] as const,
  },
};
