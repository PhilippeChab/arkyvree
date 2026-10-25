# Soft-archive vs hard-delete

Two row-removal primitives:

- `repo.archive(...)` — `UPDATE … SET deletedAt = now()`. Default queries filter via `Visibility.UnarchivedOnly`. Every table has a `deletedAt` column, but only the repositories of tables that archive define `archive`: on the others it doesn't exist, so a call is a type error.
- `repo.delete(...)` — real `db.delete(this.table)`. Hard delete; FK CASCADE fires. Implemented per-repo where used.

This doc categorizes every table by which primitive its services use, and what's load-bearing vs convention. It opens with how a ruleset's and a character's data is stored: the generic tables, which every module's data shares.

## The generic tables

A ruleset's entities and a character's build are stored in tables no game names (migration `drizzle/0080_generic-tables.sql`). What a module's data is, each module declares (`RulesetModule.storage`, `StorageDeclaration`: 3.5's `engine/rulesets/dnd3.5/storage/Dnd35Storage.ts`), and the server reads and writes the tables by those declarations (`Engine.storage()`), holding no game's mapping.

- **Entities:** `rules.entities`: an entity's type, scope (its ruleset, its campaign), name and description, its partition (a name is unique within it: a class's or a race's kind), and, for an entity another owns (a class level), its owner and its position (its level).
- **Fields:** `rules.entity_fields`, one typed value a row (`text_value`, `number_value` or `flag_value`, as its field's `value_kind` says), a set one row per value by ordinal (a key, not an order). A ruleset's settings are `rules.ruleset_fields`, a character's `character.fields`. A missing row is no value.
- **Links:** `rules.entity_links`: an entity's link of a role to another (a feat listed in an aptitude, a class level's grant through a pool, a save's key ability), with a tier, an amount and whether it's free, in its from-entity's order (`ordinal`). A ruleset's are `rules.ruleset_links`, a character's `character.links` (its race, its scores, its languages).
- **Advancement:** a character's levels are `character.advancements`, each in a track (its class level), and their picks `character.advancement_picks`, by step (its hit points, its feats through their pools, its skills' ranks).
- **Registries:** what the modules declare, each row's foreign keys check it against: `rules.modules` (a ruleset's base rules), `entity_types`, `field_defs`, `link_roles` and `link_role_kinds`, `ruleset_roles`, `character.character_roles`, `steps` and `item_types`. Every migrate writes them from the modules' declarations (`StoredRegistries.reconcile`, run by `scripts/db/migrate.ts` and the test databases' reset), so a module's new type, field, role or step is a code change only: it adds what's new, updates what changed (a field that becomes a set, a role that becomes single: the foreign keys cascade into the rows that carry it, and the database refuses a change its rows can't take), and removes what no module declares any more, refusing, by its name, a row that rows still use. Its rewrites leave characters' last change alone (`arkyvree.registry_sync`). `tests/database/dnd3.5/registries.test.ts` checks they hold what the modules declare, and what a sync does.

How the server reads them: one generic repository a table, which reads the stored rows as they are and hands them to the engine, which maps them to its module's rows by its declaration (`Engine.storage()`, `engine/api/StorageEngine.ts`). No repository names a kind (`server/repositories/stored/`):

- **Entities** (`Entities`, `StoredEntities`): an entity's own columns, its fields and its links, read in one query and mapped to its kind's row (`rowOf`): every column under its name, each of its fields and single links its declaration names. A write is split back into them (`writeOf`), a column a write leaves out written with its declared default. A kind's list, page, picker options and lookups are the same methods for every kind (`findList`, `findPage`, `findOptionPage`, `findOne`), and a ruleset's view reads its stored entities whole (`findStored`), which the engine builds its raw data from (`CopyOnWriteEngine.buildRawData`).
- **An entity's links of a role it holds many of** (a feat's pools, a class level's grants and saves, a class's skills) are read and written as links (`EntityLinks`, `StoredLinks`), each as the view holds it (`ViewLink`: its role, from, to, via, tier, amount, free and ordinal), a new one after its from-entity's last of its role to its target's kind. A ruleset's view reads them with its entities, by role (`StorageEngine.viewLinksOf`), and an entity's single links are its row's columns or its fields'.
- **An owner's stored values** are the fields its kind's columns don't hold, and the links its fields read (a class's bonus spell ability, a ruleset's skill point ability): `Fields` (`StoredFields`) reads them as each owner's typed stored values (`findMany`, `StoredValues`, as the engine holds them: `StorageEngine.storedValuesOf`), writes what a save replaces (`update`, a `FieldsWrite`: each field and link role it names, its values in their order, a set's ordinals 0 to n-1, each in its field's column by its declaration), and copies a ruleset's Settings onto its fork (`createRulesetCopy`, one `INSERT … SELECT` a table). A ruleset's view reads them with its entities (`StorageEngine.valuesOf`).
- **A character's row** is its own columns with its fields' values and its single links (its race), read in one query (`StoredCharacters`) and mapped by `characterRowOf`. Its links of a role (`CharacterLinks`: its scores, its languages) map by `characterLinkRowOf`, its advancements' picks by step (`Picks`: its feats, its skills) by `pickRowOf`, and its levels (`CharacterAdvancements`, its advancements with their hit points' picks) by `advancementRowOf`.
- A subquery reaching its query's own table names the column in full (`toQualified`): Drizzle names a selected column bare, which a subquery's table of that column name would answer.

What deleting an entity does to what names it is each role's or step's rule, on every path (a service's delete, an owner's or a ruleset's cascade, a purge): a trigger on `rules.entities` (`apply_delete_rules`) deletes what a role deletes with it (a save with its key ability) and unlinks what a role unlinks; a role that refuses leaves its link, which the deferred foreign key refuses at commit. Every reference that doesn't own its row is `DEFERRABLE INITIALLY DEFERRED`, and an optional pair (an id and its type) is `MATCH FULL`. drizzle-kit records neither: `tests/database/dnd3.5/registries.test.ts` checks the database keeps them, and `drizzle/schema.ts`'s hand fixes are listed there (its `bytea` type, a ruleset's base rules typed as the modules', a field's inheritance key, which names its type twice).

A rule the database checked of 3.5's columns (a hit die's values, a score's bounds, an alignment's) is the 3.5 module's now, which refuses what breaks it before a write.

## Hard-delete

Rows whose disappearance leaves no observable history a user would expect to find, or where the row's identity isn't durable across edits.

| Category | Tables |
|---|---|
| Customizations | `Modifiers`, `Requirements`; `Fields`, an entity's stored values |
| An entity's links (a feat's pools, a class's skills, a class level's grants and saves) | `EntityLinks` |
| Character state | `CharacterAdvancements`, `Picks`, `CharacterInventory`, `CharacterLinks` |
| Internal forking metadata | `EntitySnapshots` |
| Ruleset entities, every kind's | `Entities` |
| Status-driven lifecycle | `Contributors` (Pending/Active/Rejected/Revoked enum) |

`Abilities` are seeded and never deleted: their service reads them alone.

Repos in this category have no `archive`, so future code can't mistakenly soft-archive into dead state: the call wouldn't compile.

### Why ruleset entities are hard-delete

User-initiated deletion of a ruleset entity in a draft hard-deletes the row. Its fields, its links and the entities it owns go with it, and each role's rule says what goes of the links to it (`apply_delete_rules`). A character's pick refuses its feat's delete, at commit, so deleting a selected feat fails and rolls back rather than erasing the pick. The protections live one layer up:

- `canDeleteEntity({ inUse })` blocks deletion when a character on the **current ruleset** has picked the entity (see `RulesetsPolicy.canDeleteEntity` and the section in [rulesets.md](./rulesets.md)).
- COW + tombstone snapshots handle the inherited-entity-in-a-fork case: deleting an inherited entity creates a COW first, then hard-deletes it; the snapshot stays as a tombstone so the source is hidden in the fork's view.

### Generated feats

Generated Skill Focus cleanup copies an inherited feat locally before deleting the copy. Its retained COW snapshot is a tombstone: the obsolete feat is hidden from the edited fork’s listings and level-up choices while the ancestor and sibling forks remain unchanged. Locally generated feats are deleted directly. Cleanup refuses to hide a feat already selected by a character in the edited ruleset or a subscribing descendant, including picks stored under an ancestor ID after the feat has been customized locally.

Skill renames delete the old generated feat with its modifiers (and modifier requirements), requirements, fields, and junctions before generating its replacement. Generated feat names cannot be edited directly. Group membership does not own the group's feats: removing a spell or weapon does not delete the school's or weapon type's feats. Ordinary override restoration remains an explicit per-entity action; this adds no automatic restoration or dependency metadata.

## Archive — load-bearing

Three groups where archive vs hard-delete makes a real, observable difference.

### Recoverable user content

`Characters`, `Campaigns`, `Rulesets`.

Archiving preserves content for later restoration.

- `Characters` and `Campaigns` have a hard-delete path on **archived rows**:
  - `DELETE /api/characters/:id/permanent` — owner only, must be archived, must not be linked to a campaign that is itself active (an archived campaign no longer "uses" the character). Its bonded children go through FK CASCADE, and the database deletes every deleted character's attachments and modifiers (see *Polymorphic rows* below).
  - `DELETE /api/campaigns/:id/permanent` — GM only, must be archived. Every FK to `campaigns.id` is `ON DELETE CASCADE`, so the row delete wipes membership rows (`players`, `invites`, `player_characters`) **and** every campaign-scoped ruleset entity (its `rules.entities` rows, whatever their type: a class with its levels, their fields and their links) in one shot.
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

Customizations (`Modifiers`, `Requirements`) and `Attachments` name what they belong to by type and id (`source_type` / `source_id`, `entity_type` / `entity_id`, `record_type` / `record_id`), with no foreign key. Triggers delete them with their owner, whatever deletes it: a service, or a foreign key's cascade (a demo account's purge deletes its rulesets, their entities and its characters).

- **Customizations:** a trigger on each table a customization can belong to (`drizzle/0070_customization_cleanup.sql`; an entity's, `delete_customizations` on `rules.entities`, `drizzle/0080_generic-tables.sql`). Deleting a modifier deletes its requirements the same way. A new type of owner needs the trigger too, and a row in `OWNERS` of `tests/services/rulesets/customization/dnd3.5/CustomizationCleanup.test.ts`, which deletes a row of each type and finds no customization left without its owner.
- **Attachments:** a trigger on users and characters (`drizzle/0071_attachment_cleanup.sql`); the blob sweep then reclaims their files. Archiving keeps them: account deletion, which archives the user and its characters, purges their attachments itself (`purgeAttachmentsForRecords`).

Others name their row the same way, and stay when it's deleted, on purpose:

- **`Activities` and `Notifications`** are history, kept until the retention sweep. Opening one whose target is gone resolves to no page (`getActivityUrl`), and the client says the item can't be found.
- **`EntitySnapshots`:** a snapshot whose fork copy is deleted is the tombstone that hides the inherited entity in that fork.

### A character's last change (`last_changed_at`)

A character's `updated_at` moves only when its own row is written (its details, its share link, its archive), and it's the details form's stale-edit check (`expectedUpdatedAt`, `GuardsStaleEdits`). Its last change is a column of its own, `last_changed_at`, which the characters list's Recently Updated order reads (`CharactersRepository.findPage`). The database moves it, whatever writes, through triggers (`drizzle/0078_last-changed.sql`), so no service writes it:

- A write that changes the character's row moves it (`touch_own_row`, before the update). One that writes `last_changed_at` alone keeps what it writes (the triggers' own, a backfill, a test's `backdateLastChange`).
- Every insert, update and delete of the rows that belong to the character moves it, a foreign key's cascade included: its fields, its links (its race, scores and languages), its inventory, its advancements and their picks (feats, spells, skills, ability increases, hit points), its customizations (its modifiers and their requirements, its requirements) and its portrait. One statement trigger per table and event (`touch_characters_on_insert` / `_update` / `_delete`) finds the characters of the rows it wrote and moves each once (`character.touch_characters`).
- A bonded creature's change moves its master's too: the list shows only the master, whose sheet the creature is part of. A creature added or deleted, or whose last change moved, moves its master's (`touch_masters`); a master moves before its creature, as a level-up locks them.
- It moves to the transaction's start (`now()`), once a transaction: a character the transaction already moved isn't written again, and a transaction that started earlier never moves it back. Nothing moves `updated_at`, so an open details form still saves after a level-up in another tab.

Its contributors and its campaign links aren't its rows: who may edit a character and where it plays leave its last change, as other users change them (an invite accepted, a player removed). Neither do its activities, notifications or exports, which are history. A write that repoints a character's rows (a fork restoring an override or leaving an extension, `EntityReferences.update`) moves it like any other.

A new table of a character's rows takes the three triggers, in a migration of its own.

### A level's rows

A level's rows are its character's state, rewritten whole when the level is edited (`delete({ characterLevelId })`, then `createMany`), so none keeps its identity across an edit. Each is a pick of its advancement (`character.advancement_picks`), keyed by its step, its entity and its ordinal: a step that repeats (`character.steps.repeats`) numbers an entity picked again, and one that doesn't refuses a second pick.

| Step | Repeats | Why |
|---|---|---|
| `feats` (`Picks`, `feats`) | yes | A pick is a row: a level can take a stackable feat twice, in one pool or two (Toughness in both of a human fighter 1's General slots), two picks of the same level and feat. The engine refuses what can't repeat (`SelectionChecks`) |
| `spells` (`Picks`, `spells`) | no | A level knows a spell once |
| `skills` (`Picks`, `skills`) | no | A skill's ranks are a quantity, its `amount` |
| `abilities` (`Picks`, `abilityIncreases`) | no | An increase's size is its `amount` |
| `hp` (`CharacterAdvancements`) | no | A level's hit points, a value: no entity |

A stackable feat taken twice is two picks, not a count: the picks may be in two pools, and every reader (the character's build, a level's edit, the in-use checks) reads a row as one pick.

### Campaign-membership rows (`Players`, `Invites`, `PlayerCharacters`)

Both primitives, picked by entry point:

- **GM removes a single player from a campaign** → hard-delete (`CampaignPlayersService.removePlayer`). Intentional removal, no preservation needed.
- **User account deletion** → archive (`AccountService.deleteAccount`, each repository's `archive({ userId })`). The whole `deleteAccount` flow takes a "hide, don't destroy" approach to leave the user row's dependent state intact; membership rows go along.

### Demo `Users`

Hard-deleted via `Users.delete` (gated on `expiresAt` / `@demo.invalid`). Demo data is by design ephemeral and only owned by the demo user, so the FK CASCADE on hard-delete is exactly what's wanted to clean everything up at expiry. The database deletes the attachments of the account and its characters, and the customizations of its rulesets and characters (see *Polymorphic rows* above).

### A fork's copies of an extension's entities (`unsubscribeExtension`)

`RulesetExtensionsService.unsubscribeExtension` hard-deletes the fork's copies of the extension's entities. It does so once what the fork and its characters keep that names what leaves was pointed at what the fork's view shows in its place, or refused when nothing stands there (`extensions/departingReferences.ts`). It reverts each copy as a restore does (`EntityRevert`, `server/cow/writes/`):

- Every row naming the copy is pointed at the extension's entity (`EntityReferences.update`, by the list of what names each type, `ENTITY_REFERENCES`). By then, those rows are the other copies' only.
- The copy goes, then its snapshot. The database deletes the copy's own rows with it (FK CASCADE: its links, a class's levels and skills) and the customizations of every row it deletes (see *Polymorphic rows* above).

A copy naming another, once pointed at the extension's entity, never blocks the other's delete, whatever order the copies go in. Two roles among ruleset entities refuse: an item's template (`madeFrom`) and a class level's save (`baseBonus`). Nor is a subrace's or a subclass's copy deleted with its parent's (`subraceOf`, `subclassOf`, which delete) before its own turn.

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
