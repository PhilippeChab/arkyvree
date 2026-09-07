# Access & Authorization

This is the source of truth for who can do what across the app. Every gated mutation goes through one of the policy classes under `server/services/policies/` — services call them, policies throw `ForbiddenError` / `UnprocessableEntityError` / `ConflictError`, the throw propagates.

If you're adding a new mutation, find the matching row below and call the same policy method. If your case isn't covered, extend the policy — don't write inline `userId === session.userId` checks (see "Identity vs. policy" at the bottom).

## Actors

The system has four actor categories. Most policies are an OR of two or three of these.

| Actor | Definition |
|---|---|
| **Owner** | `entity.userId === session.userId`. The user who created the row. Owners always retain rights that contributors don't (publish, archive, manage Admin contributors). |
| **Contributor (Admin / Editor / Viewer)** | An `Active`, non-deleted row in `contributorsInRules` (for rulesets) or `contributorsInCharacter` (for characters), keyed by `(entity.id, session.userId)`. Roles enum: `'Admin' | 'Editor' | 'Viewer'`. |
| **Campaign member (Player / Game Master)** | An `Active`, non-deleted row in `playersInCampaign`, keyed by `(campaign.id, session.userId)`. Roles: `'Player' | 'Game Master'`. |
| **Public visitor** | Anyone with a session. Public rulesets and characters with `visibility = "Public"` are readable by all visitors. |

A user can hold multiple roles for the same entity (e.g. owner of a ruleset they're also a contributor on — happens via test seed data). Policies check the strongest applicable role.

## Rulesets — `RulesetsPolicy`

Constructed with `(session, ruleset, contributorRole?)`. Pass the contributor role from `contributorsInRules` lookup; pass `null` if none. Helper: `getRulesetPolicy(tx, session, ruleset)` resolves the role and constructs the policy in one call.

| Method | Allowed actors | Notes |
|---|---|---|
| `canCreate` | anyone | ruleset access enforced separately in service |
| `canRead` | anyone | listing/visibility is enforced by `findMany` scopes, not the policy |
| `canUpdate` | owner, **Admin** | edits ruleset metadata (name, description, privacy, archive). Throws on base rulesets and Archived rulesets |
| `canUpdateEntity` | owner, **Admin**, **Editor** | edits entity content (feats, items, classes, …). Same archive guard |
| `canDelete` | nobody | hard deletion of rulesets isn't supported; archive instead |
| `canDeleteEntity({ inUse })` | owner, **Admin**, **Editor** | deletes individual entities. Throws if `inUse` (would orphan a character pick on this ruleset or any descendant fork). See [rulesets.md](./rulesets.md#what-inuse-means-in-entity-delete-services) |
| `canPublish` | **owner only** | Draft → Published; can't be delegated to Admin |
| `canFork` | anyone (any session) | source must be Published and be a base ruleset (`rulesetId IS NULL`) |
| `canSubscribeExtension` | **owner only** | private to the owner of the host fork |
| `canUnsubscribeExtension({ inUse })` | **owner only** | adds the in-use guard on top of `canSubscribeExtension` |
| `canManageContributors` | owner, **Admin** | invite / revoke / role-change |
| `canManageAdminContributors` | **owner only** | narrowing of the above for touching `Admin`-tier rows |
| `canUnarchive` | **owner only** | Archived → Draft |
| `canViewChanges` | public rulesets: anyone; private: owner + any contributor | overrides metadata |

**Listing scopes** (`RulesetsRepository.findMany`, used by the create-character wizard, dashboard, etc.):

| `scope` query param | Returns |
|---|---|
| `myDrafts` | Draft rulesets where the user is owner OR active contributor |
| `published` | Rulesets the user can play with: public ones must be `status = 'Published'`; owned and contributed-to ones bypass the status gate (Draft is fine — `Published` only governs outward discoverability for *public* rulesets). `kind = 'ruleset'`. Powers the character-creation and campaign-creation pickers — extensions are filtered out so they're never offered as a playable target |
| `community` | Public Published user forks with `kind = 'ruleset'` (`userId IS NOT NULL`, `private = false`). Extensions (system or user) are filtered out — they live under the `extensions` scope |
| `campaignAccessible` | Rulesets the user has access to via campaign membership |
| `archived` | The user's archived rulesets (owner-only) |
| `extensions` | Published rulesets with `kind = 'extension'` — both system-seeded and user-published. Powers the subscribe-extension picker on a fork |
| `systems` | System-owned rulesets (`userId IS NULL`) — bases plus published system extensions. Used for sitemap/SEO |
| `starred` | Anything the user starred |
| `contributedTo` | Rulesets where the user is an active contributor |
| `createdByMe` / `createdByMePrivate` | Owned rulesets, with privacy filter |
| (no scope) | Default: everything the user can see (owned, system, campaign-accessible, contributed-to) |

**Where each ruleset type surfaces by scope:**

| Type / Scope | `published` | `community` | `extensions` | `systems` |
|---|---|---|---|---|
| Base (system) | – | – | – | ✓ |
| System extension (`kind='extension'`, `userId IS NULL`) | – | – | ✓ | ✓ |
| User fork as ruleset (`kind='ruleset'`) | ✓ | ✓ (if public) | – | – |
| User fork as extension (`kind='extension'`) | – | – | ✓ (if public) | – |

The character-creation wizard combines `published + campaignAccessible` (and historically `myDrafts`, now subsumed by `published` for owned/contributed drafts) to show the full eligible list. `myDrafts` is still useful as a focused "drafts I'm working on" filter.

## Characters — `CharactersPolicy`

Constructed with `(session, character, isActiveContributor?)`. The boolean comes from a lookup against `contributorsInCharacter` (status `Active`, not deleted). The schema has a `role` column (`Admin | Editor | Viewer`) for parity with ruleset contributors, but `CharacterContributorsService.inviteContributor` always creates rows as `Editor` and `CharactersPolicy` ignores the role — every active contributor has the same effective grant. The column is reserved for future tiering.

| Method | Allowed actors |
|---|---|
| `canCreate` | anyone (subject to the ruleset access check below) |
| `canRead` | anyone (per-character privacy is enforced at the campaign-character level via `link.visibility`, not here) |
| `canUpdate` | owner, active contributor. Throws on archived (soft-deleted) characters |
| `canDelete` | **owner only** (archive, not hard delete) |
| `canHardDelete` | **owner only**, must be archived, must not be linked to an *active* campaign (links to archived campaigns don't block). Throws `ConflictError` on active-campaign link. See [persistence.md](./persistence.md#recoverable-user-content) |
| `canManageContributors` | **owner only** |
| `canReadContributors` | owner, active contributor |

**Edit-permission lookup helper:** `Characters.findOneEditable(db, { id, userId })` returns the character iff the session user can edit it (owner OR active contributor). Most write services call this as their first guard so the rest of the function can assume edit rights.

**Character creation against a ruleset** — `CharactersService.createCharacter` does its own ruleset access check separate from `RulesetsPolicy`. The ruleset must be one of:

1. Public published (`!ruleset.private && status === "Published"`), OR
2. Owned by the session user, OR
3. The session user is an active contributor on it, OR
4. The session user is a player on a campaign that uses this ruleset.

If none match → `ForbiddenError "You do not have access to this ruleset"`.

## Campaigns — `CampaignsPolicy`

Constructed with `(session, campaign)`. No constructor flags; `canUpdate`/`canDelete` query `playersInCampaign` themselves.

| Method | Allowed actors |
|---|---|
| `canCreate` | anyone |
| `canRead` | anyone (privacy of contents enforced elsewhere) |
| `canUpdate` | **Game Master only** |
| `canDelete` | **Game Master only** (archive) |
| `canHardDelete` | **Game Master only**, must be archived. See [persistence.md](./persistence.md#recoverable-user-content) |

**Campaign character visibility** is *not* a CAS-protected surface — only the linking player can change visibility on their own character (`updateCharacterVisibility`'s policy throws `ForbiddenError "You do not own this character in this campaign"` for everyone else, including the GM). This is single-user contention by design.

**Partial visibility filtering**: `getCampaignCharacters` strips `description` and `levels` for characters with `visibility: "Partial"` when the viewer is neither the owner nor a GM.

**`canEdit` on the campaign-character detail response**: `getCampaignCharacter` returns both `isOwner` (link-slot ownership in the campaign) and `canEdit` (character owner OR active character contributor). The campaign character view uses `canEdit` to gate the "Edit Character" / "Download PDF" menu — `isOwner` is kept on the response for any future UI that needs the strict campaign-link semantics.

## Attachments — `AttachmentsService` registry

Attachments (avatars, character portraits) don't go through a `BasePolicy` subclass — they use a `registerAttachable(recordType, config)` registry where each `recordType` declares its own `isOwner` (write) and `isReader` (read) checkers. Writes throw `ForbiddenError "Not authorized to attach to this record"` when `isOwner` returns false.

| Record type | Write (`isOwner`) | Read (`isReader`) |
|---|---|---|
| `User` (avatar) | `session.userId === recordId` | any authenticated session |
| `Character` (portrait) | `character.userId === session.userId` — **owner only** | any authenticated session |

Note the divergence: a character's active contributor **can edit the character** via `CharactersPolicy.canUpdate` but **cannot upload or replace its portrait** — portrait writes are owner-only. If that's not the desired behavior, update the registered `isOwner` for `Character` to also accept active contributors.

Reads are intentionally permissive (`allowAuthenticated`) since avatar/portrait URLs add no exposure beyond pages that are already gated.

## Invites (rulesets / campaigns / character contributors)

The three invite lifecycles share the same shape:

| Action | Gate |
|---|---|
| Send / re-send / revoke an invite | The policy that gates managing the parent: `RulesetsPolicy.canManageContributors`, `CampaignsPolicy.canUpdate` (GM), or `CharactersPolicy.canManageContributors` (owner) |
| Accept / reject | Identity match: `invite.userId === session.userId` (or `contributor.userId === session.userId` for contributor rows). Throws `NotFoundError` rather than `ForbiddenError` to avoid leaking the existence of invites addressed to other users |
| Leave (self-remove from contributor or self-remove from campaign) | Identity match: must be holding the row being removed. Throws `NotFoundError` otherwise |

`acceptCampaignInvite`, `rejectCampaignInvite`, `acceptContributorInvite` (rulesets and characters), `leaveRuleset`, and `leaveCharacter` all follow this pattern. Campaign self-leave goes through `PlayersService.removePlayer` with the `isSelfRemoval = player.userId === session.userId` branch — same shape (identity match skips the GM gate). They're identity matches, not permission gates — see "Identity vs. policy" below.

## Customizations — `CustomizationsPolicy`

Modifiers, properties, and requirements live on a parent entity (a feat, item, klass, race, power, klass-level, modifier, or character). The policy only validates that the parent still exists; the actual gating delegates to whichever policy owns the parent:

- Customizations on a **ruleset entity** are gated by `RulesetsPolicy.canUpdateEntity` (owner / Admin / Editor).
- Customizations on a **character** (e.g. character modifiers) go through `CharactersService` and are gated by `Characters.findOneEditable` (owner / contributor).

`CustomizationsPolicy.sourceExists` resolves a display name for the parent — used both for activity logging and to fail closed if the parent has been deleted between policy construction and write.

## Ruleset entities — `RulesetEntitiesPolicy`

Stub class. All methods return `true`. Real authorization for these surfaces is on the parent ruleset (`RulesetsPolicy.canUpdateEntity`). The class exists so service code has a consistent `policy.canX()` shape regardless of entity type.

## Identity vs. policy

There are still a few inline `entity.userId === session.userId` checks in services. Those are **identity matches**, not permission gates — they're answering "is this me?" rather than "may I do this?". Keep them inline, don't move them into a policy:

- `acceptCampaignInvite` / `acceptContributorInvite`: "is this invite addressed to me?"
- OAuth-link checks: "did I just link this account to myself?"
- Self-removal predicates: `isSelfRemoval = player.userId === session.userId` branches behavior, doesn't gate it.
- Boolean predicates returned by attachment registration: `Attachable.isOwner = (s, id) => character?.userId === s.userId`.

Anything that *throws* on the basis of ownership is a permission gate and belongs in a policy. The CLAUDE.md's "Permission Checks (Policy vs. Identity)" section is the canonical guidance.

## Where each policy is wired

| Policy | Service callers |
|---|---|
| `RulesetsPolicy` | `RulesetsService`, all `*RulesetService` files under `server/services/rulesets/`, `ContributorsService` (rulesets), `ExtensionsService` |
| `CharactersPolicy` | `CharacterContributorsService`. Most other character writes use `Characters.findOneEditable` instead and skip the policy class — same effective rule, fewer object instantiations |
| `CampaignsPolicy` | `CampaignsService`, `PlayersService`, campaigns sub-services |
| `CustomizationsPolicy` | `ModifiersService`, `PropertiesService`, `RequirementsService` (rulesets/customization), `CharacterModifiersService` |
| `RulesetEntitiesPolicy` | nominal hook for ruleset entity services; real check is `getRulesetPolicy(...).canUpdateEntity()` |
| `AttachmentsService` registry | not a `BasePolicy` — uses `registerAttachable()` config map. Currently registered: `User` (avatar), `Character` (portrait) |
