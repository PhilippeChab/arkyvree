# Access & Authorization

This is the source of truth for who can do what across the app. Every gated mutation goes through one of the policy classes under `server/services/policies/` — services call them, policies throw `ForbiddenError` / `UnprocessableEntityError` / `ConflictError`, the throw propagates.

If you're adding a new mutation, find the matching row below and call the same policy method. If your case isn't covered, extend the policy — don't write inline `userId === session.userId` checks (see "Identity vs. policy" at the bottom).

A service builds a policy with `await XPolicy.for(db, session, entity)`, through its transaction's handle: `for` loads the session's standing on the entity (its contributor role on a ruleset or a character, its player row in a campaign). Every check is then sync: it reads that standing, and what the service passes it about other rows (`canDeleteEntity({ inUse })`, `canHardDelete({ inActiveCampaign })`), and throws or answers. A policy has no other static and no check queries (`arkyvree/policy-shape`); a test may build one with `new`, from a standing it sets.

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

`RulesetsPolicy.for(tx, session, ruleset)` loads the session's contributor role (`contributorsInRules`), and, on a ruleset that isn't public, whether it plays in a campaign on it (what lets it create there).

| Method | Allowed actors | Notes |
|---|---|---|
| `canUpdate` | owner, **Admin** | edits ruleset metadata (name, description, privacy, archive). Throws on base rulesets and Archived rulesets |
| `canUpdateEntity` | owner, **Admin**, **Editor** | edits entity content (feats, items, classes, …). Same archive guard |
| `canDeleteEntity({ inUse })` | owner, **Admin**, **Editor** | deletes individual entities. Throws if `inUse` (would orphan a character pick on this ruleset or any descendant fork). See [rulesets.md](./rulesets.md#what-inuse-means-in-entity-delete-services) |
| `canPublish` | **owner only** | Draft → Published; can't be delegated to Admin |
| `canFork` | anyone (any session) | source must be Published and be a base ruleset (`rulesetId IS NULL`) |
| `canSubscribeExtension` | **owner only** | private to the owner of the host fork |
| `canUnsubscribeExtension({ inUse })` | **owner only** | adds the in-use guard on top of `canSubscribeExtension` |
| `canManageContributors` | owner, **Admin** | invite / revoke / role-change |
| `canManageAdminContributors` | **owner only** | narrowing of the above for touching `Admin`-tier rows |
| `canReadContributors` | owner, any contributor | lists the contributors |
| `canUnarchive` | **owner only** | Archived → Draft |
| `canViewChanges` | public rulesets: anyone; private: owner + any contributor | overrides metadata |

Reading and listing rulesets is enforced by the `findPage` scopes, not the policy. Rulesets are never hard-deleted: they're archived (`canUpdate`).

**Listing scopes** (`RulesetsRepository.findPage`, used by the create-character wizard, dashboard, etc.):

| `scope` query param | Returns |
|---|---|
| `base` | System base rulesets: no owner, not a fork |
| `forked` | The user's own forks |
| `myDrafts` | Draft rulesets where the user is owner OR active contributor |
| `published` | Rulesets the user can play with: public ones must be `status = 'Published'`; owned and contributed-to ones bypass the status gate (Draft is fine — `Published` only governs outward discoverability for *public* rulesets). `kind = 'ruleset'`. Powers the character-creation and campaign-creation pickers — extensions are filtered out so they're never offered as a playable target |
| `community` | Public Published user forks with `kind = 'ruleset'` (`userId IS NOT NULL`, `private = false`). Extensions (system or user) are filtered out — they live under the `extensions` scope |
| `campaignAccessible` | Rulesets the user has access to via campaign membership |
| `archived` | The user's archived rulesets (owner-only) |
| `extensions` | Published rulesets with `kind = 'extension'` — both system-seeded and user-published. Powers the subscribe-extension picker on a fork |
| `systems` | System-owned rulesets (`userId IS NULL`) — bases plus published system extensions. Used for sitemap/SEO |
| `starred` | Anything the user starred |
| `contributedTo` | Rulesets where the user is an active contributor |
| `createdByMe` | Rulesets the user owns or actively contributes to |
| `createdByMePrivate` | The private rulesets the user owns |
| (no scope) | Default: everything the user can see (owned, system, campaign-accessible, contributed-to) |

**Where each ruleset type surfaces by scope:**

| Type / Scope | `published` | `community` | `extensions` | `systems` |
|---|---|---|---|---|
| Base (system) | ✓ | – | – | ✓ |
| System extension (`kind='extension'`, `userId IS NULL`) | – | – | ✓ | ✓ |
| User fork as ruleset (`kind='ruleset'`) | ✓ | ✓ (if public) | – | – |
| User fork as extension (`kind='extension'`) | – | – | ✓ (if public) | – |

The character-creation wizard combines `published + campaignAccessible` (and historically `myDrafts`, now subsumed by `published` for owned/contributed drafts) to show the full eligible list. `myDrafts` is still useful as a focused "drafts I'm working on" filter.

## Characters — `CharactersPolicy`

`CharactersPolicy.for(tx, session, character)` loads whether the session is an active contributor (`contributorsInCharacter`, status `Active`, not deleted). The schema has a `role` column (`Admin | Editor | Viewer`) for parity with ruleset contributors, but `CharacterContributorsService.inviteContributor` always creates rows as `Editor` and `CharactersPolicy` ignores the role — every active contributor has the same effective grant. The column is reserved for future tiering.

| Method | Allowed actors |
|---|---|
| `canHardDelete({ inActiveCampaign })` | **owner only**, must be archived, must not be linked to an *active* campaign (links to archived campaigns don't block): the service looks the link up. Throws `ConflictError` on active-campaign link. See [persistence.md](./persistence.md#recoverable-user-content) |
| `canManageContributors` | **owner only** |
| `canReadContributors` | owner, active contributor |

**Editing and archiving aren't policy methods.** `getEditableCharacter(db, session, characterId)` (`server/services/characters/editableCharacter.ts`, over `Characters.findOne(db, { id, editorId })`) returns the character iff the session user can edit it (owner OR active contributor), or a 404, and the write services call it as their first guard so the rest of the function can assume edit rights. Archiving looks the character up by its owner (`Characters.findOne(db, { id, userId })`): anyone else gets a 404. Reading a character in a campaign is gated by the link's visibility (`link.visibility`); creating one, by the ruleset access check below.

**Character creation against a ruleset** — `CharactersService.createCharacter` calls `RulesetsPolicy.canCreateCharacter` (through `RulesetsPolicy.for`), and `CampaignsService` calls `canCreateCampaign`, which applies the same rule. A deleted ruleset is a 404 (`Ruleset not found`) before the policy runs; an extension or an archived ruleset is refused (`UnprocessableEntityError "Choose an active playable ruleset"`). Otherwise the ruleset must be one of:

1. Public published (`!ruleset.private && status === "Published"`), OR
2. Owned by the session user, OR
3. The session user is an active contributor on it, OR
4. The session user is a player on a campaign that uses this ruleset.

If none match → `ForbiddenError "You do not have access to this ruleset"`.

Campaign character responses redact private notes for viewers without character edit rights or GM status. Share tokens are returned only to character editors. Partial responses explicitly allow identity and metadata, and clear equipment, skill budget, virtual abilities, spell tags, validation details, and bonded sheets as well as the normal build fields.

## Campaigns — `CampaignsPolicy`

`CampaignsPolicy.for(tx, session, campaign)` loads the session's player row (`playersInCampaign`), an archived one too. The PDF worker, which has no session, builds one for the export's user and asks `isGameMaster()`.

| Method | Allowed actors |
|---|---|
| `canRead` | any member, Player or Game Master, of the campaign archived or not: returns their player row. Reading a campaign, its players, invites and characters starts with it (an unknown campaign is a 404 first) |
| `canUpdate` | **Game Master only**, by an active player row (`isGameMaster`) |
| `canDelete` | **Game Master only** (archive), an archived player row too |
| `canHardDelete` | **Game Master only**, must be archived. See [persistence.md](./persistence.md#recoverable-user-content) |
| `canModify` | anyone the other checks allow, on a campaign that isn't archived (archived campaigns are read-only; a Game Master can still revoke an invite) |

**Campaign character visibility** is *not* a CAS-protected surface — only the linking player can change visibility on their own character (`updateCharacterVisibility` throws `ForbiddenError "You do not own this character in this campaign"` for everyone else, including the GM: an identity match on the link's player). This is single-user contention by design.

**Partial visibility filtering**: `CampaignCharactersService.getCharacters` strips `description` and `levels` for characters with `visibility: "Partial"` when the viewer is neither the owner nor a GM.

**`canEdit` on the campaign-character detail response**: `CampaignCharactersService.getCharacter` returns `isOwner` (link-slot ownership in the campaign), `canEdit` (character owner OR active character contributor), and `canDownloadPdf` (`canEdit` OR Game Master). The campaign character view shows "Edit Character" to `canEdit` only, and "Download PDF" to `canDownloadPdf` — `isOwner` is kept on the response for any future UI that needs the strict campaign-link semantics.

**PDF export of a campaign character** (`POST /campaigns/:id/characters/:characterId/pdf`): the character must be linked to the campaign; its editors and the Game Master may export it, whatever its visibility, since the GM already sees the full sheet. Archived campaigns still allow it: archiving makes a campaign read-only, and its character pages stay viewable. Every refusal is a 404, as for the character's own `POST /characters/:id/pdf`. Both go through `findExportableCharacter`, which the PDF worker runs again when the job starts, so access lost in between cancels the export.

## Attachments — `AttachmentsService` registry

Attachments (avatars, character portraits) don't go through a `BasePolicy` subclass — they use the `ATTACHABLE_TYPES` map in `AttachmentsService`, where each record type declares its own `isOwner` (write) and `isReader` (read) checkers. Writes throw `ForbiddenError "Not authorized to attach to this record"` when `isOwner` returns false.

| Record type | Write (`isOwner`) | Read (`isReader`) |
|---|---|---|
| `User` (avatar) | `session.userId === recordId` | any authenticated session |
| `Character` (portrait) | a player character's **owner only**; a bonded character's: whoever can edit its master (owner or contributor) | any authenticated session |

Note the divergence: a character's active contributor **can edit the character** (`getEditableCharacter`) but **cannot upload or replace its portrait** — a player character's portrait writes are owner-only. If that's not the desired behavior, change `Character`'s `isOwner` in `ATTACHABLE_TYPES` to also accept active contributors.

Reads are intentionally permissive (`canAnySessionRead`, `attachments/readers.ts`) since avatar/portrait URLs add no exposure beyond pages that are already gated.

## Invites (rulesets / campaigns / character contributors)

The three invite lifecycles share the same shape:

| Action | Gate |
|---|---|
| Send / re-send / revoke an invite | The policy that gates managing the parent: `RulesetsPolicy.canManageContributors`, `CampaignsPolicy.canUpdate` (GM), or `CharactersPolicy.canManageContributors` (owner) |
| Accept / reject | Identity match: `invite.userId === session.userId` (or `contributor.userId === session.userId` for contributor rows). Throws `NotFoundError` rather than `ForbiddenError` to avoid leaking the existence of invites addressed to other users |
| Leave (self-remove from contributor or self-remove from campaign) | Identity match: must be holding the row being removed. Throws `NotFoundError` otherwise |

The invite services' `acceptInvite` and `rejectInvite` (campaigns, rulesets and characters), `leaveRuleset`, and `leaveCharacter` all follow this pattern. Campaign self-leave goes through `CampaignPlayersService.removePlayer` with the `isSelfRemoval = player.userId === session.userId` branch — same shape (identity match skips the GM gate). They're identity matches, not permission gates — see "Identity vs. policy" below.

## Customizations

Modifiers, properties, and requirements live on a parent entity (a feat, item, klass, race, power, klass-level, modifier, or character). They have no policy of their own: the gating is whichever policy owns the parent's, and `customizableEntities.ts` (`server/services/rulesets/customization/`) checks that the parent exists:

- Customizations on a **ruleset entity** are gated by `RulesetsPolicy.canUpdateEntity` (owner / Admin / Editor).
- Customizations on a **character** (e.g. character modifiers) go through `CharactersService` and are gated by `getEditableCharacter` (owner / contributor).

`getCustomizableEntityName` is a 404 when the parent doesn't exist (within the composed ruleset when given one), and returns its display name for activity logging; `checkCustomizedEntity` checks an existing customization's parent the same way before an update or a delete.

## Identity vs. policy

There are still a few inline `entity.userId === session.userId` checks in services. Those are **identity matches**, not permission gates — they're answering "is this me?" rather than "may I do this?". Keep them inline, don't move them into a policy:

- The invite services' `acceptInvite`: "is this invite addressed to me?"
- OAuth-link checks: "did I just link this account to myself?"
- Self-removal predicates: `isSelfRemoval = player.userId === session.userId` branches behavior, doesn't gate it.
- Boolean predicates returned by attachment registration: `Attachable.isOwner = (s, id) => character?.userId === s.userId`.

Anything that *throws* on the basis of ownership is a permission gate and belongs in a policy. The "Permission Checks (Policy vs. Identity)" section of [AGENTS.md](../AGENTS.md) is the canonical guidance.

## Where each policy is wired

| Policy | Service callers |
|---|---|
| `RulesetsPolicy` | `RulesetsService`, `RulesetExtensionsService` (subscribe / unsubscribe), `RulesetChangesService`, the entity services under `server/services/rulesets/` and `ContributorsService` (rulesets), through `RulesetsPolicy.for`. `CampaignsService` / `CharactersService` call `canCreateCampaign` / `canCreateCharacter` on the chosen ruleset |
| `CharactersPolicy` | `CharacterContributorsService`. Most other character writes use `getEditableCharacter` instead and skip the policy class — same effective rule, fewer object instantiations |
| `CampaignsPolicy` | `CampaignsService`, `CampaignPlayersService`, campaigns sub-services |
| `AttachmentsService` registry | not a `BasePolicy` — uses its `ATTACHABLE_TYPES` config map. Currently registered: `User` (avatar), `Character` (portrait) |

Campaign creation validates ruleset access before inserting the campaign or GM membership. It uses the character-creation access policy: public published, owner, contributor, or existing active campaign membership. Archived rulesets and extensions cannot be used to create campaigns or characters. A newly requested campaign cannot grant its own ruleset access.
