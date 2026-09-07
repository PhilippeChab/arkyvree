# Soft-archive vs hard-delete

Two row-removal primitives:

- `repo.archive(...)` — `UPDATE … SET deletedAt = now()`. Default queries filter via `Visibility.UnarchivedOnly`. Defined as `abstract` on `BaseRepository`; every table has a `deletedAt` column. Repos that intentionally don't soft-archive define `archive` as a throwing stub.
- `repo.delete(...)` — real `db.delete(this.table)`. Hard delete; FK CASCADE fires. Implemented per-repo where used.

This doc categorizes every table by which primitive its services use, and what's load-bearing vs convention.

## Hard-delete

Rows whose disappearance leaves no observable history a user would expect to find, or where the row's identity isn't durable across edits.

| Category | Tables |
|---|---|
| Customizations | `Modifiers`, `Properties`, `Requirements` |
| Aptitude links | `FeatsAptitudes`, `PowersAptitudes` |
| Class structure | `KlassSkills`, `KlassLevelFeats`, `KlassLevelPowers`, `KlassLevelSaves` |
| Character state | `CharacterLevels`, `CharacterLevelFeats`, `CharacterLevelPowers`, `CharacterLevelSkills`, `CharacterInventory`, `CharacterLanguages`, `CharacterAbilities` |
| Internal forking metadata | `EntitySnapshots` |
| Ruleset entities | `Feats`, `Items`, `Races`, `Klasses`, `KlassLevels`, `Skills`, `Powers`, `Aptitudes`, `Saves`, `Languages`, `Mechanics` |
| Status-driven lifecycle | `Contributors` (Pending/Active/Rejected/Revoked enum) |

`Abilities` is hard-coded in the schema and never deleted.

Repos in this category define `archive` as a throwing stub (matching the pattern in `BlobsRepository`/`AttachmentsRepository`/etc.) so future code can't mistakenly soft-archive into dead state.

### Why ruleset entities are hard-delete

User-initiated deletion of a ruleset entity in a draft hard-deletes the row. FK CASCADE wipes the entity's junctions, class-structure references, and character-side picks. The protections live one layer up:

- `canDeleteEntity({ inUse })` blocks deletion when a character on the **current ruleset** has picked the entity (see `RulesetsPolicy.canDeleteEntity` and the section in [rulesets.md](./rulesets.md)).
- COW + tombstone snapshots handle the inherited-entity-in-a-fork case: deleting an inherited entity creates a COW first, then hard-deletes it; the snapshot stays as a tombstone so the source is hidden in the fork's view.

## Archive — load-bearing

Three groups where archive vs hard-delete makes a real, observable difference.

### Recoverable user content

`Characters`, `Campaigns`, `Rulesets`.

Archiving preserves content for later restoration.

- `Characters` and `Campaigns` have a hard-delete path on **archived rows**:
  - `DELETE /api/characters/:id/permanent` — owner only, must be archived, must not be linked to a campaign that is itself active (an archived campaign no longer "uses" the character). Service cleans up polymorphic rows that FK CASCADE doesn't reach (character attachments, character-scoped modifiers, including bonded children's rows) before calling `Characters.delete`.
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
| `Activities` | (none — repo's archive is unused) | `runCleanup.ts` retention sweep, or `deleteByTargets` when target hard-deleted |
| `Notifications` | (`archive` is a no-op stub — use `markRead`) | `runCleanup.ts` retention sweep |
| `Blobs`, `Attachments`, `Exports` | (`archive` throws or no-ops) | linked S3 object reaped / export expired |

Archive while the row is still referenced by user-visible state (a session in flight, a verification email someone might click); hard-delete once the row is just data debris.

## Archive — restoration semantics

These tables archive specifically because re-creating the same row should restore the prior state, not start fresh.

| Table | Why archive | Restore mechanism |
|---|---|---|
| `StarredRulesets` | Star → unstar → re-star should preserve any per-row metadata | `createOrRestore` (un-archives the existing row) |
| `RulesetExtensions` | Subscribe → unsubscribe → re-subscribe should be idempotent on the metadata row | `upsert` clears `deletedAt` on conflict |
| `OauthAccounts` | Mirrors the `Users`-archive pattern: account-deletion archives the user, dependent rows tag along | `archiveAllForUser` paired with the `Users.archive` flow |

These are intentionally archived. Don't flip them — the restore-by-recreate behavior is load-bearing.

## Special cases

### Campaign-membership rows (`Players`, `Invites`, `PlayerCharacters`)

Both primitives, picked by entry point:

- **GM removes a single player from a campaign** → hard-delete (`PlayersService.deleteByPlayerId`). Intentional removal, no preservation needed.
- **User account deletion** → archive (`AuthenticationService.archiveAllForUser`). The whole `deleteAccount` flow takes a "hide, don't destroy" approach to leave the user row's dependent state intact; membership rows go along.

### Demo `Users`

Hard-deleted via `Users.delete` (gated on `expiresAt` / `@demo.invalid`). Demo data is by design ephemeral and only owned by the demo user, so the FK CASCADE on hard-delete is exactly what's wanted to clean everything up at expiry.

### Ruleset entity / class cascade (`deleteEntityWithCascade`)

`deleteEntityWithCascade` (`server/services/RulesetsService.ts`) is the shared cleanup helper used in two flows: extension uninstall and `revertOverride`. It:

- Hard-deletes the entity's junction rows (aptitude links, class-structure rows referencing it).
- Hard-deletes the entity's customizations (modifiers / properties / requirements).
- Hard-deletes the entity itself, plus `klass_levels` for klasses (FK CASCADE on `klass_levels.klass_id` would also handle this; the explicit walk gives us per-level customization cleanup).

For items, the `source_item_id` FK is `RESTRICT` — `revertOverride` repoints copies to the original parent template before invoking the cascade.

## Decision rule for new code

1. Is the table a junction, recomputed-on-edit state, customization, character-side state, ruleset entity, or auth-cleanup row? → **hard-delete** (throwing-stub `archive`).
2. Does the table have status-driven lifecycle (Contributors-style enum)? → **hard-delete** (throwing-stub `archive`).
3. Is it Characters / Campaigns / Rulesets? → **archive** (recoverable user content).
4. Is it the `Users` table (real users)? → **archive** (FK CASCADE avoidance).
5. Is it a one-time auth token / cleanup-by-TTL record? → **hybrid**: archive on consume, hard-delete in the TTL sweep.
6. Does re-creating the same row need to restore prior state (star toggle, extension subscribe toggle)? → **archive**, with `createOrRestore` / `upsert` to handle the restore.

If you're adding a new repository that doesn't fit any of these, prefer hard-delete with appropriate `inUse` checks at the service layer. Soft-archive is only worth its weight when you have a concrete reason from the list above.

## When to update this doc

If you add a new repository or change an existing service's removal pattern, update the relevant section. The categorization is intentionally derived-from-code, not aspirational — if something here doesn't match what the code actually does, the doc is wrong, not the code.
