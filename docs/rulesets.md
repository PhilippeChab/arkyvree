# Rulesets, COW & Extensions

## Overview

Rulesets define game rules (races, classes, feats, skills, items, spells, etc.) and support a hierarchical inheritance model. Entities are shared by reference — never copied — until a user modifies one, at which point a local copy is created on demand (Copy-on-Write).

## Ruleset Types

```
Base Ruleset (D&D 3.5)           ← system-owned, userId: null, no parent
├── Complete Warrior (extension)  ← system-owned, rulesetId: baseId, published
├── User's Fork (draft)           ← userId set, rulesetId: baseId
│   └── Complete Warrior (subscribed extension)
└── Another User's Fork
```

| Type | `userId` | `rulesetId` | `kind` | Description |
|---|---|---|---|---|
| **Base** | `null` | `null` | `ruleset` | System-owned root ruleset (e.g., D&D 3.5). Immutable |
| **System Extension** | `null` | parent ID | `extension` | System-owned supplement (e.g., Complete Warrior). Published, subscribed to by reference |
| **User Fork (playable)** | user ID | parent ID | `ruleset` | User's editable copy of a published ruleset; intended to be played directly |
| **User Fork (extension)** | user ID | parent ID | `extension` | User fork published as an extension; can be subscribed to by other users' forks of the same base, but cannot be used to create characters directly |

### Key Fields on `rulesetsInRules`

| Field | Description |
|---|---|
| `rulesetId` | Parent ruleset (null for base rulesets) |
| `ancestorRulesetIds` | `[parentId]` — only base rulesets can be forked, so the chain has at most one entry |
| `extensionRulesetIds` | Subscribed extension IDs (appended on subscribe, removed on unsubscribe) |
| `status` | `Draft`, `Published`, or `Archived` |
| `kind` | `ruleset` (default; playable) or `extension` (subscribable add-on). The character-creation picker shows only `kind = 'ruleset'`; the subscribe-extension picker shows only `kind = 'extension'`. Author chooses at publish time and can change later via the edit dialog. Setting `kind = 'extension'` requires the row to be a fork (`rulesetId IS NOT NULL`) and to have no own extensions (`extensionRulesetIds = []`) |

## Ruleset Lifecycle

### Forking

Creates a child copy of a published ruleset. No entities are duplicated — the child inherits everything via the source chain.

- Builds `ancestorRulesetIds = [parentId]` — `canFork` rejects forking a fork, so the parent is always a base
- Copies `extensionRulesetIds` and extension metadata rows
- Child starts as `Draft`

### Publishing

Transitions a Draft ruleset to Published. One-way (no Published → Draft path).

- **Kind choice**: at publish time the author picks whether the ruleset is published as a playable `ruleset` (default) or as an `extension` (subscribable add-on for other rulesets of the same base). Stored in `kind`. Editable later via the edit dialog
- **Validation (kind = 'ruleset')**: its view (its own entities and those inherited from its source chain) must give what its rules make a character of, which the engine checks (`Engine.for(scope).checkPublishable`; `RulesetPart.checkPublishable`, over the ruleset's `findMissingContent`, 3.5's a player race, a player class, a skill and a feat)
- **Validation (kind = 'extension')**: ruleset must be a fork and must not subscribe to other extensions. The minimum-content check is skipped — extensions are layered onto rulesets that already have the basics
- Only the owner can publish; only Draft rulesets can be published

#### What Draft vs Published actually gates

After the policy loosening (`inUse` + COW tombstones now do the protection that the Draft-only edit gates used to), the difference is narrow:

| Capability | Draft | Published |
|---|---|---|
| Edit/delete entities | ✓ | ✓ |
| Subscribe / unsubscribe extensions | ✓ | ✓ |
| **Be used by other users** (characters, campaigns, subscriptions) | ✗ | ✓ |
| **Appear in public lists** (when `private = false`) | ✗ | ✓ |
| Publish transition | ✓ (Draft → Published) | ✗ |

Published is purely an **outward-facing stability marker** — "others can build on this baseline" and "this shows up in public discovery." Only base rulesets can be forked, so publishing a user ruleset never makes it forkable. It doesn't restrict what you can do to your own ruleset.

For a `private` ruleset the distinction is functionally a no-op: only its owner, contributors and campaign members can see it, whatever its status, and edit behavior is identical. The publish action is only meaningful when paired with `private = false`.

The author's responsibility post-publish is purely social — "don't break what subscribers depend on" — enforced through `inUse` (your own characters) plus tombstone snapshots (subscribers' picks survive even if you delete the source entity).

### Archiving / Unarchiving

- **Archive**: flips `status` to `Archived`. Owned entities and overrides stay live, so any character or campaign still pointing here keeps resolving its data — the ruleset just becomes read-only at the editing surface. Not blocked by in-use
- **Unarchive**: restores an archived ruleset to Draft status
- Archived rulesets are read-only — `canUpdate` fails, so no entity edits, subscribes, deletions, forking, or publishing
- Archived rulesets remain available for restoration (see [persistence.md](./persistence.md)).

### Switching kind on a published fork

The `kind` is editable post-publish via the standard edit dialog (under the same "Publish as" toggle the publish dialog uses).

- **Validation when setting `kind = 'extension'`**: row must be a fork (`rulesetId IS NOT NULL`) and must not subscribe to other extensions (`extensionRulesetIds` is empty). Switching back to `kind = 'ruleset'` is unconditional.
- **Existing characters and campaigns are grandfathered** — same model as archived rulesets. The character/campaign rows still resolve content via the now-extension fork, but new characters and new campaigns can no longer be created on it (the `published` scope filters them out). The author makes the trade-off when they flip the toggle; nothing is migrated or invalidated.
- **Subscribers**: a fork that's `kind = 'extension'` cannot itself subscribe to other extensions (`canSubscribeExtension` rejects). If the fork is currently being subscribed-to as an extension by another user, that downstream subscription keeps working through the fork's normal source-chain resolution.

### Starring

Users can star published public rulesets to bookmark them. Star/unstar uses soft-delete for the tracking record.

Eligibility: a ruleset is starrable iff it's a published, public **base** (`rulesetId IS NULL`) or **extension** (`kind = 'extension'`) — i.e. anything you might want to come back to as either a forking target or a subscription target. A user fork published as a playable ruleset (`kind = 'ruleset'`) is not starrable since you can neither fork nor subscribe to it.

## Item templates

Item templates (`isTemplate = true`) remain editable under the ruleset's normal
permissions, but cannot have a `sourceItemId`. The item editor hides the source
selector for templates, and the item service rejects sources on template creation
or update using the stored template status. Saving a template without a source
also clears any legacy source reference.

A template is of a type an item can be based on a template of
(`TEMPLATE_ITEM_TYPES`: a weapon, an armor, a shield), refused otherwise on
create and on an edit that changes its type, and an item made from one is of its
type. A template's edit that changes its type, and its delete, read the items made
from it by every id they may hold (its own and those it stands for:
`cow.getEquivalentIds`), where the change reaches them (`Entities.findList`): the
ruleset's view (its own items, and those of its source chain it shows, which read
its copy in place of what it copied) and the rulesets built on it
(`buildLineageCondition`: an extension's subscribers), never another fork's, whose
view reads the original or its own copy. Each is refused while it has any (of
another type than the new one, for an edit): `ItemEntity.planEdit`, `planDelete`.
The edit's refusal names an item its view shows, and counts those of the rulesets
built on it without naming them (`listCopies`): one may be another user's private
ruleset.

Regular items can reference templates to inherit their fields and
requirements. Duplicating a template creates a regular item referencing it.
This item relationship is separate from ruleset inheritance: a local override of
an inherited template is tracked by an entity snapshot, not `sourceItemId`.

## Source Chain & Entity Inheritance

At query time, a combined **source chain** determines which entities are visible:

```ts
function buildSourceChain(ruleset): string[] {
  return [...ruleset.extensionRulesetIds, ...ruleset.ancestorRulesetIds];
}
```

Extensions come first so their entities are visible. Repositories receive this as `ancestorRulesetIds` — they don't distinguish between extension and ancestor sources.

## Copy-on-Write (COW)

Inherited entities are read-only. When a user edits or deletes one:

1. **Snapshot** — an `entity_snapshots` row is created: `{ rulesetId, entityType, sourceEntityId, forkedEntityId }`
2. **Local copy** — the entity + its fields + all customizations (modifiers, requirements) + relationships are duplicated into the child ruleset
3. **Modification** — the local copy is updated or deleted (for deletes)
4. **Query exclusion** — the repository SQL excludes the original from ancestor results when a snapshot exists

### COW in Repositories

Each repository's `findPage` builds COW-aware SQL per ancestor:

```sql
-- For each ancestor in the source chain:
SELECT * FROM feats
WHERE ruleset_id = :ancestorId
  AND id NOT IN (
    SELECT source_entity_id FROM entity_snapshots
    WHERE ruleset_id IN (:childId, ...closer_ancestors)
      AND entity_type = 'feats'
  )
```

The child's own entities are always included. Ancestor entities are included only if no snapshot overrides them.

### COW for Complex Entities

`EntityCopy.create` must run inside the mutation transaction. It takes a transaction-scoped advisory lock for the target ruleset/source entity pair before reading the snapshot. Concurrent first edits then reuse the committed copy instead of racing to insert duplicate entities. The snapshot read is a separate statement so PostgreSQL's default READ COMMITTED isolation sees the preceding writer's commit after waiting. Commit and rollback release the lock automatically. This adds one query to COW writes; reads and edits to already-local entities do not acquire this lock, and different fork/source pairs can copy independently.

- **Standard entities** (feats, spells, items, races, skills, etc.): COW copies the entity and all customizations
- **Classes**: COW copies the entire class including all levels and their customizations/relationships
- **Customizations on inherited entities**: `CustomizationEdit.cowOwner` / `cowCustomization` trace the modifier/requirement back to its owning entity, COWs that entity, then resolves the customization through IDs recorded at copy time, including sibling contributions
- **Fields on inherited entities**: an entity's fields are written by its own edit: `EntityWriter.update` copies the entity (`EntityEdit.cowToEdit`) with its customizations, then writes its fields over the copy's stored values, each field and link role its codec declares replaced

### Override Map

The engine builds a ruleset's `CowData` (`Engine.copyOnWrite().buildData`, by its `CowDataBuilder`) from the rows the server reads as it says (`copyOnWrite().getReads`, `CowDataReader`): a mapping of `sourceEntityId → forkedEntityId` across the full snapshot chain, and of each sibling loser to its winner. Used for:
- **Class levels**: a class's levels aren't snapshotted one by one: the levels of each class another stands for in the view pair by number with that class's (`CowDataBuilder`'s owned pass, over the owned entities of the owners `getPairedOwnerIds` names, each owned kind declaring its owner, `EntityTypeDef.ownerType`, and its `owner` and `position` columns): a class a copy of the ruleset or its source chain overrides, followed to the last copy as an entity id is (an extension's copy of a core class, then the ruleset's copy of that copy), and a book's class the ruleset's own of its name hides. So a character's level stored with the core class level's id reads the last copy's level of its number
- **FK remapping**: When copying entities, foreign keys pointing to inherited entities are remapped to their COW copies (`CowDataReader.read` through the copy's transaction, `CowData.resolve`): the same passes as the ruleset's view, so a copy stores what the view shows (a losing copy of a list resolves to the winning one)
- **Detail views**: `CowData.resolveRows()` remaps ID references in query results
- **Level picks**: a level flow's plan request (a plan's answer, a step's picker, a level-up's or an edit's save) may name a copied entity by its source's id, which the API takes as it takes the copy's the client sends. The level-up handle resolves each id a request names as it enters (`LevelUpEngine`, by `LevelRequests`), as the character's rows are (`CharacterInputs`): its checks, its preview and its save read the copy (a spell at its level in the copy's lists, a feat the character holds as the copy), and a save writes the copy's id, the row the client's request writes. A pick the view has none of is refused, naming it. A row saved before the copy keeps its source's id, which reads resolve
- **Request ids**: every id a request names is read so, by one class (`RequestIds`, `engine/core/view/`) as the request enters the rules: a level flow's (`LevelRequests`), a new character's creation picks and scored links (3.5's race and ability scores: `characters().planCreate` and `planStart`, which an import plans its start by), a scored link's edit (`planScores`: 3.5's ability scores), a picked link's edit and its picker's (`character(input).planLinkPicks`, `describeLinkPicks`: 3.5's languages) and an added inventory item (`character(input).planInventoryEntry`, which places the copy, as the view has it); an entity's form, each kind naming its own (`resolveIds`: a save's or a skill's ability, a feat's or a spell's lists, a spell's save, an item's template, a class level's granted feats, their pools and its saves), a class skill's add (`links("classes", klassId).planAdd`) and a field's value naming an entity (a `ref` field, which an entity's create and edit read through its codec, `FieldCodec.parse`: a class's bonus spell ability). Each plan names what it writes by the view's id. An id the view has none of (unknown, of an unrelated ruleset, or one the ruleset deleted) is refused as `invalid`, naming it (`Item <id> does not belong to the character's ruleset`, an entity's form `Ability <id> does not belong to this ruleset`, never the foreign key's 500 nor another ruleset's entity stored), and so is one entity named twice where it's given once (an ability's score, a language, a feat's or a spell's list, a class level's save: `Language <id> is given more than once`). A path's id stays a 404 (`find`). Rows stored before a copy keep their source's id: reads resolve them, and nothing rewrites them

### Snapshots

| Field | Description |
|---|---|
| `sourceEntityId` | Original ancestor entity ID |
| `forkedEntityId` | Child's local COW copy ID |

### Names of entities

No change makes a view show two entities of a kind under one name. Every entity
create (`EntityNames.assertNameAvailable`), bulk item variants and every rename
(`assertRenameAvailable`, from `EntityWriter.update`) check the name against the
fork's composed view, by one read for every name (`assertNamesAvailable`). A
local entity, or an inherited one that is still visible, with the same name
blocks it: a conflict (409) naming the name. Inherited entities hidden by an
override (`cow.isHidden`: overridden, or a sibling loser) do not. Lists too: a
fork's list takes a name no list of its view has, though its view pairs lists by
name
(see [Aptitudes and the Sibling Map](#aptitudes-and-the-sibling-map)).
An edit that keeps its entity's name checks none: an inherited entity's first edit
copies it under its name, and a duplicate stored before the rename was checked
stays editable. Names compare as written: a case-only change is a new name.

A restore (`assertRestoreAvailable`, from `EntityRevert`) shows the source again
under its name, as a rename back to it would: refused while the view shows another
entity of it, unless the copy kept the source's name. A subscribe
(`assertExtensionNamesAvailable`) counts the names the new extensions' entities
have (a renamed copy's too) in the view as it is and as it would be once
subscribed (its `CowData` read for the new extensions, so what that view pairs
counts once), and refuses one it would show more often than once and than now: a
name the view already shows twice (a familiar's race and an animal companion's of
one name, which a race's kind tells apart) blocks no subscribe that leaves it so.
An unsubscribe (`assertReturningNamesAvailable`, see
[Unsubscribe](#unsubscribe-unsubscribeextension)) counts, the same way, the names
of what the view shows again once the extension is gone (a core entity it copied,
another book's copy or reprint it won over), the fork's copies of the extension's
entities going with it: refused while the fork has given another entity one of
those names since (it renamed its copy of the book's copy of a core feat, then
created a feat of the core feat's name), a conflict (409) naming it. The fork
renames that entity first. Both count a book's entity the fork's own of its name
hides (below) as shown: the fork is told of the clash its change makes rather than
lose the book's entity.

A fork's own entity wins over an extension's of its name, of every kind
(`CowDataBuilder`'s own namesakes pass, over `RulesetEntities.findOwnNamesakes`: the
fork's entities and its extensions' of a name both have; `CowData.isShadowed`). Not
over its base's, whose entity an unsubscribe would show again is refused instead
(above), and a campaign's entity wins over none. The checks above read the fork's
view, but an extension's entities show in every subscriber's: its author may add or
rename one to a name a subscriber's own entity has, which no check of the author's
reads, and which the author is never refused for, so nothing of another user's
ruleset reaches them. The subscriber's view then shows its own entity, and the
book's of its name is overridden by it, as a local copy overrides what it copied:

- the book's entity's own rows go with it, never merged into the fork's: its
  customizations and its links to lists (a homebrew feat and a book's of one name
  may be different things, whose rules a merge would mix). A book's list no longer
  lists it;
- a row naming it reads the fork's entity instead (`CowData.resolve`): a class of
  the book's granting it, a character's pick of it (one made while the view showed
  both), a level-up's request. What it stood for does too: the entity it copied,
  and its sibling losers (another book's reprint it won over). A class's levels
  pair by number with the fork's class's, as a copy's do; a level the fork's class
  doesn't have goes with the book's class;
- a list leaves it out in its query (`listFilters.hiddenIds`), so the pages, the
  pickers and the sheets show the fork's alone;
- an unsubscribe points what named it at the fork's entity (`findDepartures`: the
  fork's entity stands in its place), and refuses nothing for it;
- the fork's entity's equivalent ids hold it (`getEquivalentIds`), so its delete's
  in-use check counts a pick of the book's too;
- the fork renaming or deleting its entity shows the book's again.

A list pairs with its books' lists of its name instead (see
[Aptitudes and the Sibling Map](#aptitudes-and-the-sibling-map)): it has nothing of
its own to merge.

If a hidden ancestor's local copy was deleted, its snapshot is a tombstone, and
`EntityNames.repointTombstone` moves it to the new entity a create makes; a
renamed entity takes over none. A live local copy keeps its snapshot even after a
rename, so picks of the source keep resolving to that copy.

### Restoring an override

A fork's **Restore Parent Version** (`RulesetChangesService.revertOverride`) reverts
its copy of an inherited entity to the source: `EntityRevert` (`server/cow/writes/`),
`EntityCopy`'s inverse, refused while the fork's view shows another entity of the
source's name (`EntityNames.assertRestoreAvailable`, see
[Names of entities](#names-of-entities)). Every row naming the copy names the source
instead, which the views show in the copy's place once it's gone. The rows that name an entity are
one list, by the entity's type (`ENTITY_REFERENCES`,
`server/repositories/rulesets/entityReferences.ts`), which `EntityReferences` reads
for every use: a revert's repoint (`update`: a restore's, and an unsubscribe's of
each copy it removes), an unsubscribe's repoint of the fork's rows and its characters'
to what stands in place of what leaves (`findIds`, then `update` given the fork), its
lost references (`findMany`) and the in-use checks (`exists`). An entity's own rows
aren't among them, since they go with it: a feat's or a spell's links to its lists, a
class's skills and levels. A restore repoints,
whichever ruleset holds them:

- the fork's own rows and its other copies': a feat's or a spell's link to a copied
  list, a class level's grants of a copied feat or spell (or from a copied list) and
  its saves, a class's skills, a spell's save, a race's or a class's parent, an
  item's template;
- the rows of the rulesets built on the fork (an extension's subscribers), which
  name the copy as their views showed it, and a subscriber's copy of the copy, whose
  snapshot then names the source;
- the picks of the characters on the fork and its subscribers: a race, a feat, a
  spell, a skill, an item, a language, the list a pick is made from. A pick names
  what its view showed, which the source stands for again, as a pick stored before
  the copy does. A character's level in a copied class moves to the source's level
  of its number, as `CowDataBuilder` pairs a copy's levels; a level the copy added,
  which the source doesn't have, refuses the restore (`ConflictError`) while a
  character took it.

A row that would then repeat another by its table's primary key (a feat linked to
both the list and the copy) goes, and the one naming the source stays. Then the copy
goes with its own rows and customizations, and its snapshot, and the cache drops the
fork's views and its subscribers' (`RulesetViews.invalidate`). An unsubscribe reverts
the fork's copies of the extension's entities the same way, once nothing else names
them (see [Unsubscribe](#unsubscribe-unsubscribeextension)).

### Multi-Extension COW (Sibling Map)

When multiple extensions COW the same base entity, each extension creates its own independent copy. At runtime, one copy "wins" (the first extension in subscription order, `extensionRulesetIds`) and the others become **siblings**. Their data is merged transparently so the user sees a single entity with combined customizations.

Merged requirements are **ANDed**: the winner's requirements and each sibling's requirement trees all apply. An OR chain added by one extension therefore does not widen eligibility for another extension's requirements. Illustrative example:

```
Base Ruleset
└── Power Attack (requires: Strength >= 13)

Extension A (subscribed first)
└── Power Attack (COW copy: Strength >= 13, adds BAB >= 1)

Extension B
└── Power Attack (COW copy: Strength >= 13, adds (Fighter >= 1 OR Barbarian >= 1))

User's Fork (subscribed to A, then B)
└── sees ONE "Power Attack" (A's copy wins) requiring:
    Strength >= 13 AND BAB >= 1 AND (Fighter >= 1 OR Barbarian >= 1)
    B's duplicate standalone "Strength >= 13" is dropped; its OR chain is kept intact.
```

**How it works:**

1. `CowDataBuilder` detects when multiple extension snapshots share the same `sourceEntityId`. It pairs the winner's `forkedEntityId` with the sibling `forkedEntityId`s (`CowData.getSiblings(winnerId)`, `getWinner(loserId)`). Feats and spells that several rulesets in the source chain define natively under the same name (reprints: the kinds whose storage says `namesakes: "reprints"`) are paired the same way, closest ruleset first. A winner the fork's own entity of its name hides is overridden by it, its siblings with it (see [Names of entities](#names-of-entities)). A winner's siblings are listed in the order they were paired (the snapshot pass's, then the reprint pass's), each once, under the winner it resolves to: the order both merges below take them in.

2. **Entity list filtering**: Sibling entities are left out of every ruleset entity's list in its query (only the winner is returned), so the user never sees duplicate feats and a page keeps its size: `StoredEntities.buildRulesetCondition` excludes the `hiddenIds` it's given (`rulesetData.cow.listFilters`, with the source chain: the sibling losers, and the books' entities the fork's own of their names hide) from the inherited rows. A list read without them sees them.

3. **Read-time merging** (built into the compose step, the engine's `copyOnWrite().buildView`: `RulesetComposition` in `engine/core/view/RulesetComposition.ts`): `RulesetViews.getData` folds sibling contributions into the winner's buckets before the engine's operations read them. Consumers read `rulesetData.byId(type)` (3.5's `Dnd35View.of(rulesetData).featsById` / `spellsById`) / `rulesetData.modifiersBySource` / `rulesetData.requirementsByEntity` / `rulesetData.valuesOf(id)` and get pre-merged rows — no sibling helpers needed at call sites. The rules are one class, `SiblingMerge` (`engine/core/view/SiblingMerge.ts`), which `EntityCopy` writes by too, through the engine (`copyOnWrite().mergeCustomizations`, `mergeLinks`): each takes the winner's own rows and each sibling's, in `getSiblings` order, and returns the siblings' rows the winner takes. Of two equal rows (by the kind's key), the winner's, then the earlier sibling's, is kept: its requirements, its description, its level.
   - **Links of a role that merges** (`mergeLinks`, a role whose registry row merges by `union`: 3.5's `listedIn`, a feat's pools, a spell's lists): a sibling's links are merged into the winner's (`RulesetData.linksOf`), deduped by their role and resolved target (3.5's aptitude) after FK remap; a role that doesn't merge keeps the winner's alone.
   - **Requirements** (`mergeRequirements`): sibling requirement trees are appended at the top level (so they are ANDed with the winner's) with `entityId` remapped: a chain gets the next free integer level and a standalone keeps its level, suffixed on collision. Duplicate top-level standalone conditions are deduplicated on `target|operator|value`; conditions inside AND/OR chains are preserved to keep their boolean meaning, so two identical chains both remain. Display preserves each source row's UUID, and COW records its new copied UUID so edits target the exact requirement.
   - **Modifiers** (`mergeModifiers`): sibling modifiers are appended with `sourceId` remapped to the winner, deduped on `target|value|operator|valueType`. Dropped modifiers have their requirements dropped too.
   - **Stored values** (`mergeValues`, the view's and a copy's): each field and link by its declared merge (`Merge`, `engine/core/module/storage.ts`, a field's definition's or its link role's, through `DeclaredFields`): a set's (`union`) values the winner lacks, deduped by value, in the set's declared order; a single value (`fallback`) the winner's, or the first sibling's when the winner has none.
   - Consumers: the engine's operations, which the services bind to the view, `Engine.for(scope)` (the feats' and spells' lists, `entities("feats").openList`, `entities("spells").openList`; the customizations', `ModifierEdits`, `RequirementEdits`; an entity's fields, read off its stored values; `DetailedCharacter`), all just read from `rulesetData.*` without any sibling-specific code.

4. **COW merging** (`EntityCopy`): When a user COWs the winner entity, its sibling merge copies unique requirements, modifiers, stored values, and aptitude links from all siblings into the new local copy. The child's copy contains the full merged result. See below.

**Key rule**: A local (child fork) COW always wins completely — no sibling merging. The sibling map only applies to extension-vs-extension COW conflicts. If the user's own fork has COW'd a base entity, that fork's copy is authoritative and extension copies are ignored.

This also applies when an extension is subscribed to after the local copy was made:
its unrelated entities remain available, but its contributions to that overridden
entity are not merged into the local copy. Restoring the override resumes the
normal merged view of the currently subscribed extensions. Hidden sibling IDs
still resolve to the local copy; deleting that copy leaves the whole entity hidden
until the override is restored.

`EntityCopy` requires both the source chain and `extensionRulesetIds` (`EntityEdit` and `CustomizationEdit` pass the ruleset's). Every edit path passes the current ruleset’s extensions, including entity edits, class-skill changes, and class-level changes, so the local copy contains all visible sibling customizations before read-time merging stops.

### Aptitudes and the Sibling Map

Aptitudes are named pools — they have `name` but no per-ruleset content — so the seed only creates a row in the ruleset that *introduces* the name (see `docs/packages.md`: COW-ing core entities into extensions → Aptitude ownership rules). Three cases matter here:

- **Base-inherited names** (`General`, `Cleric Domain`, `Fighter Bonus Feat`, etc.): exactly one row exists, in base. Extensions and forks adding new feats/spells just link to base's id via `aptMap`. No sibling rows, no dedup needed.
- **Sibling-shared names** (e.g. `Assassin Spells`, `Blackguard Spells`, `Hexblade Spells`): multiple extensions each create their own copy because siblings can't FK to each other. A book copies another book's spell list that its spells are on: one its spells' level line names (a Complete Adventurer spell's "Assassin 1"), or one that draws on other classes' lists (`spells.inheritsFrom`: Complete Arcane's `Sublime Chord Spells` takes Complete Adventurer's bard and sorcerer spells), so a list holds the spells of every book a ruleset takes, as the copies of a core spell merge. The sibling mechanism (`CowDataBuilder`'s identity pass, `pairIdentities`, `engine/core/cow/CowDataBuilder.ts`) picks a winner per name across the ruleset and its source chain: the ruleset's own list (its own, or its copy of an inherited one) first, then the chain's closest. Losers become the winner's siblings (`CowData.siblingIds`), so the compose step drops them, and its aliases, so references to a loser resolve to the visible winner (its local copy, if the fork has one). They are intentionally not overrides, which are for true copies only. The user never sees duplicates. A list's feats and spells, on the ruleset's pages and in the level-up's pickers, are the composed view's (3.5's view's `Dnd35View.listFeatIds` / `listSpellIds`, which the engine's lists and pickers filter by: `entities("feats").openList`, `entities("spells").openList`, `levelUp().openStepPicker`), never the stored links: the winning copy of a feat or a spell takes every copy's links, so a link stored on a losing copy of either, or of the list, still counts.
- **A fork's list of a book's list's name**: a fork's own list, or its copy of one, pairs with the lists of its name its books bring, as theirs pair with each other, so a subscribe never refuses a list's name (the view it would have pairs them: `EntityNames.assertExtensionNamesAvailable`), and a book that later adds a list of a name the fork has shows none twice. The fork's list wins, as its copy of a book's would: the spells and feats on the books' lists of its name join it, and a link, a class's grant or a character's pick naming a book's list reads the fork's, at which an unsubscribe points them. Unlike a feat or a spell, which never merges with a book's of its name (a subscribe refuses the clash, and a book's entity its author names as the fork's later is hidden by the fork's: a homebrew feat and a book's of one name may be different things, whose rules a merge would mix, see [Names of entities](#names-of-entities)), a list has nothing of its own to merge: its name is what it is.

### COW-ing a Merged Entity (Sibling Bake-in)

When a user modifies an entity that is the merged result of multiple extension COWs, the local copy must contain the **combined** data from all siblings — not just the winner's data. Otherwise the user's fork would lose customizations from the non-winning extensions.

```
Before COW (runtime view):
  User sees one "Power Attack" merged from A (winner) + B (sibling)

User edits Power Attack → EntityCopy.create:
  1. Copies the winner (A's Power Attack) + all its customizations
  2. Detects siblings via its CowData (getSiblings) → finds B's Power Attack
  3. Merges the siblings' data into the new local copy
  4. User's local copy now contains the full merged result

After COW:
  User's fork has its own "Power Attack" with the merged customizations of both extensions
  The sibling pairing no longer applies — local fork wins completely
```

The sibling merge (`EntityCopy`'s `mergeSiblings`) merges four types of customizations by the read-time merge's rules (`SiblingMerge`), against the winner's rows it just copied, so the copy holds what the view showed (`tests/services/rulesets/dnd3.5/SiblingSemantics.test.ts` copies every winner of a fork of every extension and compares):

| Type | Merge strategy | Deduplication key |
|---|---|---|
| **Requirements** | `mergeRequirements`: appends each sibling tree at a fresh top-level position (ANDed), chains kept intact | top-level standalone `target + operator + value` |
| **Modifiers** | `mergeModifiers`: inserts sibling modifiers (with their own requirements) | `target + value + operator + valueType` |
| **Stored values** | `mergeValues` (the engine's `copyOnWrite().mergeCustomizations`): the copy's values whole, each field and link by its declared merge, which replace the copy's (`Fields.update`): a set's sibling values it lacks; a single value only when the winner has none, the first sibling's | a set's value; a single value's field, a link's role |
| **Links of a role that merges** | `mergeLinks` (the engine's `copyOnWrite().mergeLinks`): inserts sibling links of the roles that merge (3.5's feats' and spells' `listedIn`), to the target (3.5's aptitude) the copy's `CowData` resolves each to, as the copy's own links | role and resolved target |

The customizations are copied whole, as the winner's own (`CustomizationCopies.copy`), and each copied row's new ID is recorded, so the mutation that triggered the copy changes the exact copied row. This ensures the user's local copy is self-contained. If they later unsubscribe from one of the extensions, their fork retains the full merged data since it's baked into their own copy, its links to the extension's lists moved to the lists of the same names it or its other books have (see Unsubscribe below).

## Extensions

Extensions add supplemental entities to a base ruleset. They come in two flavors that share the same data model — a subscription is by reference, never a copy:

Eligibility is determined by `kind = 'extension'` on the ruleset row, set explicitly by the author (or seeded for system extensions). Both flavors share the same row shape:

- **System extensions**: `userId IS NULL`, `kind = 'extension'` (e.g., Complete Warrior).
- **User extensions**: user-owned forks with `kind = 'extension'`, `private = false`, `status = 'Published'`. The `extensions` listing scope returns both flavors merged.

The validators that set `kind = 'extension'` enforce: must be a fork, must not subscribe to other extensions. That keeps the dependency graph one level deep — subscribers never need to walk a transitive chain. The same invariant is enforced on the subscribe path: a host whose own `kind = 'extension'` cannot subscribe to anything (`canSubscribeExtension` policy).

### Subscribe (`subscribeExtension`)

1. Validates: ruleset is a fork, not archived, user is owner, extension is `kind = 'extension'` + published + shares the same base + (if user-owned) public + the host's own `kind` is `'ruleset'`
2. Checks not already subscribed (`extensionRulesetIds.includes`), and that its view would show no name more often than once and than it does now (`EntityNames.assertExtensionNamesAvailable`, see [Names of entities](#names-of-entities)): the names of the new extensions' entities, their copies included, counted in the view as it is and as it would be, read with its `CowData` once subscribed, so what that view pairs (an extension's copy of an inherited entity, two books' entities of a kind a book reprints (`namesakes: "reprints"`: 3.5's feats and spells), pools of a name (`namesakes: "identity"`), whoever holds them, the host's own too) counts once. An extension's entity of a name the host's own entity has counts, though the view would show the host's alone: the host is told of the clash
3. Appends `extensionId` to `extensionRulesetIds` array
4. Creates tracking row in `ruleset_extensions` (UI metadata: name, `updateAvailable` flag)

No entities are copied. They become visible immediately via the source chain.

### Unsubscribe (`unsubscribeExtension`)

1. Validates: user is owner, extension is subscribed, ruleset not archived
2. Finds the host's copies of the extension's entities: its snapshots whose `sourceEntityId` belongs to the extension, and checks that its view would then show no name more often than once and than it does now (`EntityNames.assertReturningNamesAvailable`, see [Names of entities](#names-of-entities)): what the extension hid shows again (a core entity it copied, another book's copy or reprint it won over), and a `ConflictError` names one the host has given another entity since, before anything changes
3. **What leaves, and what stands in its place** (`findDepartures`, `extensions/departingReferences.ts`): the extension's entities, the host's copies of them, and their classes' levels, each with what the host's view shows in its place once the extension is gone, read from its `CowData` with and without the extension (`CowDataReader.read`). Of the ids the view shows the entity for (`getEquivalentIds`: the core entity an extension's copy overrides, another book's copy or a namesake it wins over, a list of its name), it's the first that stays, as the view without the extension resolves it, when that view shows it. So the extension's copy of a core feat or spell falls back to the core one (or to another book's copy of it, which wins once this one is gone, as the sibling pairing has it), a list to the list of its name the host or another book has, an entity the host's own of its name hides to that one, and a class's level to the level of its number in the class standing in its class's place, as `CowDataBuilder` pairs a copy's levels. An entity only the extension has, a list no other book has, or a level the class standing in its class's place doesn't have, leaves the view: nothing stands in its place
4. **In-use check** (`isExtensionInUseByHost`) — blocks with `ConflictError` if a character on the host picked what leaves the view (`EntityReferences.exists`, every type's picks, a class's by its levels), directly or through the host's copy of it: the pick would dangle. A pick of what something stands in place of doesn't count: step 5 points it there. The check also counts a ruleset built on the host, which has none: fork-of-fork is blocked at policy time, and a host isn't an extension
5. **Repoints what the host keeps** (`repointDepartingReferences`): a host row naming what leaves the view (a link to a list no other book has, an item's template, a class's or a race's parent, a spell's save, a save's or a skill's ability, a class's skill or its levels' saves, granted feats and spells: `EntityReferences.findMany`, the copies' own rows aside, which go with them) refuses the unsubscribe with a `ConflictError` naming them, before anything changes. Then every row of the host and of its characters naming what something stands in place of names that instead (`EntityReferences.findIds`, then `update` given the host): a feat's or a spell's link to the extension's list, a class's grant, a character's pick of a core feat the extension overrides (stored by the copy's id, as a level-up writes the id its view shows: `RequestIds`), the list it's picked from, its level in a class the extension overrides, its race, an item it carries. A row that would then repeat another by its table's primary key goes, as a revert's does. The extension's own rows, and its other subscribers', keep naming its entities
6. **Reverts the host's copies** (`EntityRevert`, as a restore does: see [Restoring an override](#restoring-an-override)), which deletes them and their snapshots. What names a copy names the extension's entity before the copy goes. By then, only another of the copies names one: step 5 moved the host's own rows and its characters' picks, or refused. So a copy naming another never blocks the other's delete, whatever order the copies go in: an item's copy naming its template's copy (a `madeFrom` link, whose role refuses the delete), a class level's save (`baseBonus`, refuses too). Nor is a subrace's or a subclass's copy deleted with its parent's (`subraceOf`, `subclassOf`, whose roles delete) before its own turn. The host's edit of the extension's copy of a core entity goes too, as its edits of the extension's content do: what named it names what stands in its place, the core entity
7. Removes `extensionId` from the array
8. Soft-deletes the tracking row

### Fork Inheritance

When a ruleset with extensions is forked, the child inherits:
- `extensionRulesetIds` — copied as-is
- `ruleset_extensions` metadata rows — duplicated for the child

The child can subscribe to and unsubscribe from extensions independently of the parent.

## Authorization

See [docs/access.md](./access.md) for the full policy matrix across rulesets, characters, campaigns, and customizations, plus the listing-scope reference for the create-character wizard. Quick summary for ruleset writes: `canUpdate` (metadata) requires owner or **Admin** contributor; `canUpdateEntity` (content) also accepts **Editor** contributors; `canPublish` / `canSubscribeExtension` / `canUnarchive` / `canManageAdminContributors` are owner-only.

### What `inUse` means in an entity's delete

`inUse` is about one thing: would deletion orphan a character pick on the
**current ruleset or any descendant fork**? Nothing else.

- **Scoping is current + descendants.** The in-use check,
  `EntityReferences.exists`, reads every character row naming an entity of the
  type (`ENTITY_REFERENCES`), and joins the character's ruleset on
  `id = $rulesetId`, or `$rulesetId` among its ancestors or its extensions
  (`buildLineageCondition`, which a template's change reads its items by too) — one
  query per such column. With forks of forks blocked, descendants of a base ruleset
  are at most one level deep, but the query shape stays the same so the
  guard is robust if depth ever changes. A parent author deleting a feat
  that a downstream fork's character picked is blocked; a fork deleting an
  inherited entity that only the parent's character uses is not (parent's
  characters are unrelated to the fork).

- **Picks stored under a source id count against its local copy.** A
  character that picked an inherited entity keeps the source id after the fork
  copies it. Deleting that copy leaves a tombstone hiding the source, which
  would orphan the pick. A delete passes the entity's equivalent ids
  (`rulesetData.cow.getEquivalentIds`), so the check also matches the pre-copy
  ids that resolve to the copy. Restoring the source checks no pick: it points
  the copy's picks at the source, and keeps the pre-copy ones valid (see
  [Restoring an override](#restoring-an-override)).

- **Don't include class-side references** (a class level's `grants` links,
  a class's `classSkill` links, etc.). Class definitions are author-owned
  content: if the author deletes a feat their class grants, its role's rule
  unlinks the grant and the author can fix it. Class-granted feats that a
  character actually picked are recorded on the character (a `feats` pick's
  `entity_id`, `character.advancement_picks`), so the character-side check
  already covers that case. A link whose role refuses its target's delete is the
  exception (a class level's base bonus to a save, `baseBonus`): the database
  would refuse the delete, and the check answers why first
  (`EntityLinks.hasRefusing`, by the roles the modules declare: `StorageEngine.refusingRoles`).

The principle: only protect what the user *invested* in (their character
picks). Author-owned data that breaks via cascade is recoverable by the author.

The shared check lives in `services/rulesets/characterPicks.ts` as `hasCharacterPicks(tx, entityType,
ids, rulesetId)` (an entity that owns others by the ones it owns: a class by its levels,
`Entities.findPickedIds`) and is reused by every entity delete (`EntityWriter.delete`) and a class
level's or a class skill's removal. One helper, one scoping rule, one source of truth.

## Entity Services Pattern

One service answers every kind's entities (`EntitiesService`, `server/services/rulesets/entities/`), in the ruleset's scope (`withRulesetScope`): reads come from its composed view, which the service binds the engine to whole (`Engine.for(scope)`), and writes to an inherited entity go to the fork's copy, made on its first edit (`EntityEdit`, `EntityCopy`: `server/cow/writes/`). It names no kind: what each answers, its kind's rules say (`Engine.for(scope).entities(type)`):

```ts
// Read (list): the kind's rules read the query's filters past the shared ones, by their schemas, and give what the
// repository narrows the ruleset's rows to (`filters`), its source chain's less the sibling losers; they describe the
// rows as the view does
return await withRulesetScope(db, rulesetId, async (scope) => {
  const list = Engine.for(scope).entities(type).openList({ childOnly, ...filters });
  const result = await Entities.findPage(
    db,
    { entityType: type, rulesetId, ...scope.rulesetData.cow.listFilters, childOnly, orderBy, orderDir, search, ...list.filters },
    pagination,
  );
  return { ...result, items: list.describe(result.items) };
});

// Read (one): the entity as its page shows it, or the engine's not-found refusal (a 404)
return Engine.for(scope).entities(type).describe(entityId);
```

Every kind is served by one router, by its URL segment (`server/routers/api/rulesets/entities/`: `/rulesets/:id/entities/:entityType`, by its type's segment, `class-levels` for `class_levels`): its list, with its kind's filters past the shared ones (a race's or a class's `kind`, a feat's or a spell's `aptitudeId`, a feat's `family`, a spell's `level`, an aptitude's `scope`, an item's `isTemplate`), its page, its create (201), update and delete, and its kind's actions (`grouped`, its groups in their own order with their own filters, a feat's pool's; `templates`; `:entityId/duplicate`; `:entityId/variants`). A kind declares its filters (`listFilters`, `groupFilters`: each a schema, by its query key), which its rules read: one it takes none of is refused, by key ("races take no level filter"), as a route's validation refuses a query. An action a kind has none of its rules refuse as not found, first of all its checks (`checkAction`, as the service opens the kind for it: `entities(type, action)`): a read-only kind's create, update and delete (`readOnly`: an ability's), the groups of a kind that lists none, and the templates, duplicate and variants of a kind that makes no copies (`copies`: "No templates for races"). The client reads and writes every kind through these, its reads of a kind's list and of an entity through `client/src/lib/entityRequests.ts` (`readEntitiesFn`, `readEntityFn`); a class's own resources (its levels, skills, feat pools, progression, spell lists, spells known and spells) keep their routes, which are a class's, not a kind's. No kind has routes of its own for its entities: a module's new kind is served by these as it is (`tests/routers/application.test.ts` checks no route of a kind's own lists, creates, reads, updates, deletes, groups or copies its entities, or answers its templates).

A kind's creates, updates and deletes go through a writer, `EntityWriter` (`server/services/rulesets/EntityWriter.ts`), of its type, which opens the kind's rules for the action first (refused when it has none of it): the service hands it the plan the kind's rules give, and it takes every kind's steps around it, in one order:

```ts
const writer = new EntityWriter(type, (scope) => Engine.for(scope).entities(type, "update"));
return await writer.update(session, rulesetId, body, (scope) =>
  Engine.for(scope).entities(type).planEdit(entityId, body),
);
```
```

- **A create** checks access, then the name against the composed view (`EntityNames.assertNameAvailable`), plans, writes the row, points a tombstone the name hides at it (`repointTombstone`), and writes its links by role (`linkWrites.ts`: `createLinks`, a create's; `setLinks`, an edit's, each role it sets replaced), what its plan writes beside it (`writeEntityWrites`) and the customizations it copies (an item's duplicate's). Named as an ancestor the ruleset deleted, the new entity stands in for it, and a kind that takes after it reads the ancestor's stored row, which the view hides (`takesAfterAncestor`, `planCreate(body, ancestor)`: a feat is generated when its ancestor was).
- **An update** checks access, plans, checks a new name as a create does (`EntityNames.assertRenameAvailable`), and writes the row the view's entity resolves to: the fork's own, or the copy of an inherited one (`EntityEdit.cowToEdit`), refused when stale (a copy's `updatedAt` isn't the client's). It replaces its list links when the plan gives them.
- **A delete** is refused while the entity is in use (see [What `inUse` means](#what-inuse-means-in-an-entitys-delete)). It deletes the row the entity resolves to (`EntityEdit.cowToDelete`), the fork's own locked first, with what its plan removes.

Each records its activity (`createLanguage`, `updateLanguage`, `deleteLanguage`: the writer's activity name, of its type), which carries the ruleset's base rules, as every change to a ruleset's content does (`createActivityWithNotifications` reads them off the ruleset it notifies the stakeholders of: the client names the change in the ruleset's words, 3.5's `class_levels` a class level), and drops the ruleset's views. An edit's or a delete's plan may name the copies it reaches (`copies`: an item template's, whose type change or delete its copies refuse), which the service reads where the plan reaches them (the ruleset's view and the rulesets built on it) for the plan's check. A kind's copies (`Copies`: its templates, a duplicate, its variants) are planned by its rules alike (`openTemplates`, `planDuplicate`, `planVariants`).

A create or an edit answers its row with the fields the entity keeps once written (its plan's `fields`: a skill's, a race's, none of an ability's), as a page describes its rows.

Every kind's rules are a class on one base (`engine/core/entities/RulesetEntity.ts`), whose steps every kind takes, a kind adding its rules to the ones they name:
- **Described** (`describe(id)`): the entity found (`find`, refused as not found), its row as the view resolves it, with the fields its stored values hold (the kind's `fields`, a codec reading `RulesetData.valuesOf`: `FieldCodec.NONE` for a kind without; a reference the id the view keys its entity by, `fieldsOf`). A kind whose page shows its customizations adds its modifiers and its requirements (`CustomizationPageEntity`: a race, a feat, a spell, an item, a class level); an item's fields read its stored values merged with its template's (`valuesOf`, `RulesetData.inheritedValuesOf`; `requirementsOf`), and it names its template (`templateName`). Its form's fields are described as the ruleset declares them (`describeFields`: `FieldCodec.describe`).
- **Listed** (`openList(where)`): its query's filters read by their schemas (`listFilters`), what the server reads a page with (`filters`, `listOf`) and its rows described alike; its groups' alike (`openGroups`, `groupFilters`, `groupsOf`: a feat's families). A feat's and a spell's list narrows them to a list's, and gives its rows their lists as the ruleset composes them (`ListedEntity`, which also refuses a feat in a spell list and a spell in a feat pool); an item's gives its rows their template's name.
- **Written** (`planCreate(body)`, `planEdit(id, body)`): the entities the form names by id read as the view reads them (`resolveIds`, by `RequestIds`: a copy's for its source's id, one the view lacks refused by name), its fields read by its codec against the ruleset's declarations (`FieldCodec.parse`: refused as invalid, by field, a key no declared field, a value outside its type's closed list), the form checked (`checkForm`), its row's columns (`columnsOf`), its list links (`linksOf`), what it writes beside them (`writesOf`: by default its fields, the ones it gives over those it keeps, which its kind's rules build on: a skill's Skill Focus, a spell's school's Spell Focus, a class level's requirement of the previous level, an item's fields as the overrides of its template's), and the fields it keeps once written (`fields`, read off what it writes: `writtenValues`).
- **Deleted** (`planDelete(id)`): checked (`checkDelete`: the aptitude the general feats count toward), and what it writes with it (`deleteWritesOf`: a skill's Skill Focus).

An entity's parts a kind may have, past its own row, are its kind's methods, each bound to the entity as the view has it, and the engine's entry opens each by kind, refusing it as not found for a kind that has none ("No links for races"): the entities it owns (`owned(type, ownerId)`, an owned kind of its own on the same base: a class's levels, found among the class's; `describeOwned(type, ownedId)`, one by its id alone), the links of a role it edits one at a time (`links(type, ownerId)`: a class's skills, the role its kind's storage declares `editedLinks`, whose activities are named for the role and link to the entity's tab of its targets), its progression (`progression(type, ownerId)`: its owned entities at once) and its tables (`tables(type, ownerId)`: a class's spells per day). Their plans are generic (`engine/core/module/parts/entities/plans.ts`): an owned entity's carries its owner, its links by role (`links`, each a `LinkSet` that replaces the entity's of its role) and what its activity records (`activity`), a link's add its link (`LinkWrite`: its role, its target) and a removal its role and target, a progression's its owned entities by their place on the owner's track, and what refuses its save when what it writes is gone since it was read (`gone`). The server answers them all through `EntitiesService` (`Owned`, `Links`, `Progressions`, `getEntityTable`), under the entity's routes (`/rulesets/:id/entities/:entityType/:entityId/owned`, `/links`, `/progression`, `/tables/:table`, and `/rulesets/:id/entities/:entityType/owned/:ownedId` for an owned entity by its id alone; a progression's save sends what its kind's rules read, typed as the engine's entry exports it, `ProgressionForm`, and the tokens of the owned entities its client read, `ownedTokens`, and answers those it wrote, `ownedIds`), writing each owned row by the columns its module declares (`Entities.create` under its owner) and each link by its role (`EntityLinks.createMany` from its entity), and recording each as its kind's activity or its link's role's (`createClassLevel`, `addClassSkill` on `classSkill`, `updateClassProgression`).

## Legal

Material actually released as Open Game Content retains
the [Open Game License v1.0a](../OGL.md).
Neither a package's name nor its inclusion in the repository establishes
licensing coverage for every entry.

Key constraints:

- Include an explicit reuse grant and required attribution for third-party content contributions.
- Do not treat publicly available text, rules compatibility, or a book title as a license.
- Respect the applicable Product Identity exclusions and other upstream restrictions.
- Independent user-created content is not automatically OGL; inherited or adapted OGL content retains its applicable obligations.
- The in-app notice is shown only on system-seeded 3.5 source packages (`system: true`), not user forks. This display rule does not change content licensing.

See [OGL.md](../OGL.md) for the full license text and copyright notices.


## Universal vs Ruleset-Specific Code

How this codebase separates generic (cross-system) logic from ruleset-specific logic, and where to put new code.

### The principle

The codebase supports multiple rulesets (today: D&D 3.5). Code lives in one of two places:

- **Universal** — applies to any level-based tabletop RPG. No references to specific class names, spell levels, save categories, or game vocabulary.
- **Ruleset-specific** — implements the mechanics of a particular system (3.5's skill-point budget, Fortitude/Reflex/Will saves, wizard prohibited schools, spell level 0–9, etc.).

A working mental model: if a hypothetical 5e or PF2e ruleset were to be added tomorrow, **universal code must not need a line changed**, and all ruleset-specific code must live under that system's directory.

### Directory layout

The engine is the root `engine/`, which computes over the data it's given and reads nothing itself. Code outside it enters it through its one entry, `engine/index.ts` (`arkyvree/engine-front-door`), as the client enters the server through its API; a ruleset's seeders and codegen take its rows' types from its module's entry too, types alone (`engine/rulesets/dnd3.5/index.ts`):

```
engine/
├── index.ts                               ← the entry: Engine, its handles' and its operations' types, each entity
│                                          kind's rules (EntityKinds) and what an operation takes as every
│                                          registered ruleset's does (Accepted), RulesError
├── api/                                   (Engine and the handles it hands out, a class each, whose methods are the
│                                          operations: RulesetEngine, a ruleset's view bound by Engine.for, and its
│                                          handles by what the rules are about: CharacterEngine and its
│                                          LevelUpEngine, CharactersEngine, ModifiersEngine,
│                                          RequirementsEngine, TargetPathsEngine, and entities(type): an entity
│                                          kind's own class, from its module; describeFields, every entity type's
│                                          form's fields; describeSettings and planSettings, the ruleset's own;
│                                          ContentEngine, Engine.forRules; CopyOnWriteEngine, Engine.copyOnWrite;
│                                          ImportsEngine, Engine.imports: what a character file is, before a
│                                          ruleset is picked, each base rules' importers asked; RulesEngine,
│                                          Engine.rules: what each base rules' rulesets share, its words, kinds,
│                                          levels and license; Modules: each base rules' module, built once)
├── core/                                  ← machinery, no game vocabulary
│   ├── RulesError.ts                      (a rule's refusal, by kind, and the issues a character fails)
│   ├── module/                            ← the module's contract
│   │   ├── contract.ts                    (RulesetModule: a module's parts, typed by what it describes in its own
│   │   │                                  shape, Descriptions, its entity kinds and its seeded fields)
│   │   ├── parts/                         (a folder per part: characters/, levelUp/, entities/, imports/, content/, ruleset/.
│   │   │                                  Each holds its abstract class (CharactersPart, LevelUpPart…: the
│   │   │                                  operations a ruleset answers its own way abstract, those that read the
│   │   │                                  schema alone or guard a character's privacy and integrity concrete,
│   │   │                                  over hooks where a ruleset differs: describeInventory
│   │   │                                  over describeInventoryEntry, describeLinkPicks and planLinkPicks over
│   │   │                                  describeLinkRoom and fitLinks, describe and
│   │   │                                  describeForMember over describeFull and describePartial,
│   │   │                                  describeCard over describeFullCard,
│   │   │                                  planInventoryEntry over planPlacement, planScores and planStart
│   │   │                                  over describeScores and checkCreationPick, describeCreation over
│   │   │                                  describeScores, openCreationPicker over openPicker,
│   │   │                                  checkPublishable over findMissingContent,
│   │   │                                  toFieldsWrite over its codecs) and what its operations take and
│   │   │                                  answer, by role: requests.ts (a form's request, a query), plans.ts (a
│   │   │                                  named …Plan: what the server writes, by table), descriptions.ts (what a
│   │   │                                  describe* answers in a shape every ruleset shares); its index.ts)
│   │   ├── pickers.ts                     (what an open* answers, every part's pickers alike)
│   │   └── CharacterInputs.ts             (CharacterInput, CharacterRows: a character's rows as the server reads
│   │                                      them, its advancements and their picks by step and its links by role,
│   │                                      as stored, and their references resolved as the view reads them)
│   ├── view/                              (RulesetView, RulesetData: each kind's rows by name, typed by the
│   │                                      registry each module fills, ViewEntities, each entity's links by role,
│   │                                      ViewLink, its generic indices, what a module derives of it; RulesetComposition, by
│   │                                      its modules' storage, ViewSchema; the sibling merge: SiblingMerge,
│   │                                      SiblingRows)
│   ├── cow/                               (CowData, CowDataBuilder; CowSources: the source chain and the rows CowData
│   │                                      is read from)
│   ├── customizations/                    (ModifierEdits, RequirementEdits, on CustomizationEdits: an entity's
│   │                                      modifiers and requirements, bound to it, read from its bucket in the
│   │                                      view, described, and what they store, checked; TargetLabels: their
│   │                                      labels, one way; CustomizedEntity: the entity they're on, as the view
│   │                                      has it)
│   ├── entities/                          (RulesetEntity: an entity kind's steps, which a ruleset's kinds extend;
│   │                                      CustomizationPageEntity: a kind whose page shows its customizations;
│   │                                      MechanicEntity: a plain kind, which a module uses as it is; NAMED_LIST:
│   │                                      a kind's list by its name and description alone)
│   ├── fields/                            (Field: a field's declaration, FieldSpec, its kinds and the values they
│   │                                      read, shared/customization/fields.ts's bound to the view's kinds;
│   │                                      FieldCodec: an entity's fields read off its stored values, written,
│   │                                      its edit's merged, its template's overrides; FieldForms: the fields as
│   │                                      a form shows them and a save takes them, as they're declared;
│   │                                      DeclaredFields: the fields every module declares, their order, their
│   │                                      closed values and merges; OwnerValues: an owner's stored values,
│   │                                      StoredValues; FormField: a form's field, EntityFieldValues: its values)
│   ├── character/                         (CharacterBase: a character's state, its evaluators and its build, its
│   │                                      components set up and finished, the modifiers in rounds behind their
│   │                                      requirements, the ruleset's steps its hooks; the rows it has from outside
│   │                                      its source chain and the names its issues give, findSourceIssues and
│   │                                      resolveEntityName, over its ruleset's rows and names, listEntityRows and
│   │                                      nameEntity, each type in its ruleset's word, nameEntityType (its
│   │                                      module's kindLabels, RulesetData.labelOf); CharacterDataLoader: its
│   │                                      data, what every ruleset's reads
│   │                                      (LoadedCharacter: its campaign and player, its inventory's items, its
│   │                                      modifiers in order and the groups gating them, the rulesets its rows may
│   │                                      come from), the ruleset's parts, its modifiers' sources and its own data
│   │                                      its hooks (partsOf, sourcesOf, loadOwn); CharacterComponent: a component,
│   │                                      its initialize and its finalize; Validates: its issues, the ruleset's own
│   │                                      a hook; CharacterBuilder: a character of its row's kind, on
│   │                                      CharacterBase, its master built first)
│   ├── imports/                           (what every ruleset's importers share: ImportReport, what an import says
│   │                                      it did, and SourceLine, a line of the file it read)
│   ├── pickers/                           (Picker: one pipeline, `filters` and `describe(rows)`: the rows as the
│   │                                      view reads them, those it offers, each with whether who it picks for
│   │                                      meets its requirements and the tree of those it fails, and what it adds;
│   │                                      a ruleset's picker says what differs. CharacterPicker checks against the
│   │                                      character as the level-up plans it (`project`: its rows with what the
│   │                                      plan adds), its ruleset's build (`build`), built once)
│   ├── modifiers/ModifierEvaluator.ts
│   ├── requirements/RequirementEvaluator.ts
│   └── paths/                             (the path language: PathTraverser and the components it reads,
│                                          CategoryPaths and TargetPaths, PathCategory, PathChecks, PathCompletions,
│                                          LiteralValue, TemplateExpression)
└── rulesets/                              ← the rulesets that run on it (below)
```

The rulesets that run on it:

```
engine/rulesets/
└── dnd3.5/                                ← 3.5-specific implementation
    ├── index.ts                           (its entry: what the engine's takes of it, Dnd35Module; its rows'
    │                                      types, Klass, Feat…, which its seeders and codegen enter it by)
    ├── limits.ts                          (RULESET_LIMITS: the bounds its operations check on its columns)
    ├── Dnd35Module.ts                     (Dnd35Module.create(): the 3.5 module, by the contract, each part a class
    │                                      extending its abstract part)
    ├── descriptions.ts                    (Dnd35Descriptions: what the 3.5 rules describe in their own shape)
    ├── Dnd35TargetPaths.ts                (the categories' order; each labels the ruleset's names: labelNames)
    ├── model/                             ← what a character has, a folder per concept: its component, on core's
    │   │                                  CharacterComponent, and its paths' category (abilities/ aptitudes/
    │   │                                  classes/ feats/ identity/ spells/ saves/ skills/, AbilitiesComponent,
    │   │                                  AbilitiesPaths…), and the shared base
    │   ├── DetailedCharacter.ts           (which wires CharacterState, on core's CharacterBase, and its concerns/:
    │   │                                  Builds, the build's 3.5 steps, Diagnoses, its own issues and its
    │   │                                  entities' rows and names, PossessesVirtually, what its modifiers grant
    │   │                                  it as they apply, and core's Validates;
    │   │                                  CharacterComponents, the components in the order the build sets them up;
    │   │                                  Dnd35CharacterBuilder, on core's CharacterBuilder: a character of its
    │   │                                  row's kind)
    │   ├── loading/                       (DetailedCharacterDataLoader, on core's CharacterDataLoader, and
    │   │                                  LoadedCharacterData; its steps its concerns/: CustomizesEntities,
    │   │                                  LoadsPicks, ReadsRuleset; loadedEntities.ts: the entities it loads,
    │   │                                  CustomizedFeat, CustomizedSpell…)
    │   ├── combat/                        (CombatComponent on CombatState, which includes concerns/: ArmorClass,
    │   │                                  HitPoints, Attacks, InitiativeAndSpeed; ArmorsComponent, ShieldsComponent,
    │   │                                  WeaponsComponent, EncumbranceComponent; the combat, items.* and weapon.*
    │   │                                  path categories: CombatPaths, ItemsPaths, WeaponPaths)
    │   ├── spellcasting/                  (SpellcastingComponent on SpellcastingState, which includes concerns/:
    │   │                                  BonusCasterLevels, KnownSpells; SpellcastingPaths)
    │   ├── inventory/                     (InventoryComponent)
    │   └── bonded/                        (the bonded creatures' characters, an advancing one's feats and skill
    │                                      ranks scaled to its hit dice, BondedComponent, BondedPaths)
    ├── entities/                          ← the module's `entities`: an entity kind's rules, a folder per kind
    │   ├── Dnd35Entities.ts               (each kind's class, by its table: `of`)
    │   ├── ListedEntity.ts                (a kind a ruleset lists: a feat in a pool, a spell on a spell list)
    │   ├── abilities/ aptitudes/ classes/ feats/ items/ languages/ spells/ races/ saves/ skills/
    │   │                                  (XEntity: an entity described, what saving or deleting one writes; fields.ts:
    │   │                                  its codec, built from its vocabulary's fields, and their values;
    │   │                                  columns.ts: its form's columns and its list's; aptitudes/
    │   │                                  refusals.ts: what a feat's or spell's pools column says of
    │   │                                  a new one's empty list; classes/
    │   │                                  ClassLevelEntity, ClassSkills, ClassTable: a class's parts, which
    │   │                                  ClassEntity hands out; the mechanics are core's kind as it is)
    │   └── feats/                         (GeneratedFeats: the base of a set of feats an entity brings (featsOf),
    │                                      made in the pool a ruleset names, removed by a set that removes its
    │                                      feats; SkillFocusFeats, SpellFocusFeats: a skill's Skill Focus, a
    │                                      school's Spell Focus, sets of GeneratedFeats in the general feats' pool)
    ├── ruleset/                           ← the module's `ruleset`: what it answers of a ruleset as a whole
    │   ├── Dnd35Ruleset.ts                (findMissingContent: what a ruleset published to be played needs, which
    │   │                                  core's checkPublishable refuses it without; its fields, its Settings)
    │   └── fields.ts                      (RULESET_FIELDS: the ruleset's own fields, its skill points' ability and
    │                                      its progression: the feats and ability increases each level gives)
    ├── characters/                        ← the module's `characters`: what it answers of a character
    │   ├── Dnd35Characters.ts             (the module's characters)
    │   ├── NewCharacters.ts               (how a new character's ability scores are set: the SRD's methods, the
    │   │                                  scores' bounds and the one an unset ability starts at)
    │   ├── description/                   (CharacterDescription: the 3.5 API response shape, whole or partial
    │   │                                  (describeFull, describePartial), the feat that bonds each creature;
    │   │                                  CharacterResponse; what both sheets print, CombatSheet: the attacks and the
    │   │                                  speed, SpellGroups: the spells by list and level, and the
    │   │                                  slots per day by list, a feat's list's in its class's row)
    │   ├── inventory/                     (InventoryEntries: where an entry's add or edit holds its item,
    │   │                                  planPlacement; Equipping: what equipping an item checks)
    │   └── sheet/                         (the printed sheet, in React PDF: CharacterSheet and its pages, SheetFormat)
    ├── imports/                           ← the module's `imports`: Dnd35Imports, its importers; ImportedCharacter:
    │                                      a program's file read into the character it holds, in its own names;
    │                                      PicksPlacement and ImportedLevelGains: a file's feats, ranks and spells
    │                                      placed on levels; pcgen/: PCGen's importer, its name table (names.ts,
    │                                      PcgenNames), and what it imports, ScoresImport, LevelsImport, GearImport,
    │                                      PcgenImport; pcgen/file/: PCGen's file, PcgenFile, by its format's
    │                                      reader, PcgFormat2, its lines PcgLine's
    ├── levelUp/                           ← the module's `levelUp`: Dnd35LevelUp, on core's LevelUpPart, plans a
    │                                      level-up, an edit, a removal and the bonded creatures over its flows,
    │                                      and gives the rules they read (LevelUpRules: buildCharacter,
    │                                      getAbilityIncreaseTotal, hitPointsOf, unrolledLevelHp,
    │                                      planBondedCreatures, BondedPlans; and the save's hooks, the issues an
    │                                      edited level answers for, findEditedLevelIssues). LevelUpBase: what
    │                                      every flow reads, the view, the character's rows (its advancements and
    │                                      their picks by step, as stored) and the rules; SelectionChecks: a level's hit points
    │                                      and selections checked; LevelRemoval, BondedCreatures, LevelsPlanning (a
    │                                      save's and an edit's checks, in their order) and LevelByLevel (levels
    │                                      saved one at a time, an import's); CharacterProjection: the rows a
    │                                      level-up adds before it's saved, levels added, replaced or left out, and
    │                                      the picks at them; requests.ts and plans.ts, what the flows take and
    │                                      write. A class per 3.5 operation on LevelUpState (on LevelUpBase, with
    │                                      the steps the plan's answer and its save share, the skills step its
    │                                      concern, SpendsSkillPoints: what the form's skill points come to, as a
    │                                      save spreads them; and a pool's room: the picks fitted to their pools,
    │                                      fitPicks): PlannedLevelsState, the planned levels, what they give (each
    │                                      level's pool slots, its concern PlansAptitudeSlots) and their picks
    │                                      spread over them (PicksDistribution: the feats and spells in each
    │                                      level's pool slots, none dropped, the skill points class-skill levels
    │                                      first, within each level's rank caps, and the picks that overfill a pool
    │                                      refused, refuseOverfull), which LevelUpPreview (Add Level's plan's
    │                                      answer) and LevelUpPlan (what the save asks: the planned levels read,
    │                                      their picks spread, the pools picks overfill) build on; LevelUpSteps: an
    │                                      edited level's ability increase, skills, feats and spells, which an
    │                                      edit's plan answers; LevelSelections: a saved level's selections, with
    │                                      each feat's pools
    ├── pickers/                           (the 3.5 pickers, on core's: ClassPicker (a class's next level, a plan's
    │                                      track picker) on CharacterPicker; LevelPicker (FeatPicker, SpellPicker)
    │                                      on CharacterPicker: the level it picks at, with the feats picked so far,
    │                                      leaving out what the character holds with every level it has and plans
    │                                      (`holder`), each level at its unrolled hit points; RacePicker on Picker,
    │                                      checking a new character's form)
    ├── content/                           ← the module's `content`: Dnd35Content, what the seeders and the codegen
    │                                      ask: BookPaths, and the codecs of the fields they seed
    ├── rules/                             (the rules several sides read: AbilityRules, LevelRules, SkillRules,
    │                                      ItemPlacement and InventorySlots: where an item goes and an entry's
    │                                      slot, SpellLists: the view's spell lists, and WeaponRuleFeats: its feats
    │                                      that change a weapon rule, each derived once with it
    │                                      (`RulesetData.derive`), BondedRaceData: a bonded creature's stat block;
    │                                      over the books' numbers in vocabulary/dnd3.5/)
    └── view/                              (rows: its kinds' rows, declared into the view's registries, and a
                                           character's; Dnd35View: its lists, its links by role and its indices, derived once with
                                           the view; kindLabels: what its refusals call each kind)
```

In the server: what reads the rows an operation takes (`server/services/characters/characterInputs.ts`: `readCharacterInput`, `readChildInputs`), and what writes what an operation plans (`server/services/rulesets/entityWrites.ts`: `writeEntityWrites`; `levels/childWrites.ts`: `writeChildren`). The PDF job (`server/jobs/generatePdf.ts`) and the shared PDF route render the document `character(input).describeSheet` answers. The server names no ruleset and builds no character: it reads, asks the engine and writes. Each of its actions asks the engine one operation, which answers it whole (`arkyvree/one-engine-op`): a plan carries what it answers once written, a picker or a list its filters, a description all its page shows. It binds the engine to the view as its scope gives it (`Engine.for(scope)`), reading of it only the copy-on-write data (`rulesetData.cow`: the source chain its reads filter by, what `EntityNames` and `CustomizationEdit` check and write by; `arkyvree/opaque-view`).

```
server/
├── jobs/generatePdf.ts                    (renders the printed sheet the engine describes)
├── services/
│   ├── characters/
│   │   ├── characterInputs.ts             (a character's rows, read in its ruleset's scope: what the engine builds it from)
│   │   ├── editableCharacter.ts           (withEditableCharacter: a level-up read's scope and character)
│   │   ├── inventory/CharacterInventoryService.ts
│   │   ├── modifiers/CharacterModifiersService.ts
│   │   └── levels/                        ← the level flows: they read, ask the engine's level-up and write
│   │       ├── CharacterLevelsService.ts  (a save, an edit, a removal: levelUp().planLevelUp, planLevelEdit,
│   │       │                              planRemoval, each with what the character's children become)
│   │       ├── concerns/                  (Plans: a level's steps, the plan's answer, a step's picker's page,
│   │       │                              a saved level's plan)
│   │       └── childWrites.ts             (the children the engine plans, written: 3.5's bonded creatures)
│   └── rulesets/                          ← entity CRUD for feats/spells/aptitudes/…
│       └── entityWrites.ts                (what the engine plans a form writes beside its row, written)
└── routers/
    └── api/
        └── characters/
            └── levels/index.ts            ← the level routes
```

### What goes in `engine/` vs `dnd3.5/`

#### Universal (anything of these is a sign the file belongs in `engine/` or is a generic type)

- Takes a level-based character (abilities/class/levels/feats/spells in the abstract) and operates on it.
- No hardcoded game values (spell level = 9, class names, save names, skill rank bounds).
- No `SPELL_SCHOOL` / `WIZARD_PROHIBITED_SCHOOL` / 3.5-specific field names.
- Doesn't cast to the 3.5 `DetailedCharacter` or narrow to 3.5 types.
- Asks the ruleset for what's its through the module's contract (its fields, which order an owner's stored values, its target paths' `getEntityNamingCategories`) instead of hardcoding.

#### Ruleset-specific (signs the file belongs in `dnd3.5/` or a sibling ruleset dir)

- Uses 3.5 concepts in types/signatures: `rank`, `spellLevel` as spell level 0–9, `saveName` as Fortitude/Reflex/Will, class-skill distinctions, wizard prohibited schools, BAB progression.
- References named classes/spells/feats/mechanics: "Wizard Spells", "Fighter Bonus Feat", "Power Attack", "specialization school".
- Computes a 3.5-shaped result: `{ total, available, spent, perlevel }` skill budget, a `computeSkillPointsPerLevel` in the level-up (`PlannedLevelsState`), etc.
- Imports from `@/engine/rulesets/dnd3.5/*` or casts to a `Dnd35*` type.

### The type split pattern

The engine's types keep the narrowest surface any level-based system could implement: the module's contract (`engine/core/module/contract.ts`), the rows it takes (`CharacterInputs.ts`), its operations' types by role, and what its machinery reads, each beside its area (`RulesetView` in `core/view/`, `Components` and `TargetPaths` in `core/paths/`). A ruleset's types are its own, each beside what produces it. A part's types sit beside it, in its folder (`engine/core/module/parts/<part>/`: its abstract class, and its index), and sort there by role, as their operations' verbs do: what an operation takes is `requests.ts` (one named type per input: a form's request, `NewCharacterRequest`; a level's plan, the level-up's `LevelPlanRequest`, in `mechanics.ts`; whether to force the rules is always the operation's last argument, never a request's field), what a `plan…` answers is `plans.ts` (a named plan, never a bare list: `LevelsPlan`, `ScoresPlan`, `ChildrenPlan`, `EntityCreatePlan`, and the rows it writes, `LinkPlan`; a level's, its advancement's track and its picks by step, `AdvancementPlan`, `PickPlan`), what a `describe…` answers in a shape every ruleset shares is `descriptions.ts` (`CharacterCard`, `ScoreBounds`; a level step's, by its mechanic, with its plan request and its picker's query, is the level-up's `mechanics.ts`), and what an `open…` answers is the module's `pickers.ts`, which every part's pickers share. So a part's folder holds its whole contract: the characters' requests are `parts/characters/requests.ts`, and a type another part reads is imported from its owner's index. A ruleset's level flows are its own: 3.5's read a plan into what they take (`LevelUpRequest`, `LevelEditRequest`, its `levelUp/requests.ts`), write what a save writes as core's plans (`AdvancementPlan`, its hit points, ability increases, skill ranks, feats and spells as `PickPlan`s), and project what a level-up adds as stored rows (`CharacterProjection`: advancements and their picks by step), which it builds a planned character from as it builds a saved one, so what a level grants and what a pick carries are read one way.

```ts
// engine/core/module/contract.ts  (universal): each part an abstract class of `parts/<part>/`, which a ruleset extends
export interface RulesetModule<D extends Descriptions, E extends EntityKindsContract, F extends Record<string, Fields>> {
  characters: CharactersPart<D>;
  content: ContentPart<F>;
  entities: EntitiesPart<E>;
  fields: Readonly<Record<string, Fields>>;
  levelUp: LevelUpPart<D>;
  ruleset: RulesetPart;
  createTargetPaths(): TargetPaths;
}

// engine/core/module/parts/levelUp/LevelUpPart.ts  (universal): what the server reads is a core type, what it hands the
// client as it is the ruleset's own (`D`)
export default abstract class LevelUpPart<D extends Descriptions> {
  // A level's steps by their mechanics (`mechanics.ts`): the plan's answer, a step's picker, a saved level's plan
  abstract listSteps(view: RulesetView, character: CharacterInput, edited: boolean): LevelSteps;
  abstract describePlan(view: RulesetView, character: CharacterInput, request: LevelPlanRequest): LevelPlanAnswer;
  abstract openStepPicker(view: RulesetView, character: CharacterInput, step: string, query: StepPickerQuery): D["stepPicker"];
  abstract describeSavedPlan(view: RulesetView, character: CharacterInput, characterLevelId: string): LevelPlanRequest;
  // What a plan's save, an edit, a removal write, checked, with what the character's children become
  abstract planLevelUp(view: RulesetView, character: CharacterInput, children: CharacterInput[], request: LevelPlanRequest, force: boolean): LevelsPlan;
  abstract planLevelEdit(view: RulesetView, character: CharacterInput, children: CharacterInput[], characterLevelId: string, request: LevelPlanRequest, force: boolean): LevelEditPlan;
  abstract planRemoval(view: RulesetView, character: CharacterInput, children: CharacterInput[]): LevelRemovalPlan;
  abstract planChildren(view: RulesetView, character: CharacterInput, children: CharacterInput[]): ChildrenPlan;
}
```

A level's steps are mechanics, which core describes in no game's nouns (`engine/core/module/parts/levelUp/mechanics.ts`): `plan` (which track each advancement takes, at its next position: 3.5's class plan), `value` (a number per advancement within bounds: its hit points), `choose` (options an advancement raises by an amount: its ability increase), `spend` (points over rows, each buying value at its own rate: its skills) and `pick` (entities of a kind into pools, each with its room, maybe by tier: its feats, and its spells by level). The module lists a level's steps (`listSteps`: each its name, mechanic, label, the kind it plans, chooses, spends over or picks, its pools' kind, and its mechanic's words, `StepWords`, which the wizard shows past its label and its kinds' words; an edit's without its plan step; and the words its advancements take, `AdvancementWords`, whatever step shows them), and answers a plan in their shapes (`describePlan`: each step's answer by its name, and the plan's advancements), Add Level's plan and Edit Level's level (`editedLevelId`) alike. A plan request is each step's payload by its name (`LevelPlanRequest`), which the level-up handle reads by the steps' mechanics as it enters (`LevelRequests.resolvePlan`: each payload in its mechanic's shape, `Payloads`, each id it names the view's, by its step's kind; a save's, `resolveSave`, answering every step), and the module plans its save and its edit from (`planLevelUp`, `planLevelEdit`): what they write, each advancement's track and its picks by step (`AdvancementPlan`, `PickPlan`: its value step's among them, 3.5's hit points), an edit's picks in place of those its advancement had. A `pick` step's answer names what fits (`picked`: each entity by name, at its tier). A saved level opens as an edit's plan (`describeSavedPlan`: each step's payload as the level saved it). A step's picker opens over the plan (`openStepPicker`), naming the kind the server reads a page of: a `plan` step's reads tracks (`OpenedTrackPicker`: its kind's rows, those the character advanced on first, each with its place on the track), a `pick` step's options or their groups. The routes are `GET /api/characters/levels/:characterId/steps`, `POST …/:characterId/plan`, `POST …/:characterId/options/:step`, a saved level's plan (`GET …/:characterId/:characterLevelId/plan`), and a plan's save and edit (`POST …/:characterId`, `PUT …/:characterId/:characterLevelId` with its `steps`).

```ts
// engine/rulesets/dnd3.5/levelUp/Dnd35LevelUp.ts  (the 3.5 module's own)
export default class Dnd35LevelUp extends LevelUpPart<Dnd35Descriptions> { … }

// engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts  (3.5's): what a level-up adds before it's saved, as the rows
// it would save, which it builds the character from as from saved rows
const projection = new CharacterProjection(input);
projection.dropLevelsFrom(editedLevelId); // the character as it was before a level
const level = projection.addLevel(klassLevelId, { abilityIncreases, hp, replacing }); // or a level replaced where it stands
projection.pick(level, picks); // its feats, spells and skill ranks, as a save writes them (`PickPlan`s)
Dnd35CharacterBuilder.build(view, projection.input);
```

A module is typed by the contract: each part is an abstract class of `engine/core/module/parts/<part>/`, which a ruleset's part extends, so the compiler lists every operation a part lacks ("Non-abstract class 'Pf1LevelUp' is missing implementations for the following members of 'LevelUpPart'…"). `Modules.of(baseRules)` hands each module out as the contract's type (`Module`, over what the registered modules describe), and each handle's operation takes its arguments from its part's abstract method, past those the handle binds (`Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>`), so the server calls an operation with the contract's types, naming no ruleset:

```ts
// server/services/characters/levels/CharacterLevelsService.ts
return await withEditableCharacter(db, session, characterId, (scope, character) =>
  Engine.for(scope).character(character).levelUp().describePlan(request),
);

// engine/api/LevelUpEngine.ts
type Args<K extends keyof Module["levelUp"]> = Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>;

export default class LevelUpEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly input: CharacterInput,
  ) {}

  describeSavedPlan(...args: Args<"describeSavedPlan">) {
    return this.module.levelUp.describeSavedPlan(this.view, this.input, ...args);
  }
}
```

The engine's own types name no ruleset (`arkyvree/layers`): its path walk reads `Components`, which the 3.5 character narrows to its own (`Dnd35Components`).

### The module's parts

What a ruleset answers is its module's: six parts, each a class whose operations call the classes its domain folders hold, and the factories and the order the machinery calls. A character isn't one of them: an operation builds the ruleset's own (`CharacterBuilder.build`), from the input it's given. The entry's handles ask them, each past what it binds (the view, a character's rows, a class).

| Member | What it answers | 3.5's | The handles that ask it |
|---|---|---|---|
| `characters` | a character's sheets (the API's, a campaign member's reading, partial or whole, the printed one), a list's card of one, its inventory (each entry with where its item can go and where it's worn), how a new one sets its scores (3.5's ability scores: the ruleset's abilities in the order its sheets list them, the methods its form runs by kind, the scores' bounds, each score's modifier), what a new one and an inventory entry store (what equipping an item checks), what keeps a slot from taking an item, its links by role (a scored link's amounts, 3.5's ability scores; a picked link's picks and what they leave room for, a new one refused past that room, 3.5's languages), the options a new character's creation pick offers (3.5's races) | `Dnd35Characters`: `describeSheet`, `describePlacement`: each named as its handle's operation is; `describeCard` is `CharactersPart`'s, over its hook `describeFullCard` (3.5's `CharacterCards`: its chips, its race's which a partly seen character shows, then its classes at their highest level), keeping a partly seen character's to the chips its ruleset marks; `describeCreation` (over `describeScores`: 3.5's `NewCharacters`) and `openCreationPicker` (over `openPicker`: 3.5's race picker) are `CharactersPart`'s, refusing a link or a column the character's storage doesn't declare; `describeInventory` (over its hook, `describeInventoryEntry`: 3.5's `InventoryEntries`, by `ItemPlacement`) is `CharactersPart`'s, which reads the schema's rows and the view alone, and so are `describe`, `describeForMember`, `planInventoryEntry`, `planScores`, `planCreate`, `planStart`, `describeLinkPicks` and `planLinkPicks`, which guard a character's privacy and integrity over 3.5's hooks (`describeFull`, `describePartial`: `CharacterDescription`; `planPlacement`: `InventoryEntries`; `describeScores`: `NewCharacters`' creation, its bounds among it; `checkCreationPick`: a player character's race; `describeLinkRoom`, `fitLinks`: `SpokenLanguages`, by `LanguageRules`). The part reads a link's kind, and whether it's scored (with an amount) or picked, by its module's storage (`StoredCharacter.links`, whose role names its entity type), which it takes as it's made | `character(input)` (`CharacterEngine`), `characters()` (`CharactersEngine`) |
| `entities` | each entity kind's rules, by its table: an entity found and described, a page opened (`openList`), what saving or deleting one writes, what the rules refuse of an edit; an entity's parts its kind may have (a class's levels, class skills, progression and tables) | `Dnd35Entities`: `of(view, type)`, each kind's class (`SkillEntity`, `FeatEntity`, `ItemEntity`…; `ClassEntity`'s `owned(klassId)`, `links(klassId)`, `progression(klassId)`, `tables(klassId)`) | `entities(type)`, `owned(type, ownerId)`, `links`, `progression`, `tables`, `describeOwned` |
| `levelUp` | the level flows: a level's steps and the plan's answer, a save's levels and its check (its picks refused when they pick a spell the character knows in its pool already or overfill a pool, forced or not; the character with them, unless forced), a saved level's edit, the last level's removal, the children the levels make (3.5's bonded creatures), a step's picker, a saved level as an edit's plan | `Dnd35LevelUp`: `listSteps`, `describePlan`, `openStepPicker`, `describeSavedPlan`, `planLevelUp`, `planLevelEdit`, `planRemoval`, `planChildren`: each named as its handle's operation is, and as the class it opens names it (`LevelPlans`, over `LevelUpPreview` and `LevelSelections`; `LevelsPlanning`, `LevelRemoval`, `BondedCreatures`, over the rules it gives, `LevelUpRules`) | `character(input).levelUp()` (`LevelUpEngine`) |
| `imports` | a character imported from another program's file: what a file is (`detect`: the program that saved it, its version, its format and its character's rules, as the first importer that recognizes it says, and why it can't import it), the ruleset's importers each a program's, tried in order, and what importing one writes, as if leveled up one level at a time (each level a level-up of its own, checked as one, `LevelByLevel`), with the report of what it imported and every line of the file it couldn't match | `Dnd35Imports`: PCGen's importer (`PcgenImporter`), which reads a file of PCGen's 3.5 game mode through its `PcgenFile` (its format's reader, `PcgFormat2`, into a program's names, `ImportedCharacter`), then matches it in the ruleset through PCGen's name table (`PcgenNames`, `names.ts`) and places its feats, skill ranks and known spells on its levels (`PicksPlacement`, over each level's gains, `ImportedLevelGains`); `detect`, `describeImporters` and `planImport`, which picks the importer, are `ImportsPart`'s | `characters()` (`CharactersEngine`: `planImport`); `Engine.imports()` (`ImportsEngine`: `describeFile`, every base rules' `detect`) |
| `ruleset` | what a ruleset needs as a whole, past its entities: to be published to be played, a player race and class, a skill and a feat; its own fields, its Settings (the skill points' ability, the feats and ability increases each character level gives; read off its chain's rows, the fork's first, and what their save writes); what every ruleset of its base rules shares, its entity kinds (its ruleset page's tabs, in order, each with its picture and its help), a word for every type (the engine's own, `modifiers`, merged in by `describeRules`), the kinds a race or a class is for, a listed entity's tiers (3.5's spell levels), how a class progresses (its last level among it) and its license | `Dnd35Ruleset`: `findMissingContent`, which `RulesetPart.checkPublishable` reads (an extension needs none); its `fields` (`RULESET_FIELDS`), which `RulesetPart`'s `describeSettings`, `describeSettingsFields` and `planSettings` read; its `rules` (`RULES`, a `RulesDescription`), which `describeRules` answers | `checkPublishable`, `describeSettings`, `planSettings`, `describeFields`; `Engine.rules().describeAll()` |
| `content` | what the seeders and the codegen ask: the paths a book can target, an entity's fields as the write of its stored values | `Dnd35Content`: `listBookTargetPaths`, and the codecs of its seeded fields, which `ContentPart.toFieldsWrite` writes with | `Engine.forRules(baseRules)` (`ContentEngine`) |
| `createTargetPaths`, `fields` | the ruleset's path categories, its owners' fields: each entity type's and its rulesets', in stat-block order (which the view orders an owner's stored values by: `DeclaredFields`), and their closed values | `Dnd35TargetPaths`, `ENTITY_FIELDS` | `targetPaths()`, `modifiers(…)`, `requirements(…)`; the view's order of every owner's stored values (`DeclaredFields`) |

What the characters part guarantees, whatever the ruleset: the operations that guard a character's privacy and integrity are `CharactersPart`'s, template methods over hooks for what a ruleset describes or checks its own way, so a ruleset supplies the hooks and can't skip a check. `tests/engine/core/module/dnd3.5/ModuleConformance.test.ts` runs them on each registered module, with its seeded characters.

- **Private notes**: `describe` and `describeForMember` apply the reading. A reader who doesn't read the notes (a member's `hide` or `partial` reading, a share link's `hide`) is described from rows without them (the character's, its master's, its bonded creatures'), and the sheet's `fields` blocks hold none, where every ruleset's sheet holds them (`NotedSheet`, which `Descriptions["sheet"]` extends: its blocks and its summary, its bonded creatures' subsheets among its blocks, which hold no notes). The API answers a sheet's blocks, its summary, its diagnostics and its row's columns, none of its parts as its ruleset holds them (3.5's `CharacterResponse.toResponse`, over the sheet its blocks are built from, `buildSheet`). A partial reading is the ruleset's allowlist (`describePartial`), given no bonded creatures; the sheet is its `describeFull`.
- **Partial readings**: `describeCard` keeps a partly seen character's card to the chips its ruleset marks as its partial reading's (`CardChip.partial`), and `describeForMember` gives a partial reading's summary no tracks, whatever its ruleset's `describePartial` answers: a campaign's roster and a partial sheet's header name no class.
- **Sheet blocks**: a sheet describes itself as a list of typed blocks, in its module's order, each titled in its words (`blocks`, `SheetBlock` in `engine/core/module/parts/characters/blocks.ts`), which the client renders a component per kind, whatever the game, and every ruleset's sheet holds (`NotedSheet`): `scores`, values in boxes, each its label and short label, its value (signed or not), a badge (a modifier, toned by its sign), its parts, and its base where it's the character's own, which its owner sets within its bounds (the block's `edit`, with the role of the scored link its bases are, `role`, and what a lower base's confirmation and its failure say, each base written under its score's key, `PUT /characters/:id/scores/:role`; 3.5's ability scores, its bounds the ones its save enforces, and saving throws); `stats`, a line of label/value stats, then panels, each a heading and its note, compact boxes and a table, either optional (`SheetTable`: its columns, each its label, width, alignment and where a phone shows its cells, an empty one hidden where it may be, and its rows, a name's caption and alert; 3.5's combat, its weapon sets with their armor classes and attacks); `table`, a note above a table, its rows grouped where a family two or more share has a header (`SheetRow.group`, each by its name within it: 3.5's skills); `entries`, the entities of a kind the character holds, each linked to its page, its count when it's held more than once, its description and the creature it bonds (`Subsheet`: its scores, stats and chips), and those granted apart (3.5's feats and special abilities, each bonded creature on the feat that bonds it: `SheetBlocks.bond`); `pools`, entities of a kind by pool and tier, each tier's note, each entry's cells, tags, details and description, and the counts each pool's tiers allow (3.5's spells, its slots per day; none for a character with neither); `inventory`, the items the character holds, each its item's name and description, where it's held, how many, its weight and cost, whether it's in use and its charges, the load they make, the units its figures read in (3.5's gold pieces and pounds) and every word its table, dialogs and toasts say (3.5's equipment); and `fields`, the character's own fields, lines of them and those under them, each by its kind (a fixed text, a whole number at least its least, required or clearable, a select of its options, a text of several lines), each by the key its edit sends it, its picked links (`links`: each link's role, its picker's words and the entities it has, which its edit sends by role and its picker reads, `GET /characters/:id/links/:role`: 3.5's languages, `speaks`) and its notes, its private ones left out for a reader who doesn't read them (3.5's identity, `IdentityFields`): `SheetBlocks`. A partial reading has its `fields` block alone, its race and physical traits. Its summary (`summary`, `SheetSummary`) is its header's line: the tracks it advances on, each its label at its position, its page, its popover's words and its advancements (3.5's classes, each at its level: `SheetSummaries`), none for a partial reading, what stands between two on the line (`separator`), and the words of the page's level actions (`words`: adding one, removing the last, confirming it and its toasts); a list's card is its chips (`CharacterCard.chips`, each marked whether a partly seen character shows it). An edit of a character's fields sends them by their keys (`PUT /characters/:id`'s `fields`), which its ruleset reads into its stored fields, each checked (`planEdit`, over the part's `planFields` hook, with each picked link's `planLinkPicks`: 3.5's languages).
- **Inventory**: `planInventoryEntry` reads an added item as the view has it (`RequestIds`: a copy's for its source's id), refusing one the view shows none of (unknown, of neither the character's ruleset nor its source chain, or deleted), as `planLinkPicks` and `describeLinkPicks` refuse a picked link's entity, and charges set one without the other or remaining past total; the ruleset's `planPlacement` answers where the item is held, with what equipping it there checks, and the plan names the item by the view's id.
- **Picked links**: `describeLinkPicks` and `planLinkPicks` read each entity a request names of a picked link (3.5's `speaks`, its languages) as the view has it, refusing one not of the character's ruleset or named twice; the ruleset's hooks answer what the character has without a pick and what one more may add within the room its picks take (`describeLinkRoom`), and the picks an edit stores (`fitLinks`), a new one refused past that room, never one the character keeps, so a removal always saves.
- **Scored links**: `planScores` and `planCreate` refuse an amount of a scored link (3.5's `score`, its ability scores) past the bounds its `describeCreation` gives (`scores`), an entity not of the ruleset or given two amounts (by its source's id and its copy's), and `planStart` (which `planCreate` plans its start by) a creation pick (each single link of the character's, by role: 3.5's `race`) not of the ruleset, or one its rules refuse (`checkCreationPick`: 3.5's race not a player's, of kind `pc`); an unset amount starts at the bounds' `start`, and each is planned under the view's id of its entity, the pick too.
- **A new character's form**: what a new character's dialog shows is its rules' form (`RulesDescription.characterForm`, `CharacterForm`: 3.5's `CHARACTER_FORM`), sections in its order, each a scored link's amounts (`scores`, by its `role`: 3.5's ability scores, `score`, set the ways `describeCreation` answers for it, `GET /characters/creation?role=`) or its lines of items, the form's own (its name, ruleset and notes, and its creation picks, `pick`, each a single link's entity by its `role`, picked from its picker, `GET /characters/creation/:role`: 3.5's race, `race`) or its ruleset's fields, each its kind, its label, its bounds and what it says without a value, and the fields that narrow the picks' options (`narrows`); its create sends its picks by role (`picks`), its scores by role (`scores`) and its fields by their keys (`fields`), which `planCreate` hands its ruleset's hook alone (`planNewFields`: 3.5's `NewCharacters.planFields`, which refuses one its form hasn't, a value its field doesn't take or a required one missing, and writes nothing of an empty one): the core holds what a ruleset's fields are keyed by, not what they take. The conformance test plans a create from every field each module's form describes, its optional ones left out, and holds its keys apart from the form's own values' names and free of dots (a form's path).

A part's operation is a method of a handle of `engine/api/`, which `Engine` hands out, dispatched by the view's base rules (`Modules.of(view.ruleset.baseRules)`, which `Engine.for(scope)` reads once; a content operation by the base rules its caller names, `Engine.forRules(baseRules)`, with that module's own types: its seeded fields). The target paths' handle asks the target paths (`targetPaths()`: `list`, `validate`, `getCompletions`, which `CategoryPaths` answers, over `PathChecks` and `PathCompletions`; `planModifier`, a character's modifier's row, as an entity's modifier plans its own: `ModifierEdits.rowOf`, its value checked by `CategoryPaths.checkValue` and a number stored as the sheet reads it, `LiteralValue.normalize`), and the view's build asks the order (`Engine.copyOnWrite().buildView`). The customizations', which no ruleset changes but by its factories, ask the core's classes (`engine/core/customizations/`): `ModifierEdits` and `RequirementEdits` (on `CustomizationEdits`, bound to the entity as their handles are) describe an entity's modifiers and requirements and plan their saves, a row checked against its target paths (`modifiers(entityType, entityId)`: `describe`, `describeAll`, `planCreate`, `planEdit`, `planDelete`, and `requirements(…)` alike; a list's, `targetPaths().describeModifiers`, labeled as the entity's are: `TargetLabels.describe`), on the entity the view has (`CustomizedEntity.find`, refused as not found otherwise). Copy-on-write's (`Engine.copyOnWrite()`) ask the core's classes too (`CowSources`: `buildSourceChain`, `getReads`; `SiblingMerge`: `mergeCustomizations`). `entities(type)` hands out a kind's class, whose `find` and `describe` read the view (`RulesetData.find`; a customizable kind's `describe` with its customizations), and whose saves read its fields against their declarations (its codec, `FieldCodec.parse`); `describeFields` gathers every kind's form's fields (`describeFields`, an owned kind's through its owner's, `describeOwnedFields`: a class level's) and the ruleset's Settings' (`describeSettingsFields`); `checkPublishable`, `describeSettings` and `planSettings` ask the ruleset part, whose `checkPublishable` an extension passes. An operation takes the data its caller read: the view (`RulesetView`: the ruleset and its `rulesetData`), which `Engine.for` binds, a character's rows (`CharacterInput`: its record, its rows, a bonded creature's master's), which `character(input)` binds, a request's body. It answers data:

- **A description**: what the API answers (`character(input).describe`, `owned(type, ownerId).describeAll`), a picker's or a list's filters, which the server reads a page with, and what describes the page it read (`levelUp().openStepPicker`'s `describe`, `entities("feats").openList`'s `describe`), the printed sheet's document (`character(input).describeSheet`).
- **A plan**: what to write, without ids, always a named object (its part's `plans.ts`: `LevelsPlan`, `ScoresPlan`, `InventoryEntryPlan`, `ChildrenPlan`…), never a bare list. `EntityWrites` is what an entity's form writes beside its row: the stored values its fields are kept in (`fields`, a `FieldsWrite`), a requirement on it, the entities it makes (`made`: each with its table, its row's columns, its stored values, its list links and its customizations; 3.5's Skill Focus and Spell Focus, sets of its `GeneratedFeats`, `engine/rulesets/dnd3.5/entities/feats/GeneratedFeats.ts`), and those it removes (`removed`, by table and id). A level-up's is each level's writes (`LevelWrites`: its row's columns, and its rows under it by the name of the pick its module declares each under: 3.5's ability increases, each an ability and an amount, and its picks), and what the character's children become with them (`levelUp()`'s `planLevelUp`, `planLevelEdit`, `planRemoval`; the seeders', `planChildren`: a child it makes as its row whole, after its parent's, with its links by the name its module declares each under, each an entity and its amount, `LinkPlan`: 3.5's ability scores), which the service writes as they are, pick by pick and link by link. A plan whose save answers the entity carries what it answers once written (`describe(row)`: the saved row with the fields the save keeps, `entities("skills").planCreate`). The server writes a plan in its transaction (`writeEntityWrites`, `writeChildren`), which reads of the view only its copy-on-write data, and of the database what a write depends on: whether a grouping's feats are there already, whether a character picked a feat it removes.
- **A refusal**: a `RulesError` naming its kind (`invalid`, `unprocessable`, `conflict`, `not-found`), which the server answers as its error of that kind (`checkPublishable`, and a plan's own: `character(input).planInventoryEntry` an item the character can't equip where asked, `character(input).planLinkPicks` a new language past the room its rules give the character's picks, or a secret one, `entities("aptitudes").planEdit` renaming a pool the characters count on by name). What a character fails is refused with its issues (`RulesError.refuseIssues`): `levelUp().planLevelUp` refuses the character with its new levels, unless forced.

Its verb says which: `describe…`, `get…` and `list…` answer what something is, `open…` a picker or a list, `plan…` a plan, `check…` refuses or answers what it checked, `validate…` a path's validation, `build…` the view, its copy-on-write data and its source chain (`buildView`, `buildData`, `buildSourceChain`), `merge…` the rows a copy takes of its siblings, and `to…` a conversion (`toFieldsWrite`). A method named for a noun hands out a handle (`character(input)`, `owned(type, ownerId)`, `entities("skills")`, `levelUp()`), and isn't an operation (`arkyvree/one-engine-op`).

An entity's fields are declared once, by the ruleset's vocabulary, as data (3.5's `ENTITY_FIELDS`, `vocabulary/dnd3.5/fields/entityFields.ts`, written `as const`): each field's name, the stored field that keeps it (a reference's, the role of its owner's link), its label and what it's for, its kind, its closed values or what it names, its default and bounds, when it counts and where its form shows it, the shape `FieldSpec` gives (`shared/customization/fields.ts`, which a ruleset's content types its seeds' fields with too, `PartialFieldValues`; the engine's `engine/core/fields/Field.ts` binds a reference to its view's kinds). Its kind's folder builds the codec that reads and writes them (`FieldCodec`), adding only its rules (`storesWhen`): `entities/skills/fields.ts` builds `SKILL_FIELDS`, from which come the fields' values (`SkillFieldValues`), their defaults, the stored fields that keep them, their reading off an owner's stored values (`read`, `StoredValues`: a field's values by its name, a reference's link by its role) and their writing back as a `FieldsWrite`, every field and link role the codec declares, each replaced by its values (`write`; an item's over its template's, `toOverrides`, which clears what the template holds alike), an edit's merge, when one counts (`when`: on another field, which reading and writing apply, or on a column, which its form reads), the form's fields as they're declared (`describe`, by `FieldForms`) and a save's reading of a form's fields against those declarations (`parse`: those it gives, a key no field, a value outside its closed list or a reference the view lacks refused as invalid, by field). Its entity class describes it and plans its saves with them (`skills/SkillEntity.ts`: its `fields`, and what a save writes beside its row, on core's default, `RulesetEntity.writesOf`, which writes the fields a form gives over those the entity keeps), the character's loader reads with them, and the seeders write with them (`Engine.forRules(baseRules).toFieldsWrite`):

```ts
// vocabulary/dnd3.5/fields/entityFields.ts
const SKILL_FIELDS = {
  impactedByWeight: {
    description: "Whether the skill is impacted by armor check penalty",
    kind: "flag",
    label: "Impacted by Weight",
    field: SKILL_IMPACTED_BY_WEIGHT,
  },
  checkPenaltyMultiplier: {
    default: 1,
    description: "How many times over the skill takes the armor check penalty (2 for Swim)",
    kind: "number",
    label: "Armor Check Penalty Multiplier",
    min: 1,
    field: SKILL_CHECK_PENALTY_MULTIPLIER,
    when: { field: "impactedByWeight", values: [true] },
  },
  usableWithoutTraining: { … },
} as const;
```

```ts
// engine/rulesets/dnd3.5/entities/skills/fields.ts
export const SKILL_FIELDS = new FieldCodec(ENTITY_FIELDS.skills);
```

```ts
// engine/rulesets/dnd3.5/entities/skills/SkillEntity.ts
export default class SkillEntity extends RulesetEntity<"skills", SkillBody, SkillColumns, typeof SKILL_FIELDS.fields> {
  private readonly skillFocus = new SkillFocusFeats(this.view);

  protected readonly fields = SKILL_FIELDS;

  protected override writesOf(body: SkillBody, given: Partial<SkillFieldValues>, skill?: Skill): EntityWrites {
    const renamed = skill?.name !== body.name;
    return {
      ...super.writesOf(body, given, skill),
      made: renamed ? this.skillFocus.make(body.name) : [],
      removed: skill && renamed ? this.skillFocus.remove(skill.name) : [],
    };
  }
  …
}
```

A small rule several of a ruleset's modules share is the ruleset's own (`rules/AbilityRules.ts`: a score's modifier; `rules/LevelRules.ts`: `isAbilityIncreaseLevel`, `countGeneralFeats`, off the ruleset's Settings, `LevelRules.of(view)`; `rules/SkillRules.ts`: a level's skill points, a rank's cost, a skill's most ranks, how points spread over levels, a skill's subtypes; `rules/ItemPlacement.ts` and `rules/InventorySlots.ts`: where an item goes, an entry's slot; `rules/SpellLists.ts`: the view's spell lists; `rules/BondedRaceData.ts`: a bonded creature's stat block), which they import: it's no part of the contract. The numbers and tables a rule reads are the books' facts, its vocabulary's (`vocabulary/dnd3.5/`: the core rules' feat and ability increase intervals in `classes.ts`, which the Settings default to, the skill costs and caps in `skills.ts`, `combat.ts`, `sizes.ts`, `carrying.ts`, the bonded creatures' stat blocks in `bondedCreatures.ts`): a rule is a function over them, and a constant the engine keeps is its own machinery (a path's spec, a codec, a message, a placeholder such as `LevelRules.UNROLLED_LEVEL_HP`).

A bound the client and the API check too is a constant of the ruleset's vocabulary, which the engine and the content read instead of writing the number, and the client as the engine describes it: `MAX_SPELL_LEVEL` (`vocabulary/dnd3.5/spells.ts`) for the aptitudes' spell levels, the spellcasting and the spell forms, `MAX_CLASS_LEVEL` (`vocabulary/dnd3.5/classes.ts`) for the class-level forms and the bonus caster levels, `MAX_ABILITY_SCORE` (`vocabulary/dnd3.5/abilities.ts`) for a new character's ability scores and the sheet's, and `MAX_ITEM_VARIANTS` (`vocabulary/dnd3.5/itemTemplates.ts`) for the variants form, which reads it as its rules describe it (the item kind's `copies.most`). The module's operations check them (`RULESET_LIMITS`, `limits.ts`: a new class level's number and its saves' bases, a spell's levels, a character's ability scores, the variants an item's form makes, and a level-up's planned levels, each within its class's last level and all within a character's, the levels it has counted, `MAX_CHARACTER_LEVEL`, `vocabulary/dnd3.5/classes.ts`: the class picker's options say how many levels the character has left, and Add Level's class plan adds none past them).

More complex operations (bound to the detailed character, returning rich data) belong on the ruleset's level-up classes (3.5's on its `LevelUpBase`, which checks a level's selections, `SelectionChecks`; and the pickers on core's `Picker` and `CharacterPicker`, building the character from the rows a level-up adds, 3.5's `CharacterProjection`) or on its character (a concern of `DetailedCharacter`), which an operation builds from the input it's given (`CharacterBuilder.build`).

### The level flows ask the module

The level flows (`server/services/characters/levels/`: a level's steps, the plan's answer, a step's picker, a saved level's plan, a save, an edit, a removal, the children's writes, 3.5's bonded creatures) are the server's: they read the character's rows (`readCharacterInput`, `readChildInputs`; a save's in its transaction, the character locked), ask the engine, and write what it plans. What a level-up is, its rules, is the module's `levelUp` (the 3.5 module's `Dnd35LevelUp`, which opens a class per operation: the planned levels' class levels and projections, the preview and a save's distribution, the steps' slots, the pickers' filters and options, a level's selections, the bonded creatures' plans), which build the characters a step needs from the rows they're given. What a save, an edit and a removal check and write is the module's too (3.5's `LevelsPlanning`, `LevelRemoval`): the server writes what they plan, an advancement's columns and its picks by name, whatever the ruleset. A second ruleset extends `LevelUpPart` with a level-up of its own. Its wizard's steps are its own, each of a mechanic core describes (see [what goes in `engine/`](#what-goes-in-engine-vs-dnd35)): the module lists a level's (`listSteps`: `GET /characters/levels/:characterId/steps`), answers a plan by them (`describePlan`: `POST …/:characterId/plan`), and opens a step's picker over the plan (`openStepPicker`: `POST …/:characterId/options/:step`, a step it doesn't have refused as not found). A plan's answer says what its picks come to: 3.5's skills step spends the skill points as the save spreads them (`SpendsSkillPoints`, over `PicksDistribution`), each row with the points it keeps, the value they buy, its value at each count of points, its step and the most it takes alone, so the client looks them up. The Add Level and Edit Level dialogs, every ruleset's (see [docs/frontend.md](./frontend.md)), render each step by its mechanic, in its words: a step a module adds of an existing mechanic shows in both with no client or server change. An entity's body carries its fields as the ruleset declares them (`fields`, `entityFields`), whichever the ruleset: the engine reads them by its kind's codec.

Entity services (`EntitiesService`, for every kind's entities and their parts) operate on rows of the generic schema, and ask the module's `entities` what's ruleset-specific about them, one operation per action: an entity's fields, what saving it writes, what its rules refuse. Their customizations' services (`ModifiersService`, `RequirementsService`) ask the engine's customizations the same way; an entity's fields are written by its own save. The fields every form shows are one read (`RulesetFieldsService.getFields`: `Engine.for(scope).describeFields()`, `GET /api/rulesets/:id/fields`), and the ruleset's own, its Settings, have their service (`RulesetSettingsService`: `getSettings` and `updateSettings`, `describeSettings` and `planSettings`, `GET|PUT /api/rulesets/:id/settings`), which writes the ruleset's own rows by `writeEntityWrites`.

### Routes

The level routes (`server/routers/api/characters/levels/index.ts`) take the generic schema's level-up: class levels, skill points, and feats and spells by their pool; the module bounds them (a class's last level, a character's: `PlannedLevelsState`), and reads what its own pickers take (a spell level, a specialist's excluded schools).

A body's fields that a ruleset's rules take, and the bounds they set on its columns, are the engine's. A route carries an entity's fields as one object, `fields` (`entityFields`, `server/routers/api/validation.ts`: any object, typed as the engine's `EntityFieldValues`, which every form's fields are), and an entity's columns as they are (`entityBody`: its name, description and fields, and every other key, an owned entity's `ownedBody` alike). The operation reads its columns by their descriptions (`RulesetEntity.formOf`, `FormColumns`: its kind's `columns`, the ones its rules describe for its form, each by its input; what else a form carries by its kind's keys, `formKeys`: a new level's number, whether a new item is a template), the fields by the kind's codec against the ruleset's declarations (`RulesetEntity.readFields`, `FieldCodec.parse`: those a form gives, a create's and an edit's alike; a key that's no declared field, a value outside its type's closed list, a reference the view lacks refused) and checks the bounds by the module's limits (`checkForm`, `planVariants`, `planScores`), refusing with a `RulesError` "invalid" (`RulesError.parse`), which answers 400 with an issue per field as a route's validation does (`fields.bab`, `fields.families.0`, `saves.0.base`, `aptitudes.0.level`). Every kind with fields takes them (a feat, an item, a class, a class level, a spell, a race, a skill), and so does the ruleset's Settings' save. An edit gives the fields it changes (the client sends those alone): the entity's base merges them over those it keeps (`formFields`), every kind alike. A character's ability edit is the module's too (`characters().planScores("abilities", …)`: each ability the ruleset's, each score in the bounds its `describeScores` gives), which the service writes. A character's alignment and gender are its fields (`character.fields`, stored as text), whose options are its vocabulary's (`vocabulary/dnd3.5/identity.ts`: `ALIGNMENT_OPTIONS`, `GENDER_OPTIONS`), which the 3.5 module checks (`IdentityFields`, `NewCharacters`). The server imports nothing of `vocabulary/dnd3.5/`.

### What's intentionally generic schema, not ruleset-specific

The entity types the engine's core reads by name (`rules.entity_types`, see [persistence.md](./persistence.md#the-generic-tables)) include some concepts that read as D&D-family but are actually **generic primitives**:

- **Aptitudes** (the `aptitudes` type, which feats and spells are `listedIn`) — "named pools of grantable abilities with slot counts." Works for 5e (ASI/feat pools, spells known), PF2e (feat types, spells), etc. 3.5 just happens to use this for "Wizard Spells", "Fighter Bonus Feat", etc.
- **Saves** (the `saves` type, a class level's `baseBonus` links) — "defense categories with per-class-level progression." Every level-based RPG with a resistance mechanic fits this.
- **Requirements / Modifiers / Fields** — fully generic customization system. Target paths are data, not code. An entity's fields are declared by its ruleset (labels, closed values, references) and laid out by the client's generic `EntityFields` from the API's description, so a ruleset's fields need no client code. See `docs/customization.md` and `docs/target-paths.md`.

The 3.5-ness in these types lives in the **seeded values**, not the schema shape. Don't split them.

### How to add a new ruleset

The contract is the code: `engine/core/module/parts/` holds a folder per part, its abstract class beside what its operations take and answer, and the compiler lists what a ruleset's part lacks. A ruleset is a module under `engine/rulesets/<ruleset>/`, which the engine's handles dispatch to by its base rules (`Modules.of`).

1. **Its base rules**: a row of `rules.modules` (a migration, which writes its registries' rows too: step 2), a value of `BASE_RULES_OPTIONS` (`shared/enums.ts`) and of `rulesets.base_rules`' type (`drizzle/schema.ts`), then its module in `MODULES` (`engine/api/Modules.ts`): until it has its row, `Modules.of` reports it, one error, and the registered modules keep their types. Its vocabulary names it by a constant of its own value (3.5's `DND35_BASE_RULES`, `vocabulary/dnd3.5/baseRules.ts`, `satisfies BaseRules`), which its seeders and its codegen ask the engine by, so `Engine.forRules` answers with its module's types (`ModuleOf`).
2. **Its module**: a factory returning a `RulesetModule<D, E, F>` (3.5's `Dnd35Module.create`): `D`, what it describes in its own shape (3.5's `descriptions.ts`); `E`, its entity kinds by table; `F`, the fields its content seeds, by entity. What its refusals and issues call each kind is its `kindLabels` (which its view answers: `RulesetData.labelOf`). Its rows' types fill the view's registries (`ViewEntities`, the kinds an entity of another owns, `OwnedEntities`: 3.5's class levels, which its contract (`EntityKindsContract`) and its fields' references (`StandaloneKind`) leave out, 3.5's `view/rows.ts`, by `declare module`, which names the file that declares the registry, `engine/core/view/rows.ts`, past its folder's index, as TypeScript's augmentation needs; a character's row holds its own values as stored, its fields by field and its single links by role, which a module reads its own way: 3.5's `CharacterValues`, its identity, experience and race, whose value sets are its vocabulary's, `vocabulary/dnd3.5/identity.ts`), and what it reads of the view past its kinds' rows by id it derives once, as a class of its own (3.5's `view/Dnd35View.ts`: `Dnd35View.of(rulesetData)`, its lists and indices, built on first read). How its data sits in the generic tables is its `storage` (a `StorageDeclaration`, `engine/core/module/storage.ts`: 3.5's `storage/Dnd35Storage.ts`, its kinds' columns, the kinds a user customizes, `customizable`, and the role of the links a kind's page edits, `editedLinks`, its characters' rows and its registries' rows (its link roles among them, by which its entities' links are read and written), which a migration writes and `tests/database/dnd3.5/registries.test.ts` checks; see [persistence.md](./persistence.md#the-generic-tables)). Each part extends its abstract class: `CharactersPart<D>`, `LevelUpPart<D>`, `EntitiesPart<E>`, `ContentPart<F>`, `RulesetPart`. A part's abstract members are what the ruleset answers its own way; what reads the schema alone is the part's (`describeInventory`), and so is what guards a character's privacy and integrity (`describe`, `describeForMember`, `describeCard`, `planInventoryEntry`, `planScores`, `planCreate`, `planStart`, `describeLinkPicks`, `planLinkPicks`: [what the characters part guarantees](#the-modules-parts)), over a hook where a ruleset differs (`describeInventory` over `describeInventoryEntry`, `describe` over `describeFull`, `planCreate` over `planNewFields`, `describeCard` over `describeFullCard`, `planInventoryEntry` over `planPlacement`, `planScores` and `planStart` over `describeScores` and `checkCreationPick`, `describeCreation` over `describeScores`, `openCreationPicker` over `openPicker`, `describeLinkPicks` and `planLinkPicks` over `describeLinkRoom` and `fitLinks`, `checkPublishable` over `findMissingContent`, `toFieldsWrite` over `codecs`). What the generic client runs is the part's shape, its data the ruleset's: a new character's ability scores are set by the methods `describeCreation` answers, each a kind the create dialog runs (`roll` by its dice, `array` by its scores, `pointBuy` by its costs and budget), with the scores' bounds and each score's modifier (3.5's in `vocabulary/dnd3.5/creation.ts`), for the ruleset's abilities it lists. The order a ruleset's abilities show in is the module's too: its sheets, its level-up steps and its create dialog take them as it lists them (3.5's `AbilityRules.orderAbilities`: the books' six first, then the others by name), and the client renders them in that order.
3. **Its character** in `engine/rulesets/<ruleset>/model/`, which its parts build, on core's character (`engine/core/character/`): its character extends `CharacterBase`, handing it its target paths, which the base's evaluators walk, and implements its build's step before the modifiers (`prepareSheet`), what a modifier that applied grants, whose modifiers join the rounds (`grantsOf`: 3.5's feats, spells and languages), its steps that read what the modifiers gave, run after the first pass and after each round so every round and the final check read one sheet (`settleSheet`), the scopes of the sheet a modifier applies in each on its own (`scopesOf`, none for most: 3.5's weapon sets, for its armor class), its own issues (`findRulesetIssues`), and the rows and the names of its entities (`listEntityRows`, `nameEntity`), which the base checks against its source chain (`findSourceIssues`) and names its issues by (`resolveEntityName`, which names the character, its items and a modifier's source itself): 3.5's `DetailedCharacter`. Its builder extends `CharacterBuilder`, a character for each row kind (3.5's `Dnd35CharacterBuilder`). Its data loader, which its character hands the build (`createDataLoader`), extends `CharacterDataLoader<D>` (3.5's `DetailedCharacterDataLoader`): the base loads what every ruleset's character reads (`LoadedCharacter`: its campaign and player, its inventory's items as the view composes them, its modifiers in the order they apply with the requirement groups gating them, the rulesets its rows may come from), and the ruleset says what its character has of its entities (`partsOf`), which of them its modifiers come from and in what order, its equipped items among them (`sourcesOf`), and its data (`loadOwn`, `D`). Its components (`components`, built by a factory, 3.5's `CharacterComponents`) each extend `CharacterComponent<D>`, `D` its loaded data: a component is built with the sibling components it reads and nothing else, and implements `initialize(data, view)`, which the build calls in the order the factory lists them, each after what it reads, then `finalize` where it computes from what the modifiers left (3.5's spellcasting). A component reads its siblings, counting what it computes from them when read, and writes none of them (3.5's two exceptions: [customization.md](./customization.md#how-a-sheet-is-built)); its getters are what its path category's `component` names (`ComponentSpec`).
4. **Its level-up and pickers**: its `LevelUpPart` lists a level's steps, each of a mechanic core describes (`listSteps`), answers a plan by them (`describePlan`), opens a step's picker (`openStepPicker`), opens a saved level as an edit's plan (`describeSavedPlan`), and plans what a level-up, an edit and a removal write, checked, with what the character's children become (`planLevelUp`, `planLevelEdit`, `planRemoval`, `planChildren`): an advancement's columns and its picks by the name its storage declares each under, which the server writes as they are. How it checks them is its own. 3.5's flows show one way, in `engine/rulesets/dnd3.5/levelUp/`: `LevelsPlanning` checks a save and an edit in one order over the rules its `Dnd35LevelUp` gives (`LevelUpRules`): a level-up's planned levels read (`getPlannedKlassLevels`), its picks spread over its levels (`distributePicks`, `PicksDistribution`); each level not saved already, its ability increases adding up (`getAbilityIncreaseTotal`), its hit points (`hitPointsOf`), selections and pools checked, no non-stackable feat or spell picked twice at a level (`SelectionChecks`); no pick the character holds already, forced or not (`SelectionChecks.checkPicksNotHeld`, over what its character holds, `CheckedCharacter`); no pool overfilled, forced or not (`findOverfullPools`, refused by `PicksDistribution.refuseOverfull`); then the character with them valid unless forced, an edit's in the issues the level answers for (`findEditedLevelIssues`). A picker extends core's `Picker` (`filters`, `meets`, `describeFailed`, and `offer`, `requirementsOf`, `detailsOf` or `order` where it differs), or `CharacterPicker` when it checks a character as the level-up plans it (`project`: the character's rows with what the plan adds; it takes the ruleset's character builder); a `plan` step's picker reads tracks (`OpenedTrackPicker`: 3.5's `ClassPicker`).
5. **Its target paths and fields**: a `CategoryPaths` subclass over one `PathCategory` per domain (see [target-paths.md](./target-paths.md)), and its owners' fields, by owner type (`fields`, its vocabulary's declarations: 3.5's `ENTITY_FIELDS`, which every view orders its owners' stored values by, `DeclaredFields`, from which every form's fields are described, `FieldCodec.describe`, and every save is held to, `FieldCodec.parse`). A field it adds is its declaration alone: the client lays out every form by what the API describes (`GET /api/rulesets/:id/fields`), with no change, and the ruleset's own fields are its Settings tab's (its `RulesetPart`'s `fields`).
6. **Its entities**: its rules (`RULES`, a `RulesDeclaration`, its pages' help among them, `help`, in its own terms: the rules' description but the kinds whose customizations have a page of their own, `customizationPages`, which the engine reads off its storage) list its kinds (`kinds`: each its type, the generic name of its picture and its tab's help, what its row opens (`opens`: its customization page, its own page, or a class's progression), the entities its page links it to (`links`: their kind, the role of its links, which names their activities, and where an activity names the linked entity, `role` and `targetName`), whether what a race or a class is for narrows its list (`partitioned`), whether no form writes one (`readOnly`), its empty list's words (`empty`), whether its form gives its description room (`longDescription`) and whether a new one's form says what each field is for (`fieldHelp`), whether its form is wide (`wideForm`), the pools and tiers its list narrows by (`pools`: their kind, scope, query key and URL param; `levels`: the rules' `tiers`, 3.5's spell levels), the entities its page links one to by the role its storage declares edited (`links`: 3.5's class skills, a tab of their own on a class's page), whether its list groups variants by family (`families`), how its row copies one, a duplicate's locked columns and the most variants at once (`copies`), and when its name can't change (`lockedName`: while a flag column holds, a generated feat's)) and give a word for every type it has, its kinds' and its other types' (`class_levels`; the engine adds its own, `modifiers`): without them its ruleset page has no tab, and its labels read a generic word. Each kind extends `RulesetEntity` (or `CustomizationPageEntity`), its fields a codec of its declared types (`fields`, `FieldCodec`); `EntityKindsContract` says which tables it answers of; the parts a kind may have past its own row (the entities it owns, the links it edits, its progression, its tables: `engine/core/entities/parts.ts`) are its optional methods, which `RulesetEngine` opens by kind and refuses as not found for a kind without one; a kind that owns others names their kind too (`ownedType`, as its storage declares their owner: a class's `class_levels`), which an owned entity's delete reads to check what's in use before it finds the owner (`tests/engine/api/RulesetEngine.test.ts` holds every kind to it).
7. **Its content and its seeding**: its row in the content's registry (`RULESET_CONTENT` in `database/packages/registry.ts`, a `Record<BaseRules, RulesetContent>`, so the compiler asks for it): its core package, its extensions, its seeder and its test characters' seeding (`seedTestCharacters`), which the runner and the scripts (the dev and test seeds among them, `scripts/db/seeds/`) read it through, and nothing else of theirs does (`arkyvree/ruleset-folders`). Its content is `content/<ruleset>/` (what it's written with, `builders/`; its hand-written rows, `data/`; its generated books, `generated/`; its packages as data, `packages/`, a `CorePackageDefinition` and its `ExtensionPackageDefinition`s; its dev and test characters, `testData/`, each a `CharacterSeed`). Its seeder (`database/seeders/<ruleset>/`) is a concrete `ContentSeeder<Core, Book>` of that content, which implements the contract's abstract members, `seedCore` (the core rules' content its core package gives, in the core ruleset the runner creates) and `seedExtension` (an extension's book, in the extension of it the runner creates, beside the core rules' content), and gives the context it names its rows in: how it starts, carries over to an extension and loads from a seeded ruleset (`emptyContext`, `extensionContext`, `loadContext`; 3.5's `Dnd35ContentSeeder`: its rows' ids by name). Its steps build on the ones any ruleset's content seeds alike, which `ContentSeeder` has (`database/seeders/core/concerns/`: items), and add its own (3.5's `BaseSeeder`'s concerns, `database/seeders/dnd3.5/concerns/`: aptitudes, abilities, saves, languages, feats, races, an extension's copies, classes, skills, spells), and its test characters' seeding (3.5's `characters/`). Its codegen is `codegen/<ruleset>/`. Each is on what every ruleset shares (`content/core/`, `codegen/core/`, `database/seeders/core/`); its folders are its own (`arkyvree/ruleset-folders`), each holds its role (`arkyvree/layers`), and its codegen and seeder reach its content only by the edges `arkyvree/root-folders` declares. See [packages.md](./packages.md).
8. **Its vocabulary**: `vocabulary/<ruleset>/`, beside `engine/`, `content/` and `shared/`: its lists, labels, tables and bounds, the books' facts (3.5's spell levels and their names, its hit dice, its field names and their values, its size, carrying, combat and skill tables, its bonded creatures' stat blocks), data only (`arkyvree/vocabulary-data`: no function or class; a rule is its module's), which its module, its content, its codegen and its seeder import directly, and the server and the client never do (`arkyvree/root-folders`). A generic client page reads none of it: what every ruleset of its base rules shares, its module describes (its ruleset part's `rules`, a `RulesDescription`: its entity kinds, which its ruleset page's tabs are, its word for every type, its entities' columns, as their forms show them (`ITEM_COLUMNS`…: a class's hit die, an item's cost, type and slot), and as their lists show them (`ITEM_LIST`…: each value's label, share and how it reads), the kinds a race or a class is for, a class's last level, the bounds of an ability's base score, a spell's levels and their names, what its level wizard shows in its own words (`LEVEL_WIZARD`: the ability increase's word, prompt and amount, what a skill point buys and a row it's cheaper on, a free grant's note), how a class progresses (`PROGRESSION`: its last level; its class table's tracks, each a level's field or a level's amounts (a base per save), with its bounds, its values' labels and the presets it follows; the label of what a level grants, and what its levels grant past their columns, `grants`: its pools' kind and scope, where its answer and its table hold their picks and totals, and its card's words; its tables, each with its columns and the words a pasted header names them by, its most, its word for every value, the table whose opening zeroes it, the class's table it's read from and where a level holds its totals; and what they count, `counts`: their kind, the keys a progression's save and answer use, the class's table of its lists, its tabs' URLs and what its tables' tab says of a class with no list), and its license), served once for every base rules (`GET /api/rules`, `Engine.rules().describeAll()`), which the client reads once and keeps (`useRules`, [frontend.md](./frontend.md)); a generic client module never reads its folder (`arkyvree/ruleset-folders`).
9. **Its client part**: none. The client holds no ruleset's code (`arkyvree/ruleset-folders`): its sheet lays out the blocks it describes (`blocks`, `SheetBlock` in `engine/core/module/parts/characters/blocks.ts`), in its order, under the identity, its header its summary, its cards their chips, and its create dialog its form (`characterForm`).
10. **Its rulings**: `docs/<ruleset>/rules-decisions.md`, how it reads its rules where the source is ambiguous or where it deliberately differs, each naming the code that holds it (3.5's: [docs/dnd3.5/rules-decisions.md](./dnd3.5/rules-decisions.md)).

   A client page holds no rule of a ruleset: what one has (a field, a column, a tab, a word) is the engine's to describe, its sheet's layout its blocks, and a page whose parts are its base rules' waits for its ruleset to load, never assuming one. No client module imports a ruleset's folders (`arkyvree/ruleset-folders`).

### How to extend `engine/` without leaking a ruleset

The engine is the machinery every ruleset runs on: the evaluators, the path walk and the path language, the view, copy-on-write's state, the module's contract and the operations that dispatch to it. Its core imports nothing from a ruleset, not even a type (`arkyvree/layers`). If you feel you have to, the file probably belongs to the ruleset.

If the services need a per-ruleset value or answer:
- Add an operation: an abstract method of its part (`engine/core/module/parts/<part>/`, its request and plan types beside it), which every ruleset's part then implements (`Dnd35Entities`, `Dnd35LevelUp`, …), and the method of the handle it's about that dispatches to it (`LevelUpEngine`, …: `engine/api/`; an entity kind's is a method of its entity class, on `RulesetEntity`, which `entities(type)` hands out), or a handle of its own, which `RulesetEngine` hands out under a noun (`owned(type, ownerId)`). `engine/index.ts` exports a handle's type when the server derives a body's or a plan's from it, as every registered ruleset's operation takes it (`Accepted<EntityKinds["skills"]["planCreate"]>[0]`: one module's body, every module's together once there are several).
- A value the client and the API need too lives in the ruleset's vocabulary, `vocabulary/<ruleset>/` (`MAX_SPELL_LEVEL`), as data (`arkyvree/vocabulary-data`), never in a file another ruleset would read; the module's operations check it (`RULESET_LIMITS`) and describe it to the client, and neither the server nor the client reads it.

If you need a per-ruleset behavior too complex for one class (takes the detailed character, returns rich data, reads several components), make it a method of the ruleset's level-up base (3.5's `LevelUpState`, on its `LevelUpBase`) or a concern of its character, which its operations call. A part is typed by the contract (its abstract class), so nothing casts but the rows a module declares itself: a character's advancements and picks are as stored, by the steps its storage declares (`StoredAdvancement`, `StoredPick`), which 3.5 reads by step (`rows.picks.feats`, its saved level's `SavedLevelPicks`).

### Grey areas and audit findings

An audit on 2026-04-16 identified real leaks and some false alarms. It predates the engine's restructure, which moved every component under `dnd3.5/`: the components it calls generic are 3.5's, and generic in that a second ruleset could take them as they are.

**Fixed:**
- `MAX_SPELL_LEVEL = 9` was hardcoded in the aptitudes component (`dnd3.5/model/aptitudes/AptitudesComponent.ts`) — now one constant in `vocabulary/dnd3.5/spells.ts`, which the spellcasting and the module's operations (through `RULESET_LIMITS`) read too, and the client as the engine describes it.
- `buildCharacterResponse.ts` lived in `routers/api/` with a cast to the 3.5 character — moved to the 3.5 module, now `CharacterResponse` (`engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts`).
- `server/routers/api/characters/levels/` had 3.5-shaped query params (`spellLevel`): moved under `dnd3.5/`, then back once the level flows asked the module (`levelUp`), which reads them.

**Not leaks (confirmed generic):**
- `SkillWithRank.rank: number`, `CustomizedSpell.spellLevel: number | null`, `CustomizedSpell.saveName: string | null` — neutral primitive fields with 3.5-flavored seeded content but no schema constraint forcing 3.5 semantics.
- Aptitudes and saves (entity types), requirements/modifiers tables, fields (an entity's stored values) — generic primitives; see "What's intentionally generic" above.
- `SavesComponent` (`dnd3.5/model/saves/`) — iterates generic save data, no 3.5 hardcoding.
- Alignment path in `IdentityComponent` — "alignment" is a fantasy-RPG convention, string field value is content-level.

## Key Files

| File | Purpose |
|---|---|
| `server/cow/views/` | `withRulesetScope` / `withRulesetScopes` (consumer entry points), `RulesetViews` (the cache), and what it reads with: a ruleset's own rows (`RawDataReader`) and the rows its `CowData` is built from (`CowDataReader`): copy-on-write's read side. `CowData` itself (`engine/core/cow/CowData.ts`, built by the engine's `Engine.copyOnWrite().buildData`) is what a scope resolves ids through. |
| `server/cow/writes/` | `EntityEdit` (the row an entity's change writes), `CustomizationEdit` (a customization's), `EntityNames` (the names a create, a rename, a restore or a subscribe takes), `EntityCopy` (a copy of an inherited entity), `EntityRevert` (a copy reverted to its source, what names it repointed), `CustomizationCopies` and `EntityRepositories`: copy-on-write's write side. `EntityCopy` merges sibling data into newly COW'd local copies by the engine's rules (`Engine.copyOnWrite().mergeCustomizations`, `mergeLinks`). Sibling read-time merging lives in the compose step (`engine/core/view/RulesetComposition.ts`). |
| `server/services/rulesets/RulesetsService.ts` | `forkRuleset`, `publishRuleset`, `archiveRuleset` |
| `server/services/rulesets/extensions/RulesetExtensionsService.ts` | `subscribeExtension`, `unsubscribeExtension`, `getExtensions` |
| `server/services/rulesets/changes/RulesetChangesService.ts` | `getChanges`, `revertOverride` |
| `server/services/rulesets/settings/RulesetSettingsService.ts` | `getSettings`, `updateSettings`: the ruleset's own fields, its Settings tab's |
| `server/services/rulesets/fields/RulesetFieldsService.ts` | `getFields`: each entity type's form's fields, and the Settings', as the ruleset declares them |
| `server/services/policies/RulesetsPolicy.ts` | Authorization checks for all ruleset operations: the ruleset's own, plus the concerns in `policies/concerns/` (entities, contributors, extensions, creating campaigns and characters), over the roles in `RulesetRoles.ts` |
| `server/services/rulesets/*/` | Entity services (feats, spells, classes, etc.) using the COW pattern |
| `server/services/rulesets/EntityWriter.ts` | `EntityWriter`: a kind's create, update and delete, in one order around the plan its rules give |
| `server/services/rulesets/entityWrites.ts` | `writeEntityWrites`: what the engine plans a form writes beside an entity's row (`EntityWrites`), written in the action's transaction |
| `server/services/rulesets/linkWrites.ts` | `createLinks`, `setLinks`: an entity's links by role (a feat's pools, a spell's lists, a class level's grants and saves), as a plan sets them (`LinkSet`) |
| `server/services/characters/characterInputs.ts` | `readCharacterInput`, `readChildInputs`: a character's rows, read in its ruleset's scope, which the engine builds it from |
| `server/repositories/*Repository.ts` | COW-aware SQL queries with snapshot exclusion |
| `engine/index.ts` | The engine's one entry: `Engine`, its handles' types (`LevelUpEngine`), each entity kind's rules by table (`EntityKinds`, its operations' arguments as every registered ruleset's take them: `Accepted`), its operations' types, and `RulesError` |
| `engine/api/` | `Engine` and the handles it hands out, a class each (`RulesetEngine`, which `Engine.for(scope)` binds to a view, and its handles by what the rules are about: `CharacterEngine`, `LevelUpEngine`…, and an entity kind's own class, which `entities(type)` hands out, and its parts (`owned`, `links`, `progression`, `tables`); `ContentEngine`, `Engine.forRules`; `CopyOnWriteEngine`, `Engine.copyOnWrite`; `ImportsEngine`, `Engine.imports`; `RulesEngine`, `Engine.rules`), each operation a method dispatched to the ruleset's module by its base rules (`Modules.ts`: `Modules.of`), or to the core's classes with the module's factories (`ModifiersEngine`, `RequirementsEngine`, `TargetPathsEngine`) |
| `engine/core/module/` | The module's contract (`contract.ts`: `RulesetModule`), the rows a character is built from (`CharacterInputs.ts`: `CharacterInput`, `CharacterRows`, its picks by the name its module declares each under, resolved as the view reads them), the parts, a folder each (`parts/characters/`, `parts/levelUp/`, `parts/entities/`, `parts/content/`, `parts/ruleset/`: its abstract class, and its types by role: what an operation takes, `requests.ts`; what a plan writes, `plans.ts`: `EntityWrites`, `LevelsPlan`…; what a description shares, `descriptions.ts`), and a picker's shape (`pickers.ts`) |
| `engine/rulesets/dnd3.5/model/` | The 3.5 character: its state (`CharacterState`, on core's `CharacterBase`), its concerns (`Builds`, the build's 3.5 steps; `Diagnoses`; `PossessesVirtually`; core's `Validates`), its components (`CharacterComponents`, each on core's `CharacterComponent`, in the order the build sets them up), `DetailedCharacter`, which wires them, `Dnd35CharacterBuilder`, which builds one from its input, and a folder per concept a character has (its component and its paths' category) |
| `engine/core/` | The machinery: `ModifierEvaluator`, `RequirementEvaluator`, the path walk and the path language and their types (`paths/`), the ruleset view and `RulesetView` (`view/`), copy-on-write's state (`cow/`), an entity's customizations (`customizations/`), the fields' declarations, codecs and stored values (`fields/`), and the bases a ruleset extends: the module's parts (`module/parts/`), a character (`character/`), the pickers (`pickers/`) and the entity kinds (`entities/`) |
| `engine/rulesets/dnd3.5/` | 3.5 implementation: what a character has (`model/`), its module's parts in their folders (`characters/`, `entities/`, `levelUp/`, `content/`, each opening with its facade), the pickers (`pickers/`) and the rules several of them read (`rules/`), over the books' numbers in `vocabulary/dnd3.5/` |
| `engine/rulesets/dnd3.5/model/concerns/Builds.ts` | The build's 3.5 steps, which core's build runs (`CharacterBase.build`: the loader, on core's `CharacterDataLoader`, `loading/`, gives each entity the modifiers and requirements the compose step merged into `rulesetData`; then each component's `initialize`, the steps around the requirements, the modifier rounds, each component's `finalize`, and the late modifiers) |
| `database/seeders/dnd3.5/concerns/CopiesOnWrite.ts`, `database/seeders/dnd3.5/concerns/CopiesIntoExtensions.ts` | Seed-time COW: copies the core feats and spells an extension changes, and changes the copies as its book says |
| `tests/services/rulesets/dnd3.5/Extensions.test.ts` | Extensions, COW, fork inheritance, merge, name conflicts, publish validation, sibling merge (feats + spells: aptitudes, requirements, modifiers across all endpoints) |
| `tests/services/rulesets/dnd3.5/Sibling*.test.ts`, `tests/services/rulesets/customization/dnd3.5/Sibling*.test.ts`, `tests/cache/dnd3.5/aptitudeDedup.test.ts` | Siblings: what the composed view shows, edits and customization writes on a sibling-merged entity, aptitude deduplication |
