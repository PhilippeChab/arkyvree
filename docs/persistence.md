# Soft-archive vs hard-delete

Two row-removal primitives:

- `repo.archive(...)` — `UPDATE … SET deletedAt = now()`. Default queries filter via `Visibility.UnarchivedOnly`. Every table has a `deletedAt` column, but only the repositories of tables that archive define `archive`: on the others it doesn't exist, so a call is a type error.
- `repo.delete(...)` — real `db.delete(this.table)`. Hard delete; FK CASCADE fires. Implemented per-repo where used.

This doc categorizes every table by which primitive its services use, and what's load-bearing vs convention.

## Hard-delete

Rows whose disappearance leaves no observable history a user would expect to find, or where the row's identity isn't durable across edits.

| Category | Tables |
|---|---|
| Customizations | `Modifiers`, `Properties`, `Requirements` |
| Aptitude links | `FeatsAptitudes`, `PowersAptitudes` |
| Class structure | `KlassSkills`, `KlassLevelFeats`, `KlassLevelPowers`, `KlassLevelSaves` |
| Character state | `CharacterLevels`, `CharacterLevelAbilityIncreases`, `CharacterLevelFeats`, `CharacterLevelPowers`, `CharacterLevelSkills`, `CharacterInventory`, `CharacterLanguages`, `CharacterAbilities` |
| Internal forking metadata | `EntitySnapshots` |
| Ruleset entities | `Feats`, `Items`, `Races`, `Klasses`, `KlassLevels`, `Skills`, `Powers`, `Aptitudes`, `Saves`, `Languages`, `Mechanics` |
| Status-driven lifecycle | `Contributors` (Pending/Active/Rejected/Revoked enum) |

`Abilities` is hard-coded in the schema and never deleted.

Repos in this category have no `archive`, so future code can't mistakenly soft-archive into dead state: the call wouldn't compile.

### Why ruleset entities are hard-delete

User-initiated deletion of a ruleset entity in a draft hard-deletes the row. FK CASCADE removes the entity's junctions and class-structure references. Character feat picks use RESTRICT, so deleting a selected feat fails and rolls back rather than erasing the pick. The protections live one layer up:

- `canDeleteEntity({ inUse })` blocks deletion when a character on the **current ruleset** has picked the entity (see `RulesetsPolicy.canDeleteEntity` and the section in [rulesets.md](./rulesets.md)).
- COW + tombstone snapshots handle the inherited-entity-in-a-fork case: deleting an inherited entity creates a COW first, then hard-deletes it; the snapshot stays as a tombstone so the source is hidden in the fork's view.

### Generated feats

Generated Skill Focus cleanup copies an inherited feat locally before deleting the copy. Its retained COW snapshot is a tombstone: the obsolete feat is hidden from the edited fork’s listings and level-up choices while the ancestor and sibling forks remain unchanged. Locally generated feats are deleted directly. Cleanup refuses to hide a feat already selected by a character in the edited ruleset or a subscribing descendant, including picks stored under an ancestor ID after the feat has been customized locally.

Skill renames delete the old generated feat with its modifiers (and modifier requirements), requirements, properties, and junctions before generating its replacement. Generated feat names cannot be edited directly. Group membership does not own the group's feats: removing a spell or weapon does not delete the school's or weapon type's feats. Ordinary override restoration remains an explicit per-entity action; this adds no automatic restoration or dependency metadata.

## Archive — load-bearing

Three groups where archive vs hard-delete makes a real, observable difference.

### Recoverable user content

`Characters`, `Campaigns`, `Rulesets`.

Archiving preserves content for later restoration.

- `Characters` and `Campaigns` have a hard-delete path on **archived rows**:
  - `DELETE /api/characters/:id/permanent` — owner only, must be archived, must not be linked to a campaign that is itself active (an archived campaign no longer "uses" the character). Its bonded children go through FK CASCADE, and the database deletes every deleted character's attachments and modifiers (see *Polymorphic rows* below).
  - `DELETE /api/campaigns/:id/permanent` — GM only, must be archived. Every FK to `campaigns.id` is `ON DELETE CASCADE`, so the row delete wipes membership rows (`players`, `invites`, `player_characters`) **and** every campaign-scoped ruleset entity (`aptitudes`, `abilities`, `feats`, `items`, `klasses` → `klass_levels` → level-feats/powers/saves, `languages`, `mechanics`, `powers`, `races`, `saves`, `skills`) in one shot.
  - Both endpoints enforce ownership and archive-state checks through `CharactersPolicy.canHardDelete` / `CampaignsPolicy.canHardDelete`.
- `Rulesets` has no hard-delete path. Archive is the only terminal state.

### FK CASCADE avoidance

`Users` (real accounts only — demo accounts hard-delete; see *Special cases* below).

Hard-deleting a user row would FK CASCADE through everything they own or created — characters in someone else's campaign, campaigns they GM'd that other users have characters linked to, rulesets others have forked, etc. — and silently wipe content other users still depend on. Archive leaves the user row physically present so dependent FKs stay resolvable.

There is no un-delete UI for accounts. The archive isn't about reversibility; it's about avoiding the FK CASCADE that hard-delete would trigger.

### Hybrid: archive-on-consume, hard-delete-on-TTL-sweep

| Tables | Archive when | Hard-delete when |
|---|---|---|
| `Sessions` | user signs out / account deleted | `runCleanup.ts` reaps expired |
| `EmailVerifications` | code consumed / account email changed | `runCleanup.ts` reaps expired |
| `PasswordResets` | code consumed / account deleted | `runCleanup.ts` reaps expired |
| `Activities` | (none: no `archive`) | `runCleanup.ts` retention sweep only: they're history, kept when their target is deleted (see *Polymorphic rows*) |
| `Notifications` | (none: no `archive`, use `markRead`) | `runCleanup.ts` retention sweep |
| `Blobs`, `Attachments`, `Exports` | (none: no `archive`) | linked S3 object reaped / export expired |

Archive while the row is still referenced by user-visible state (a session in flight, a verification email someone might click); hard-delete once the row is just data debris.

## Archive — restoration semantics

These tables archive specifically because re-creating the same row should restore the prior state, not start fresh.

| Table | Why archive | Restore mechanism |
|---|---|---|
| `StarredRulesets` | Star → unstar → re-star should preserve any per-row metadata | `upsert` (un-archives the existing row) |
| `RulesetExtensions` | Subscribe → unsubscribe → re-subscribe should be idempotent on the metadata row | `upsert` clears `deletedAt` on conflict |
| `OauthAccounts` | Mirrors the `Users`-archive pattern: account-deletion archives the user, dependent rows tag along | `archive({ userId })` paired with the `Users.archive` flow |

These are intentionally archived. Don't flip them — the restore-by-recreate behavior is load-bearing.

## Special cases

### Polymorphic rows: customizations and attachments

Customizations (`Modifiers`, `Requirements`, `Properties`) and `Attachments` name what they belong to by type and id (`source_type` / `source_id`, `entity_type` / `entity_id`, `record_type` / `record_id`), with no foreign key. Triggers delete them with their owner, whatever deletes it: a service, or a foreign key's cascade (a demo account's purge deletes its rulesets, their entities and its characters).

- **Customizations:** a trigger on each table a customization can belong to (`drizzle/0070_customization_cleanup.sql`). Deleting a modifier deletes its requirements the same way. A new type of owner needs the trigger too, and a row in `OWNERS` of `tests/services/rulesets/customization/CustomizationCleanup.test.ts`, which deletes a row of each type and finds no customization left without its owner.
- **Attachments:** a trigger on users and characters (`drizzle/0071_attachment_cleanup.sql`); the blob sweep then reclaims their files. Archiving keeps them: account deletion, which archives the user and its characters, purges their attachments itself (`purgeAttachmentsForRecords`).

Others name their row the same way, and stay when it's deleted, on purpose:

- **`Activities` and `Notifications`** are history, kept until the retention sweep. Opening one whose target is gone resolves to no page (`getActivityUrl`), and the client says the item was deleted.
- **`EntitySnapshots`:** a snapshot whose fork copy is deleted is the tombstone that hides the inherited entity in that fork.

### A level's rows

A level's rows are its character's state, rewritten whole when the level is edited (`delete({ characterLevelId })`, then `createMany`), so none keeps its identity across an edit. Each table is keyed by what a level holds once:

| Table | Key | Why |
|---|---|---|
| `CharacterLevelFeats` (`level_feats`) | its own `id` | A pick is a row: a level can take a stackable feat twice, in one pool or two (Toughness in both of a human fighter 1's General slots), two rows of the same level and feat. The engine refuses what can't repeat (`SelectionChecks`) |
| `CharacterLevelPowers` (`level_powers`) | (level, power) | A level knows a spell once |
| `CharacterLevelSkills` (`level_skills`) | (level, skill) | A skill's ranks are a quantity, its `rank` |
| `CharacterLevelAbilityIncreases` (`level_ability_increases`) | (level, ability) | An increase's size is its `amount` |

A stackable feat taken twice is two picks, not a count: the picks may be in two pools, and every reader (the character's build, a level's edit, the in-use checks) reads a row as one pick.

### Campaign-membership rows (`Players`, `Invites`, `PlayerCharacters`)

Both primitives, picked by entry point:

- **GM removes a single player from a campaign** → hard-delete (`CampaignPlayersService.removePlayer`). Intentional removal, no preservation needed.
- **User account deletion** → archive (`AccountService.deleteAccount`, each repository's `archive({ userId })`). The whole `deleteAccount` flow takes a "hide, don't destroy" approach to leave the user row's dependent state intact; membership rows go along.

### Demo `Users`

Hard-deleted via `Users.delete` (gated on `expiresAt` / `@demo.invalid`). Demo data is by design ephemeral and only owned by the demo user, so the FK CASCADE on hard-delete is exactly what's wanted to clean everything up at expiry. The database deletes the attachments of the account and its characters, and the customizations of its rulesets and characters (see *Polymorphic rows* above).

### A fork's copies of an extension's entities (`unsubscribeExtension`)

`RulesetExtensionsService.unsubscribeExtension` hard-deletes the fork's copies of the extension's entities. It does so once what the fork keeps of them was repointed or refused (`extensions/departingReferences.ts`), and once no character picked one. It reverts each copy as a restore does (`EntityRevert`, `server/cow/writes/`):

- Every row naming the copy is pointed at the extension's entity (`EntityReferences.update`, by the list of what names each type, `ENTITY_REFERENCES`). By then, those rows are the other copies' only.
- The copy goes, then its snapshot. The database deletes the copy's own rows with it (FK CASCADE: its links, a class's levels and skills) and the customizations of every row it deletes (see *Polymorphic rows* above).

A copy naming another, once pointed at the extension's entity, never blocks the other's delete, whatever order the copies go in. Two foreign keys among ruleset entities restrict: an item's template (`items.source_item_id`) and a class level's save (`klass_level_saves.save_id`). Nor is a subrace's or a subclass's copy cascaded away with its parent's (`races.parent_id`, `klasses.parent_id`) before its own turn.

Restoring an override reverts one copy the same way, characters' picks included (see [rulesets.md](./rulesets.md#restoring-an-override)).

## Decision rule for new code

1. Is the table a junction, recomputed-on-edit state, customization, character-side state, ruleset entity, or auth-cleanup row? → **hard-delete** (no `archive`).
2. Does the table have status-driven lifecycle (Contributors-style enum)? → **hard-delete** (no `archive`).
3. Is it Characters / Campaigns / Rulesets? → **archive** (recoverable user content).
4. Is it the `Users` table (real users)? → **archive** (FK CASCADE avoidance).
5. Is it a one-time auth token / cleanup-by-TTL record? → **hybrid**: archive on consume, hard-delete in the TTL sweep.
6. Does re-creating the same row need to restore prior state (star toggle, extension subscribe toggle)? → **archive**, with `upsert` to handle the restore.

If you're adding a new repository that doesn't fit any of these, prefer hard-delete with appropriate `inUse` checks at the service layer. Soft-archive is only worth its weight when you have a concrete reason from the list above.

## When to update this doc

If you add a new repository or change an existing service's removal pattern, update the relevant section. The categorization is intentionally derived-from-code, not aspirational — if something here doesn't match what the code actually does, the doc is wrong, not the code.
