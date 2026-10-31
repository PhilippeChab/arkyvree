# Access & Authorization

This is the source of truth for who can do what across the app. Every gated mutation goes through one of the policy classes under `server/services/policies/` — services call them, policies throw `ForbiddenError` / `UnprocessableEntityError` / `ConflictError` (and `NotFoundError` where a refusal mustn't reveal the row: `RulesetsPolicy.canRead`, `CampaignsPolicy.canRead`, `CampaignsPolicy.canSeeCharacter`, `CharactersPolicy.canRead`), the throw propagates.

If you're adding a new mutation, find the matching row below and call the same policy method. If your case isn't covered, extend the policy — don't write inline `userId === session.userId` checks (see "Identity vs. policy" at the bottom).

A service builds a policy with `await XPolicy.for(db, session, entity)`, through its transaction's handle (a policy whose list asks it of each row builds the page's with `forMany(db, session, entities)`, each what `for` builds: `CharactersPolicy.forMany`, for the campaign roster): `for` loads the session's standing on the entity (its contributor role on a ruleset or a character, its player row in a campaign). Every check is then sync: it reads that standing, and what the service passes it about other rows (`canDeleteEntity({ inUse })`, `canHardDelete({ inActiveCampaign })`), and throws or answers. A policy has no other static (`for`, and `forMany` where a list needs one) and no check queries (`arkyvree/policy-shape`); a test may build one with `new`, from a standing it sets.

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

`RulesetsPolicy.for(tx, session, ruleset)` loads the session's contributor role (`contributorsInRules`: a system ruleset has none); on a ruleset that isn't public, whether it has a live seat in a campaign on it, and whether one is in a live campaign (`Players.findSeat(db, { userId, rulesetId })`: a seat in a campaign archived or not, who may read the campaign, `CampaignsPolicy.canRead`, lets it read the ruleset; one in a live campaign lets it create there); and, on a private ruleset it has no other standing on, whether it edits a character built on it (`Characters.exists(db, { editorId, rulesetId })`: owns one, or actively contributes to one, archived or not; what lets it read it). A removed player's seat is deleted, and a seat is archived only with its user's account, which no session signs in to, so neither gives anything.

| Method | Allowed actors | Notes |
|---|---|---|
| `canUpdate` | owner, **Admin** | edits ruleset metadata (name, description, privacy, archive). Throws on a ruleset without an owner (a system one, or an orphan: see below) and on Archived rulesets |
| `canUpdateEntity` | owner, **Admin**, **Editor** | edits entity content (feats, items, classes, …). Same archive guard |
| `canDeleteEntity({ inUse })` | owner, **Admin**, **Editor** | deletes individual entities. Throws if `inUse` (would orphan a character pick on this ruleset or any descendant fork). See [rulesets.md](./rulesets.md#what-inuse-means-in-entity-delete-services) |
| `canPublish` | **owner only** | Draft → Published; can't be delegated to Admin |
| `canFork` | anyone (any session) | source must be Published and be a base ruleset (`rulesetId IS NULL`) |
| `canBeExtension` | anyone (any session) | whether the ruleset can be published as an extension, or made one: a fork that subscribes to no extension. Publishing and editing ask it after `canPublish` and `canUpdate` |
| `canSubscribeExtension({ usedAsExtension })` | **owner only** | the host must be a live fork that isn't an extension, and no other ruleset may subscribe to it (`usedAsExtension`) |
| `canUnsubscribeExtension({ inUse })` | **owner only** | `canSubscribeExtension`, used as an extension or not, plus the in-use guard |
| `canManageContributors` | owner, **Admin** | managing contributors, archived or not: what every check below starts with |
| `canManageAdminContributors` | **owner only** | narrowing of the above for touching `Admin`-tier rows |
| `canInviteContributors({ role })` | owner, **Admin** | on a ruleset that isn't archived (`ConflictError`); an Admin (`role`), the owner only |
| `canRevokeContributor({ role })` | owner, **Admin** | archived or not; an Admin (`role`), the owner only |
| `canUpdateContributorRole({ from, to })` | owner, **Admin** | on a ruleset that isn't archived (`ConflictError`); to or from Admin, the owner only |
| `canRead` | public rulesets: anyone; private: owner, any active contributor, a member (any role) of a campaign on it, archived or not, the owner or an active contributor of a character built on it | every request that names the ruleset by its id, a read or a write, asks it first. Throws `NotFoundError "Ruleset not found"`, the 404 an unknown ruleset gets, so a private ruleset's existence isn't revealed. `isReadable` answers the same yes or no |
| `canReadContributors` | owner, any contributor | lists the contributors |
| `canUnarchive` | **owner only** | Archived → Draft |
| `canViewChanges` | public rulesets: anyone; private: owner + any contributor | overrides metadata |

A ruleset page offers what these answer (`permissions`, `GET /api/rulesets/:id`, which `useRulesetPermissions` reads): editing its entities and the ruleset, forking it, unarchiving it, seeing its contributors, inviting and managing them, changing their roles (`canUpdateContributorRole()`), managing its Admins, publishing it, subscribing it to extensions and unsubscribing it from one (whether a character uses what would leave is answered when it's asked), seeing its local changes (`canViewChanges`), and whether it can be an extension. The client rebuilds none of them. It reads the owner itself in two places only, neither a right it rebuilds: the archive dialog, to say whether its archiver could unarchive it, which `canUnarchive` answers only once it's archived, and the menu's Help link, which isn't a right.

Listing rulesets is enforced by the `findPage` scopes, not the policy. Every request that names a ruleset by its id goes through `canRead` before any other check: a read of it or of what's under it (its entities, owned entities, groups, templates, tables, progression, links, modifiers, requirements, target paths, Settings, extensions, changes, contributors, a new character's creation picks), and a write (its update, archive, unarchive, publish, fork and star, its contributors' invites, role changes, revokes and leave, its Settings, its entities', links', progressions', variants', customizations' and restores' saves, its extensions' subscribes and unsubscribes, and a character, an import or a campaign created on it). The services start with `getReadableRuleset` or `withReadableRuleset` (`server/services/rulesets/readableRuleset.ts`), which look the ruleset up, ask it, and hand on the policy, whose write checks (`canUpdate`, `canUpdateEntity`, `canCreateCharacter`…) then refuse a reader who may not write with their 403. Whoever may not read it gets the answer an unknown id gets, the same status and body, whatever else the request would have been refused for: a contributor's role change or revoke a contributor of a ruleset the session may not read is answered as an unknown contributor (`Contributor not found`), and an extension it may not read as an unknown one (`Extension not found`). An activity links to a ruleset, its content, its customizations and its contributors only when the session may read it (`findReadableRuleset`). `canViewChanges` and `canReadContributors` narrow reading further. A ruleset read as another's ancestor or extension, through that ruleset's view, isn't read by its id: its readers are that ruleset's. A character's reads (its sheet, its level-up, its inventory, its PDF) are gated by the character, not its ruleset. Rulesets are never hard-deleted: they're archived (`canUpdate`).

**What a refusal names.** A check on a change to a ruleset reads what the change reaches: the ruleset's view, and the rulesets built on it (`buildLineageCondition`: a fork of it, an extension's subscribers), which may be other users' private rulesets. What it finds in those it never names: the in-use check answers yes or no (`canDeleteEntity({ inUse })`), and a template's type change names an item its ruleset's view shows and counts those of the rulesets built on it (`ItemEntity.planEdit`). What no change of the ruleset reaches (another fork's items, made from the original or its own copy) isn't read at all.

**Listing scopes** (`RulesetsRepository.findPage`, used by the create-character wizard, dashboard, etc.):

| `scope` query param | Returns |
|---|---|
| `base` | System base rulesets: `system`, not a fork |
| `forked` | The user's own forks |
| `myDrafts` | Draft rulesets where the user is owner OR active contributor |
| `published` | Rulesets the user can play with: public ones must be `status = 'Published'`; owned and contributed-to ones bypass the status gate (Draft is fine — `Published` only governs outward discoverability for *public* rulesets). `kind = 'ruleset'`. Powers the character-creation and campaign-creation pickers — extensions are filtered out so they're never offered as a playable target |
| `community` | Public Published user forks with `kind = 'ruleset'` (`system = false`, `private = false`). Extensions (system or user) are filtered out — they live under the `extensions` scope |
| `campaignAccessible` | Rulesets the user has access to via campaign membership |
| `archived` | The user's archived rulesets (owner-only) |
| `extensions` | Published rulesets with `kind = 'extension'` — both system-seeded and user-published. Powers the subscribe-extension picker on a fork |
| `systems` | System rulesets (`system`) — bases plus published system extensions. Used for sitemap/SEO |
| `starred` | Anything the user starred |
| `contributedTo` | Rulesets where the user is an active contributor |
| `createdByMe` | Rulesets the user owns or actively contributes to |
| `createdByMePrivate` | The private rulesets the user owns |
| (no scope) | Default: everything the user can see (owned, system, campaign-accessible, contributed-to) |

**Where each ruleset type surfaces by scope:**

| Type / Scope | `published` | `community` | `extensions` | `systems` |
|---|---|---|---|---|
| Base (system) | ✓ | – | – | ✓ |
| System extension (`kind='extension'`, `system`) | – | – | ✓ | ✓ |
| User fork as ruleset (`kind='ruleset'`) | ✓ | ✓ (if public) | – | – |
| User fork as extension (`kind='extension'`) | – | – | ✓ (if public) | – |

**A system ruleset is one `system` marks, not one without an owner.** Deleting an account leaves its rulesets without an owner (`Rulesets.orphan`), `system` still false. Such an orphaned ruleset is still a user's: the scopes list it by its privacy, a public one in `community` or `extensions`, a private one to its contributors and campaign members (and in `starred` to whoever starred it), and `RulesetsPolicy` reads it so: its contributors keep their role, so they read it, see its changes and its contributors, create characters, imports and campaigns on it, and leave it. It is frozen as its owner left it: with nobody left to manage its Admins, publish it or unarchive it, every change is refused to everyone, an Admin's and an Editor's too (`RulesetRoles.checkOwned`: its entities, the ruleset itself, its contributors, its publish, archive and unarchive, its extensions), with "… a ruleset without an owner", where a system ruleset's refusal says "… a base ruleset". An extension subscribed to must be public unless it's a system one, so an orphaned private extension is refused.

The character-creation wizard combines `published + campaignAccessible` (and historically `myDrafts`, now subsumed by `published` for owned/contributed drafts) to show the full eligible list. `myDrafts` is still useful as a focused "drafts I'm working on" filter.

## Characters — `CharactersPolicy`

`CharactersPolicy.for(tx, session, character)` loads, for a player character, whether the session is an active contributor (`contributorsInCharacter`, status `Active`; `forMany` reads a page's player characters' at once, the campaign roster's, a child's still as `for` does), and for a child (3.5's bonded creature) whether it edits its parent, a player character archived or not (the parent's own policy's `isEditor`), and whether that parent is archived: a child is its parent's editors', a player character its own editors' alone. The schema has a `role` column (`Admin | Editor | Viewer`) for parity with ruleset contributors, but `CharacterContributorsService.inviteContributor` always creates rows as `Editor` and `CharactersPolicy` ignores the role — every active contributor has the same effective grant. The column is reserved for future tiering.

| Method | Allowed actors |
|---|---|
| `isReadable` | a player character's owner and active contributors (its editors), a child's parent's, archived or not: the character's sheet (`CharactersService.getCharacter`), a revoke of one of its contributors and an activity's link to it, through `findReadableCharacter`. Anyone else gets the answer an unknown character gets |
| `isEditable` | its readers, while neither it nor a child's parent is archived: its sheet's edit, its picks' picker and its PDF export, through `findEditableCharacterOrChild` |
| `isEditor` | a player character's owner and active contributors, archived or not (a child has none: its own rows are its parent's): its own rows' reads and writes (its levels, scores, inventory, modifiers), through `getEditableCharacter`; a campaign character's `canEdit`, on its page and in the roster (`CampaignCharactersService`) |
| `isPortraitEditable` | `isEditable`, and a player character's **owner only** (a child's, any of its parent's editors): its portrait's `isOwner` (below) |
| `canArchive` | **owner only**, of a player character, archived or not: archive and unarchive. Anyone else, its contributors too, gets the 404 an unknown character gets |
| `canHardDelete({ inActiveCampaign })` | `canArchive`, must be archived, must not be linked to an *active* campaign (links to archived campaigns don't block): the service looks the link up. Throws `ConflictError` on active-campaign link. See [persistence.md](./persistence.md#recoverable-user-content) |
| `canShare` | `canArchive`'s owner, while it isn't archived: creating and revoking its share token |
| `canLink` | `canArchive`'s owner: linking it to a campaign (`CampaignCharactersService.linkCharacter`, after the campaign's own `canLinkCharacter`) |
| `canReadContributors` | its editors (`isEditor`): listing its contributors, and leaving them (`leaveCharacter`, then an identity match on the session's active row). Anyone else gets the 404 an unknown character gets |
| `canManageContributors` | `canReadContributors`, then **owner only** (a contributor gets `ForbiddenError`): revoking a contributor |
| `canInviteContributors` | `canManageContributors`, on a character that isn't archived (`ConflictError`) |

Whoever may not read a character gets the answer an unknown id gets on its contributors, the same status and body: its list, an invite and a leave (`Character not found`), and a revoke of one of its contributors (`Contributor not found`, as an unknown contributor). An activity links to a character, its levels, its inventory and its contributors only when the session may read it (`findReadableCharacter`), archived or not; a character contributor's, its invitee to the invite while it's pending, and to no access once it's revoked or rejected. `CharactersService.getCharacter` answers what its reader may do with it, as `permissions`, each from the policy (a check through `isAllowed`, `server/services/policies/isAllowed.ts`, as `RulesetsService.getRuleset` does): `canArchive`, `canEdit` (`isEditable`), `canEditPortrait` (`isPortraitEditable`), `canInviteContributors`, `canLeave` (an active contributor), `canManageContributors`, `canReadContributors` and `canShare`. The client's `useCharacterPermissions` reads them, and decides only what a demo user is spared.

**A player character's own rows are edited through `getEditableCharacter`.** `getEditableCharacter(db, session, characterId, visibility)` (`server/services/characters/editableCharacter.ts`) looks the character up (unarchived, or archived too with `Visibility.All`, for its inventory's read) and returns it iff its policy's `isEditor` holds (owner OR active contributor of a player character), or a 404, and the services that write its levels, scores, inventory and modifiers call it as their first guard so the rest of the function can assume edit rights; a child's own rows are refused, its levels being its parent's. `findEditableCharacterOrChild(db, characterId, userId)` (same module) looks the character up unarchived and asks its policy's `isEditable`, a child through its parent. `findReadableCharacter(db, session, characterId)` (same module) looks the character up, archived or not, and hands on it and its policy iff its policy's `isReadable` holds, or nothing, as for an unknown character. Who edits a character is decided there alone: the repositories' `editorId` filter is a list's (`Characters.exists(db, { editorId, rulesetId })`, which `RulesetsPolicy` asks), never one character's. Reading a character in a campaign is gated by the link's visibility (`link.visibility`); creating one, by the ruleset access check below.

**Character creation against a ruleset** — `CharactersService.createCharacter` calls `RulesetsPolicy.canCreateCharacter` (through `withReadableRuleset`), and `CampaignsService` calls `canCreateCampaign` (through `getReadableRuleset`), which applies the same rule. A deleted ruleset, or one the session may not read (`canRead`), is a 404 (`Ruleset not found`) before the policy runs; an extension or an archived ruleset is refused (`UnprocessableEntityError "Choose an active playable ruleset"`). Otherwise the ruleset must be one of:

1. Public published (`!ruleset.private && status === "Published"`), OR
2. Owned by the session user, OR
3. The session user is an active contributor on it, OR
4. The session user is a player, from a live seat, on a live campaign that uses this ruleset (a member of an archived campaign reads the ruleset, but doesn't create on it).

If none match → `ForbiddenError "You do not have access to this ruleset"`.

Campaign character responses leave the private notes out of the identity's block for viewers without character edit rights or GM status (a bonded creature shows in its master's sheet as a subsheet, which holds no notes; its own sheet goes to its editors alone); the client shows the field when the answer holds it, read-only there. The character's own sheet (`GET /characters/:id`) goes to its editors alone, private notes included, and a share link's response leaves them out. Share tokens are returned only to character editors: a share token is the server's access decision alone. The engine's sheet answers none (its `shareToken` `null`, `CharacterColumns`), and the service that knows the session's rights writes it: the character's own sheet (`CharactersService.getCharacter`, its editors') its row's, a campaign character's (`CampaignCharactersService.getCharacter`) its row's for an editor and `null` for anyone else, and a share link's the token its reader sent, which they hold already. A Partial response (the engine's `character(input).describeForMember`, its `partial` reading) is an explicit allowlist, which the core's characters part builds from its shapes' declared keys whatever the ruleset answers (`PartialSheets`, `PartialSheet`): the character's row's columns and ruleset, `shareToken` `null`, empty `requirements` and `modifiers`, a valid `validation`, a summary with no tracks, and its identity's `fields` block alone, its head and its fields without its picked links or notes. Which fields that block holds is its ruleset's (`describePartial`: 3.5's race and physical traits, age, gender, height, weight): no description, languages, beliefs, notes, level or build. A printed sheet reads as its route does (`describeSheet`'s reading): a share link's PDF without the private notes, the PDF export's (a character's editors, its campaign's Game Master) with them; neither is built from the share token.

## Campaigns — `CampaignsPolicy`

`CampaignsPolicy.for(tx, session, campaign)` loads the session's live player row (`playersInCampaign`), in a campaign archived or not: archiving a campaign leaves its seats alone, and a seat is archived only with its user's account, which no session signs in to (0096 restored the seats a campaign archived before then had archived with it). The PDF worker, which has no session, builds one for the export's user and asks `isGameMaster()`.

| Method | Allowed actors |
|---|---|
| `canRead` | any member, Player or Game Master, of the campaign archived or not: returns their player row. Every request that names the campaign by its id, a read or a write, asks it first (below). Anyone else, a pending invitee, a removed player or a seat archived with its account among them, gets `NotFoundError "Campaign not found"`, the 404 an unknown campaign gets, so a campaign's existence isn't revealed. `isReadable` answers the same yes or no |
| `canSeeCharacter` | a member, on a character linked to the campaign; a **Private** one its linking player and the Game Master alone (`isGameMaster`), refused to the others as a 404, as a character not linked is: the campaign character's page (`CampaignCharactersService.getCharacter`) and an activity's link to it (`findVisibleCampaignCharacter`, which answers none) |
| `canUpdate` | **Game Master only** (`isGameMaster`) |
| `canManagePlayers` | **Game Master only**, on a campaign that isn't archived (`canModify` and `canUpdate`): adding a player, editing one, and removing another's seat (`CampaignPlayersService`) |
| `canDelete` | **Game Master only** (archive and unarchive) |
| `canHardDelete` | **Game Master only**, must be archived. See [persistence.md](./persistence.md#recoverable-user-content) |
| `canModify` | anyone the other checks allow, on a campaign that isn't archived (archived campaigns are read-only; a Game Master can still revoke an invite) |
| `canLinkCharacter` | any member, Player or Game Master, of a campaign that isn't archived (a seat, `canRead`, and `canModify`): linking a character (`CampaignCharactersService.linkCharacter`), and listing those the session could link, so the link dialog lists only what linking accepts (`GET /characters/unlinked/:campaignId`, `getLinkableCharacters`: the session's own player characters on the campaign's ruleset, in no campaign yet) |

Every request that names a campaign by its id goes through `canRead`, and whoever may not read the campaign gets the answer an unknown id gets before anything else would refuse them: a read of it or of what's under it (the campaign, its players, invites and characters, a character of it, the characters the session could link to it), and a write (its update, archive, unarchive and permanent delete, its players' slots added, changed and removed, a character linked, a linked character's visibility, a linked character's PDF). The services start with `getReadableCampaign` (`server/services/campaigns/readableCampaign.ts`), which looks the campaign up (of the state the request acts on: a live one for an update or an archive, an archived one for an unarchive or a permanent delete, either otherwise), asks it, and hands on the policy and the session's seat, whose write checks (`canUpdate`, `canDelete`, `canModify`…) then refuse a member who may not write with their 403. Whoever may not read it gets the answer an unknown id gets, the same status and body, whatever else the request would have been refused for. An invite's revoke (`revokeInvite`), which names the invite, looks up its slot, archived or not, and its campaign (`findReadableCampaign`) first, and answers whoever may not read the campaign as an unknown invite (`Invite not found`). A linked character's PDF looks the character's link to the campaign up first (`findExportableCharacter`), then asks `isReadable`: whoever may not read the campaign, its editor too, gets what the export of an unknown campaign gets (`Character not found in this campaign`), either way. An activity links to a campaign, its players and invites only when the session may read it (`findReadableCampaign`), and to a campaign's character only when the session sees it there (`findVisibleCampaignCharacter`, which asks `canSeeCharacter`); a campaign invite's, its invitee to the invite (`/campaign-invite/:inviteId`, whose page says what became of an answered or revoked one) until they've accepted it. The invite flow reads by the invite, never the campaign's id: its invitee reads it (`GET /campaigns/invites/:inviteId`, the campaign's name and state with it), accepts or rejects it, and reads the campaign once they've accepted it.

**Campaign character visibility** is *not* a CAS-protected surface — only the linking player can change visibility on their own character (`updateCharacterVisibility` throws `ForbiddenError "You do not own this character in this campaign"` for every other member, including the GM: an identity match on the link's player; a non-member gets the 404 an unknown campaign gets first, `canRead`). This is single-user contention by design.

**Partial visibility filtering**: who sees a Partial character trimmed is decided one way, for the roster and the character page alike (`CampaignCharactersService`'s `isPartial`): anyone but the link's player, the Game Master and the character's editors (`CharactersPolicy.isEditor`: its owner, or an active contributor; the roster reads the session's contributions to its page's characters in one query). `getCharacters` sends such a character with its name and its race's chip only: its card is the engine's for a partial reader (`CharactersPart.describeCard`, through `describeCharacterCards`, which the character lists' cards are too), its `description` `null` and its chips those its ruleset marks as its partial reading's; every card, whole or partial, is described from its row without its private notes or share token, each chip its declared keys alone. The service adds the link's facts alone (`visibility`, `isOwn`) and `isPartial: true`, which its card reads to say its identity is private (`PARTIAL_IDENTITY_NOTE`, the sheet's words) rather than that it has no description.

**`canEdit` on the campaign-character detail response**: `CampaignCharactersService.getCharacter` returns `isOwner` (link-slot ownership in the campaign), `canEdit` (`CharactersPolicy.isEditor`: character owner OR active character contributor), and `canDownloadPdf` (`canEdit` OR Game Master). The campaign character view shows "Edit Character" to `canEdit` only, and "Download PDF" to `canDownloadPdf` — `isOwner` is kept on the response for any future UI that needs the strict campaign-link semantics.

**PDF export of a campaign character** (`POST /campaigns/:id/characters/:characterId/pdf`): the character must be linked to the campaign, which the session may read (a member); its editors and the Game Master may export it, whatever its visibility, since the GM already sees the full sheet. Archived campaigns still allow it: archiving makes a campaign read-only, and its character pages stay viewable. Every refusal is a 404, as for the character's own `POST /characters/:id/pdf`. Both go through `findExportableCharacter`, which the PDF worker runs again when the job starts, so access lost in between cancels the export.

## Attachments — `AttachmentsService` registry

Attachments (avatars, character portraits) don't go through a `BasePolicy` subclass — they use the `ATTACHABLE_TYPES` map in `AttachmentsService`, where each record type declares its own `isOwner` (write) checker. Writes throw `ForbiddenError "Not authorized to attach to this record"` when `isOwner` returns false.

| Record type | Write (`isOwner`) | Read |
|---|---|---|
| `User` (avatar) | `session.userId === recordId` | any authenticated session |
| `Character` (portrait) | a player character's **owner only**; a bonded character's: whoever can edit its master (owner or contributor). Both unarchived, through `CharactersPolicy.isPortraitEditable` | any authenticated session |

Note the divergence: a character's active contributor **can edit the character** (`getEditableCharacter`) but **cannot upload or replace its portrait** — a player character's portrait writes are owner-only. If that's not the desired behavior, change `CharactersPolicy.isPortraitEditable` to also accept active contributors: the character page offers what it answers.

Reads are intentionally permissive, with no check of their own, since avatar/portrait URLs add no exposure beyond pages that are already gated: a record type that needs one adds its read checker to `ATTACHABLE_TYPES`.

## Invites (rulesets / campaigns / character contributors)

The three invite lifecycles share the same shape:

| Action | Gate |
|---|---|
| Send / re-send / revoke an invite | The policy that gates managing the parent: `RulesetsPolicy.canInviteContributors({ role })` and `canRevokeContributor({ role })`, `CampaignsPolicy.canManagePlayers` to send (GM, a campaign that isn't archived) and `canUpdate` to revoke (GM, an archived campaign's too), or `CharactersPolicy.canManageContributors` (owner) |
| Accept / reject | Identity match: `invite.userId === session.userId` (or `contributor.userId === session.userId` for contributor rows). Throws `NotFoundError` rather than `ForbiddenError` to avoid leaking the existence of invites addressed to other users |
| Leave (self-remove from contributor or self-remove from campaign) | Identity match: must be holding the row being removed. Throws `NotFoundError` otherwise |

The invite services' `acceptInvite` and `rejectInvite` (campaigns, rulesets and characters), `leaveRuleset`, and `leaveCharacter` all follow this pattern. Campaign self-leave goes through `CampaignPlayersService.removePlayer` with its own seat's branch (`player.userId === session.userId`) — same shape (identity match skips the GM gate). They're identity matches, not permission gates — see "Identity vs. policy" below.

## Customizations

Modifiers, fields, and requirements live on a parent entity (a feat, item, class, race, spell, class level, modifier, or character), fields on a ruleset too. They have no policy of their own: the gating is whichever policy owns the parent's, and the engine's customization operations check that the parent exists in the ruleset's view (`CustomizedEntity`, `engine/core/customizations/`):

- Customizations on a **ruleset entity** are gated by `RulesetsPolicy.canUpdateEntity` (owner / Admin / Editor). Its fields are written by its own save, gated as its save is; a ruleset's own, its Settings (`RulesetSettingsService.updateSettings`), by `canUpdateEntity` too: who edits its content edits them, never a system ruleset.
- Customizations on a **character** (e.g. character modifiers) go through `CharactersService` and are gated by `getEditableCharacter` (owner / contributor).

A ruleset entity's customization plans (`Engine.for(scope).modifiers(entityType, entityId).planCreate`, `.requirements(…).planDelete`…) refuse as not found (a 404) a parent the composed ruleset doesn't have (`CustomizedEntity.find`), and answer its display name for activity logging; before an update or a delete, `CustomizationEdit.cowCustomization` reads, in the write's transaction, the parent the row is on and the row itself, and refuses as not found (a 404) one no longer stored.

## Identity vs. policy

There are still a few inline `entity.userId === session.userId` checks in services. Those are **identity matches**, not permission gates — they're answering "is this me?" rather than "may I do this?". Keep them inline, don't move them into a policy:

- The invite services' `acceptInvite`: "is this invite addressed to me?"
- OAuth-link checks: "did I just link this account to myself?"
- Self-removal predicates: `player.userId === session.userId` branches behavior, doesn't gate it.
- Boolean predicates an attachable record registers: the `isOwner(session, recordId)` of `ATTACHABLE_TYPES`' entries (`AttachmentsService.ts`), an avatar's `session.userId === recordId` (a portrait's asks `CharactersPolicy.isPortraitEditable`).

Anything that *throws* on the basis of ownership is a permission gate and belongs in a policy. The "Permission Checks (Policy vs. Identity)" section of [AGENTS.md](../AGENTS.md) is the canonical guidance.

## Where each policy is wired

| Policy | Service callers |
|---|---|
| `RulesetsPolicy` | `RulesetsService`, `RulesetExtensionsService` (subscribe / unsubscribe), `RulesetChangesService`, the entity services under `server/services/rulesets/` and `ContributorsService` (rulesets), through `RulesetsPolicy.for`. `CampaignsService` / `CharactersService` call `canCreateCampaign` / `canCreateCharacter` on the chosen ruleset. Every read of a ruleset by its id asks `canRead` through `getReadableRuleset` / `withReadableRuleset` (`CharactersService`'s creation reads among them), and so does every write of one, before its own check; `ActivitiesService` asks `isReadable` through `findReadableRuleset` before it links to one or to what's in it |
| `CharactersPolicy` | `CharactersService` (its sheet's `isReadable` and `permissions`, the `Archives` concern), `CharacterSharingService`, `CharacterContributorsService`, `CampaignCharactersService.linkCharacter`, `findEditableCharacterOrChild`, `getEditableCharacter` (a player character's own rows: its levels, scores, inventory and modifiers) and the portrait's `isOwner`; the sheet, a contributor's revoke and `ActivitiesService`, before it links to one or to what's under it, ask `isReadable` through `findReadableCharacter` |
| `CampaignsPolicy` | `CampaignsService`, `CampaignPlayersService`, campaigns sub-services, through `getReadableCampaign`, which asks `canRead` first; `CampaignInvitesService.revokeInvite` (by its invite's slot), `ActivitiesService` and the PDF export (`findExportableCharacter`) ask `isReadable` through `findReadableCampaign` |
| `AttachmentsService` registry | not a `BasePolicy` — uses its `ATTACHABLE_TYPES` config map. Currently registered: `User` (avatar), `Character` (portrait) |

Campaign creation validates ruleset access before inserting the campaign or GM membership. It uses the character-creation access policy: public published, owner, contributor, or existing active campaign membership. Archived rulesets and extensions cannot be used to create campaigns or characters. A newly requested campaign cannot grant its own ruleset access.
