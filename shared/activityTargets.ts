/**
 * The type of each activity's target that's no entity's or link role's (those are their own type and role), by what it
 * is: what an activity and its notifications record, and what opening one resolves. Each in the form an entity's type
 * takes, its words joined by hyphens (`player-characters`), never a table's name.
 */
export const TARGET_TYPES = {
  campaigns: "campaigns",
  characterContributors: "character-contributors",
  characters: "characters",
  contributors: "contributors",
  exports: "exports",
  invites: "invites",
  modifiers: "modifiers",
  oauthAccounts: "oauth-accounts",
  playerCharacters: "player-characters",
  players: "players",
  requirements: "requirements",
  rulesets: "rulesets",
  sessions: "sessions",
  users: "users",
} as const;
