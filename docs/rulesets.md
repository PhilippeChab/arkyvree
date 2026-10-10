# Rulesets, COW & Extensions

## Overview

Rulesets define game rules (races, classes, feats, skills, items, powers, etc.) and support a hierarchical inheritance model. Entities are shared by reference — never copied — until a user modifies one, at which point a local copy is created on demand (Copy-on-Write).

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
type. A template's edit that changes its type, and its delete, read its copies in
any ruleset by every id they may hold (its own and those it stands for:
`cow.getEquivalentIds`), and are refused while it has any (of another type than
the new one, for an edit): `ItemEntity.planEdit`, `planDelete`.

Regular items can reference templates to inherit their properties and
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
2. **Local copy** — the entity + all customizations (modifiers, properties, requirements) + relationships are duplicated into the child ruleset
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

- **Standard entities** (feats, powers, items, races, skills, etc.): COW copies the entity and all customizations
- **Classes**: COW copies the entire class including all levels and their customizations/relationships
- **Customizations on inherited entities**: `CustomizationEdit.cowOwner` / `cowCustomization` trace the modifier/property/requirement back to its owning entity, COWs that entity, then resolves the customization through IDs recorded at copy time, including sibling contributions

### Override Map

The engine builds a ruleset's `CowData` (`Engine.copyOnWrite().buildData`, by its `CowDataBuilder`) from the rows the server reads as it says (`copyOnWrite().getReads`, `CowDataReader`): a mapping of `sourceEntityId → forkedEntityId` across the full snapshot chain, and of each sibling loser to its winner. Used for:
- **FK remapping**: When copying entities, foreign keys pointing to inherited entities are remapped to their COW copies (`CowDataReader.read` through the copy's transaction, `CowData.resolve`): the same passes as the ruleset's view, so a copy stores what the view shows (a losing copy of a list resolves to the winning one)
- **Detail views**: `CowData.resolveRows()` remaps ID references in query results
- **Level picks**: a level flow's request (a level-up, an edit, the wizard's preview, a step's or a picker's query) may name a copied entity by its source's id, which the API takes as it takes the copy's the client sends. The level-up handle resolves each id a request names as it enters (`LevelUpEngine`, by `LevelRequests`), as the character's rows are (`CharacterInputs`): its checks, its preview and its save read the copy (a spell at its level in the copy's lists, a feat the character holds as the copy), and a save writes the copy's id, the row the client's request writes. A pick the view has none of is refused, naming it. A row saved before the copy keeps its source's id, which reads resolve
- **Request ids**: every id a request names is read so, by one class (`RequestIds`, `engine/core/view/`) as the request enters the rules: a level flow's (`LevelRequests`), a new character's race and ability scores (`characters().planCreate`), an ability edit's (`planAbilities`), a languages edit's (`planLanguages`) and an added inventory item (`character(input).planInventoryEntry`, which places the copy, as the view has it); an entity's form, each kind naming its own (`resolveIds`: a save's or a skill's ability, a feat's or a power's lists, a power's save, an item's template, a class level's granted feats, their pools and its saves), a class skill's add (`class(klassId).planSkillAdd`) and a property's value naming an entity (`properties(entityType, entityId).planCreate`, `planEdit`: a class's bonus spell ability). Each plan names what it writes by the view's id. An id the view has none of (unknown, of an unrelated ruleset, or one the ruleset deleted) is refused as `invalid`, naming it (`Item <id> does not belong to the character's ruleset`, an entity's form `Ability <id> does not belong to this ruleset`, never the foreign key's 500 nor another ruleset's entity stored), and so is one entity named twice where it's given once (an ability's score, a language, a feat's or a power's list, a class level's save: `Language <id> is given more than once`). A path's id stays a 404 (`find`). Rows stored before a copy keep their source's id: reads resolve them, and nothing rewrites them

### Snapshots

| Field | Description |
|---|---|
| `sourceEntityId` | Original ancestor entity ID |
| `forkedEntityId` | Child's local COW copy ID |

### Names of new entities

Every entity create (and bulk item variants) checks the name with
`EntityNames.assertNameAvailable` / `assertAncestorNamesHidden` against the fork's
composed view. A local entity, or an inherited one that is still visible, with
the same name blocks it. Inherited entities hidden by an override
(`cow.isHidden`: overridden, or a sibling loser) do not. If a hidden ancestor's local
copy was deleted, its snapshot is a tombstone, and `EntityNames.repointTombstone`
moves it to the new entity. A live local copy keeps its snapshot even after a
rename, so picks of the source keep resolving to that copy.

### Restoring an override

A fork's **Restore Parent Version** (`RulesetChangesService.revertOverride`) reverts
its copy of an inherited entity to the source: `EntityRevert` (`server/cow/writes/`),
`EntityCopy`'s inverse. Every row naming the copy names the source instead, which
the views show in the copy's place once it's gone. The rows that name an entity are
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

1. `CowDataBuilder` detects when multiple extension snapshots share the same `sourceEntityId`. It pairs the winner's `forkedEntityId` with the sibling `forkedEntityId`s (`CowData.getSiblings(winnerId)`, `getWinner(loserId)`). Feats and powers that several rulesets in the source chain define natively under the same name (reprints, `NAME_FALLBACK_ENTITY_TYPES`) are paired the same way, closest ruleset first. A winner's siblings are listed in the order they were paired (the snapshot pass's, then the name pass's), each once, under the winner it resolves to: the order both merges below take them in.

2. **Entity list filtering**: Sibling entities are left out of every ruleset entity's list in its query (only the winner is returned), so the user never sees duplicate feats and a page keeps its size: `ScopesToRuleset.buildRulesetCondition` excludes the `siblingLoserIds` it's given (`rulesetData.cow.listFilters`, with the source chain) from the inherited rows. A list read without them sees them.

3. **Read-time merging** (built into the compose step, the engine's `copyOnWrite().buildView`: `RulesetComposition` in `engine/core/view/RulesetComposition.ts`): `RulesetViews.getData` folds sibling contributions into the winner's buckets before the engine's operations read them. Consumers read `rulesetData.featsById` / `rulesetData.powersById` / `rulesetData.modifiersBySource` / `rulesetData.requirementsByEntity` / `rulesetData.propertiesByEntity` and get pre-merged rows — no sibling helpers needed at call sites. The rules are one class, `SiblingMerge` (`engine/core/view/SiblingMerge.ts`), which `EntityCopy` writes by too, through the engine (`copyOnWrite().mergeCustomizations`, `mergeAptitudeLinks`): each takes the winner's own rows and each sibling's, in `getSiblings` order, and returns the siblings' rows the winner takes. Of two equal rows (by the kind's key), the winner's, then the earlier sibling's, is kept: its requirements, its description, its level.
   - **Aptitudes** (`mergeAptitudeLinks`): sibling `feats_aptitudes` / `powers_aptitudes` are merged into the winner's inline array, deduped by resolved `aptitudeId` after FK remap.
   - **Requirements** (`mergeRequirements`): sibling requirement trees are appended at the top level (so they are ANDed with the winner's) with `entityId` remapped: a chain gets the next free integer level and a standalone keeps its level, suffixed on collision. Duplicate top-level standalone conditions are deduplicated on `target|operator|value`; conditions inside AND/OR chains are preserved to keep their boolean meaning, so two identical chains both remain. Display preserves each source row's UUID, and COW records its new copied UUID so edits target the exact requirement.
   - **Modifiers** (`mergeModifiers`): sibling modifiers are appended with `sourceId` remapped to the winner, deduped on `target|value|operator|valueType`. Dropped modifiers have their requirements dropped too.
   - **Properties** (`mergeProperties`): sibling properties are appended with `entityId` remapped to the winner, deduped on `type|value`.
   - Consumers: the engine's operations, which the services bind to the view, `Engine.for(scope)` (the feats' and powers' lists, `entities("feats").openList`, `entities("powers").openList`; the customizations', `ModifierEdits`, `RequirementEdits`, `PropertyEdits`; `DetailedCharacter`), all just read from `rulesetData.*` without any sibling-specific code.

4. **COW merging** (`EntityCopy`): When a user COWs the winner entity, its sibling merge copies unique requirements, modifiers, properties, and aptitude links from all siblings into the new local copy. The child's copy contains the full merged result. See below.

**Key rule**: A local (child fork) COW always wins completely — no sibling merging. The sibling map only applies to extension-vs-extension COW conflicts. If the user's own fork has COW'd a base entity, that fork's copy is authoritative and extension copies are ignored.

This also applies when an extension is subscribed to after the local copy was made:
its unrelated entities remain available, but its contributions to that overridden
entity are not merged into the local copy. Restoring the override resumes the
normal merged view of the currently subscribed extensions. Hidden sibling IDs
still resolve to the local copy; deleting that copy leaves the whole entity hidden
until the override is restored.

`EntityCopy` requires both the source chain and `extensionRulesetIds` (`EntityEdit` and `CustomizationEdit` pass the ruleset's). Every edit path passes the current ruleset’s extensions, including entity edits, class-skill changes, and class-level changes, so the local copy contains all visible sibling customizations before read-time merging stops.

### Aptitudes and the Sibling Map

Aptitudes are named pools — they have `name` but no per-ruleset content — so the seed only creates a row in the ruleset that *introduces* the name (see `docs/packages.md`: COW-ing core entities into extensions → Aptitude ownership rules). Two cases matter here:

- **Base-inherited names** (`General`, `Cleric Domain`, `Fighter Bonus Feat`, etc.): exactly one row exists, in base. Extensions and forks adding new feats/spells just link to base's id via `aptMap`. No sibling rows, no dedup needed.
- **Sibling-shared names** (e.g. `Assassin Spells`, `Blackguard Spells`, `Hexblade Spells`): multiple extensions each create their own copy because siblings can't FK to each other. A book copies another book's spell list that its spells are on: one its spells' level line names (a Complete Adventurer spell's "Assassin 1"), or one that draws on other classes' lists (`spells.inheritsFrom`: Complete Arcane's `Sublime Chord Spells` takes Complete Adventurer's bard and sorcerer spells), so a list holds the spells of every book a ruleset takes, as the copies of a core spell merge. The sibling mechanism (`CowDataBuilder`'s aptitude pass, `engine/core/cow/CowDataBuilder.ts`) picks a winner per name across the source chain, closest first. Losers become the winner's siblings (`CowData.siblingIds`), so the compose step drops them, and its aliases, so references to a loser resolve to the visible winner (its local copy, if the fork has one). They are intentionally not overrides, which are for true copies only. The user never sees duplicates. A list's feats and spells, on the ruleset's pages and in the level-up's pickers, are the composed view's (`RulesetData.listFeatIds` / `listPowerIds`, which the engine's lists and pickers filter by: `entities("feats").openList`, `entities("powers").openList`, `levelUp().openFeatPicker`, `openPowerPicker`), never the stored links: the winning copy of a feat or a spell takes every copy's links, so a link stored on a losing copy of either, or of the list, still counts.

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

The sibling merge (`EntityCopy`'s `mergeSiblings`) merges four types of customizations by the read-time merge's rules (`SiblingMerge`), against the winner's rows it just copied, so the copy holds what the view showed (`tests/services/rulesets/SiblingSemantics.test.ts` copies every winner of a fork of every extension and compares):

| Type | Merge strategy | Deduplication key |
|---|---|---|
| **Requirements** | `mergeRequirements`: appends each sibling tree at a fresh top-level position (ANDed), chains kept intact | top-level standalone `target + operator + value` |
| **Modifiers** | `mergeModifiers`: inserts sibling modifiers (with their own requirements) | `target + value + operator + valueType` |
| **Properties** | `mergeProperties`: inserts sibling properties | `type + value` |
| **Aptitude links** | `mergeAptitudeLinks`: inserts sibling `feats_aptitudes` / `powers_aptitudes` rows, on the aptitude the copy's `CowData` resolves each to, as the copy's own links | resolved `aptitudeId` |

The customizations are copied whole, as the winner's own (`CustomizationCopies.copy`), and each copied row's new ID is recorded, so the mutation that triggered the copy changes the exact copied row. This ensures the user's local copy is self-contained. If they later unsubscribe from one of the extensions, their fork retains the full merged data since it's baked into their own copy, its links to the extension's lists moved to the lists of the same names its other books have (see Unsubscribe below).

## Extensions

Extensions add supplemental entities to a base ruleset. They come in two flavors that share the same data model — a subscription is by reference, never a copy:

Eligibility is determined by `kind = 'extension'` on the ruleset row, set explicitly by the author (or seeded for system extensions). Both flavors share the same row shape:

- **System extensions**: `userId IS NULL`, `kind = 'extension'` (e.g., Complete Warrior).
- **User extensions**: user-owned forks with `kind = 'extension'`, `private = false`, `status = 'Published'`. The `extensions` listing scope returns both flavors merged.

The validators that set `kind = 'extension'` enforce: must be a fork, must not subscribe to other extensions. That keeps the dependency graph one level deep — subscribers never need to walk a transitive chain. The same invariant is enforced on the subscribe path: a host whose own `kind = 'extension'` cannot subscribe to anything (`canSubscribeExtension` policy).

### Subscribe (`subscribeExtension`)

1. Validates: ruleset is a fork, not archived, user is owner, extension is `kind = 'extension'` + published + shares the same base + (if user-owned) public + the host's own `kind` is `'ruleset'`
2. Checks not already subscribed (`extensionRulesetIds.includes`), and that its view would show no two entities of a name (the engine's `copyOnWrite().checkExtensionNames`, over the native names of the host's, its extensions' and the new one's entities: two extensions' entities of a type `NAME_FALLBACK_ENTITY_TYPES` lists pair instead)
3. Appends `extensionId` to `extensionRulesetIds` array
4. Creates tracking row in `ruleset_extensions` (UI metadata: name, `updateAvailable` flag)

No entities are copied. They become visible immediately via the source chain.

### Unsubscribe (`unsubscribeExtension`)

1. Validates: user is owner, extension is subscribed, ruleset not archived
2. Finds the host's copies of the extension's entities: its snapshots whose `sourceEntityId` belongs to the extension
3. **What leaves, and what stands in its place** (`findDepartures`, `extensions/departingReferences.ts`): the extension's entities, the host's copies of them, and their classes' levels, each with what the host's view shows in its place once the extension is gone, read from its `CowData` with and without the extension (`CowDataReader.read`). Of the ids the view shows the entity for (`getEquivalentIds`: the core entity an extension's copy overrides, another book's copy or a namesake it wins over, a list of its name), it's the first that stays, as the view without the extension resolves it, when that view shows it. So the extension's copy of a core feat or spell falls back to the core one (or to another book's copy of it, which wins once this one is gone, as the sibling pairing has it), a list to the list of its name another book has, and a class's level to the level of its number in the class standing in its class's place, as `CowDataBuilder` pairs a copy's levels. An entity only the extension has, a list no other book has, or a level the class standing in its class's place doesn't have, leaves the view: nothing stands in its place
4. **In-use check** (`isExtensionInUseByHost`) — blocks with `ConflictError` if a character on the host picked what leaves the view (`EntityReferences.exists`, every type's picks, a class's by its levels), directly or through the host's copy of it: the pick would dangle. A pick of what something stands in place of doesn't count: step 5 points it there. The check also counts a ruleset built on the host, which has none: fork-of-fork is blocked at policy time, and a host isn't an extension
5. **Repoints what the host keeps** (`repointDepartingReferences`): a host row naming what leaves the view (a link to a list no other book has, an item's template, a class's or a race's parent, a spell's save, a save's or a skill's ability, a class's skill or its levels' saves, granted feats and powers: `EntityReferences.findMany`, the copies' own rows aside, which go with them) refuses the unsubscribe with a `ConflictError` naming them, before anything changes. Then every row of the host and of its characters naming what something stands in place of names that instead (`EntityReferences.findIds`, then `update` given the host): a feat's or a spell's link to the extension's list, a class's grant, a character's pick of a core feat the extension overrides (stored by the copy's id, as a level-up writes the id its view shows: `RequestIds`), the list it's picked from, its level in a class the extension overrides, its race, an item it carries. A row that would then repeat another by its table's primary key goes, as a revert's does. The extension's own rows, and its other subscribers', keep naming its entities
6. **Reverts the host's copies** (`EntityRevert`, as a restore does: see [Restoring an override](#restoring-an-override)), which deletes them and their snapshots. What names a copy names the extension's entity before the copy goes. By then, only another of the copies names one: step 5 moved the host's own rows and its characters' picks, or refused. So a copy naming another never blocks the other's delete, whatever order the copies go in: an item's copy naming its template's copy (`items.source_item_id`, `ON DELETE RESTRICT`), a class level's save (`klass_level_saves.save_id`, restrict too). Nor is a subrace's or a subclass's copy cascaded away with its parent's (`races.parent_id`, `klasses.parent_id`) before its own turn. The host's edit of the extension's copy of a core entity goes too, as its edits of the extension's content do: what named it names what stands in its place, the core entity
7. Removes `extensionId` from the array
8. Soft-deletes the tracking row

### Fork Inheritance

When a ruleset with extensions is forked, the child inherits:
- `extensionRulesetIds` — copied as-is
- `ruleset_extensions` metadata rows — duplicated for the child

The child can subscribe to and unsubscribe from extensions independently of the parent.

## Authorization

See [docs/access.md](./access.md) for the full policy matrix across rulesets, characters, campaigns, and customizations, plus the listing-scope reference for the create-character wizard. Quick summary for ruleset writes: `canUpdate` (metadata) requires owner or **Admin** contributor; `canUpdateEntity` (content) also accepts **Editor** contributors; `canPublish` / `canSubscribeExtension` / `canUnarchive` / `canManageAdminContributors` are owner-only.

### What `inUse` means in entity-delete services

`inUse` is about one thing: would deletion orphan a character pick on the
**current ruleset or any descendant fork**? Nothing else.

- **Scoping is current + descendants.** The in-use check,
  `EntityReferences.exists`, reads every character row naming an entity of the
  type (`ENTITY_REFERENCES`), and joins the character's ruleset on
  `id = $rulesetId`, or `$rulesetId` among its ancestors or its extensions — one
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

- **Don't include class-side references** (`klass_level_feats`,
  `klass_level_powers`, `klass_skills`, etc.). Class definitions are
  author-owned content: if the author deletes a feat their class grants, the FK
  cascade wipes the grant and the author can fix it. Class-granted feats that a
  character actually picked are recorded on the character
  (`level_feats_in_character.feat_id`), so the character-side check already
  covers that case.

The principle: only protect what the user *invested* in (their character
picks). Author-owned data that breaks via cascade is recoverable by the author.

The shared check lives in `services/rulesets/characterPicks.ts` as `hasCharacterPicks(tx, entityType,
ids, rulesetId)` (a class by its levels) and is reused by every entity-delete service and
a class level's or a class skill's removal. One helper, one scoping rule, one source of truth.

## Entity Services Pattern

Every entity service works in the ruleset's scope (`withRulesetScope`): reads come from its composed view, which the service binds the engine to whole (`Engine.for(scope)`), and writes to an inherited entity go to the fork's copy, made on its first edit (`EntityEdit`, `EntityCopy`: `server/cow/writes/`):

```ts
// Read (list): the repository reads the ruleset and its source chain, less the sibling losers, with what the kind's
// list narrows them to (`filters`); the engine describes the rows as the view does
return await withRulesetScope(db, rulesetId, async (scope) => {
  const list = Engine.for(scope).entities("saves").openList(where);
  const result = await Saves.findPage(
    db,
    { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
    pagination,
  );
  return { ...result, items: list.describe(result.items) };
});

// Read (one): the entity as its page shows it, or the engine's not-found refusal (a 404)
return Engine.for(scope).entities("saves").describe(saveId);
```

A kind's creates, updates and deletes go through its writer, `EntityWriter` (`server/services/rulesets/EntityWriter.ts`), a field of its service: the service hands it the plan its rules give (`Engine.for(scope).entities(type)`), and it takes every kind's steps around it, in one order:

```ts
private readonly writer = new EntityWriter("languages", Languages, languagesInRules, "Language");

return await this.writer.create(session, rulesetId, body.name, (scope) =>
  Engine.for(scope).entities("languages").planCreate(body),
);
return await this.writer.update(session, rulesetId, body, (scope) =>
  Engine.for(scope).entities("languages").planEdit(languageId, body),
);
return await this.writer.delete(session, rulesetId, languageId, (scope) =>
  Engine.for(scope).entities("languages").planDelete(languageId),
);
```

- **A create** checks access, then the name against the composed view (`EntityNames.assertNameAvailable`), plans, writes the row, points a tombstone the name hides at it (`repointTombstone`), and writes its list links (`listLinks.ts`), what its plan writes beside it (`writeEntityWrites`) and the customizations it copies (an item's duplicate's).
- **An update** writes the row the view's entity resolves to: the fork's own, or the copy of an inherited one (`EntityEdit.cowToEdit`), refused when stale (a copy's `updatedAt` isn't the client's). It replaces its list links when the plan gives them.
- **A delete** is refused while the entity is in use: picked by a character, unless the kind says otherwise (a saving throw a class level grants, `inUse`). It deletes the row the entity resolves to (`EntityEdit.cowToDelete`), the fork's own locked first, with what its plan removes.

Each records its activity (`createLanguage`, `updateLanguage`, `deleteLanguage`: the writer's activity name), which carries the ruleset's base rules, as every change to a ruleset's content does (`createActivityWithNotifications` reads them off the ruleset it notifies the stakeholders of: the client names the change in the ruleset's words, a 3.5 power a spell), and drops the ruleset's views. A kind adds what's its own: what its plan reads (a feat's tombstone ancestor, whether it was generated, an item template's copies when its edit changes its type), what refuses its delete (`refuse`: an item template's copies) and what it compares to the entity it was (an item's template, from the row).

A create or an edit answers its row with the fields the entity keeps once written (its plan's `fields`: a skill's, a race's, none of an ability's), as a page describes its rows, and a class's levels, class skills and table keep their handle (`class(klassId).planLevelDelete`, `describeLevel`).

Every kind's rules are a class on one base (`engine/core/entities/RulesetEntity.ts`), whose steps every kind takes, a kind adding its rules to the ones they name:
- **Described** (`describe(id)`): the entity found (`find`, refused as not found), its row as the view resolves it, with the fields its properties hold (the kind's `fields`, a codec: `FieldCodec.NONE` for a kind without). A kind whose page shows its customizations adds them (`CustomizationPageEntity`: a race, a feat, a power, an item, a class level); an item's are merged with its template's (`propertiesOf`, `requirementsOf`), and it names its template (`templateName`).
- **Listed** (`openList(where)`): what the server reads a page with (`filters`) and its rows described alike. A feat's and a power's list narrows them to a list's, and gives its rows their lists as the ruleset composes them (`ListedEntity`, which also refuses a feat in a spell list and a spell in a feat pool); an item's gives its rows their template's name.
- **Written** (`planCreate(body)`, `planEdit(id, body)`): the entities the form names by id read as the view reads them (`resolveIds`, by `RequestIds`: a copy's for its source's id, one the view lacks refused by name), the form checked (`checkForm`), its row's columns (`columnsOf`), its list links (`linksOf`), what it writes beside them (`writesOf`: a skill's fields and its Skill Focus, a power's fields and its school's Spell Focus, a class level's base attack and skill points), and the fields it keeps once written (`fields`).
- **Deleted** (`planDelete(id)`): checked (`checkDelete`: the aptitude the general feats count toward), and what it writes with it (`deleteWritesOf`: a skill's Skill Focus).

A class's parts are bound to the class as the view has it (`entities("klasses").levels(klassId)`, `skills(klassId)`, `table(klassId)`): its levels are a kind of their own on the same base, found among the class's.

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

The engine is the root `engine/`, which computes over the data it's given and reads nothing itself. Code outside it enters it through its one entry, `engine/index.ts` (`arkyvree/engine-front-door`), as the client enters the server through its API:

```
engine/
├── index.ts                               ← the entry: Engine, its handles' and its operations' types, each entity
│                                          kind's rules (EntityKinds) and what an operation takes as every
│                                          registered ruleset's does (Accepted), RulesError
├── api/                                   (Engine and the handles it hands out, a class each, whose methods are the
│                                          operations: RulesetEngine, a ruleset's view bound by Engine.for, and its
│                                          handles by what the rules are about: CharacterEngine and its
│                                          LevelUpEngine, CharactersEngine, ClassEngine, ModifiersEngine,
│                                          PropertiesEngine, RequirementsEngine, TargetPathsEngine, PropertyTypesEngine,
│                                          and entities(type): an entity kind's own class, from its module;
│                                          ContentEngine, Engine.forRules; CopyOnWriteEngine, Engine.copyOnWrite;
│                                          Modules: each base rules' module, built once)
├── core/                                  ← machinery, no game vocabulary
│   ├── RulesError.ts                      (a rule's refusal, by kind, and the issues a character fails)
│   ├── module/                            ← the module's contract
│   │   ├── contract.ts                    (RulesetModule: a module's parts, typed by what it describes in its own
│   │   │                                  shape, Descriptions, its entity kinds and its seeded fields)
│   │   ├── parts/                         (a folder per part: characters/, levelUp/, entities/, content/, ruleset/.
│   │   │                                  Each holds its abstract class (CharactersPart, LevelUpPart…: the
│   │   │                                  operations a ruleset answers its own way abstract, those that read the
│   │   │                                  schema alone or guard a character's privacy and integrity concrete,
│   │   │                                  over hooks where a ruleset differs: planLanguages, describeCard,
│   │   │                                  describeInventory over describeInventoryEntry, describe and
│   │   │                                  describeForMember over describeFull and describePartial,
│   │   │                                  planInventoryEntry over planPlacement, planAbilities and planCreate
│   │   │                                  over describeCreation, checkPublishable over findMissingContent,
│   │   │                                  toEntityProperties over its codecs) and what its operations take and
│   │   │                                  answer, by role: requests.ts (a form's request, a query), plans.ts (a
│   │   │                                  named …Plan: what the server writes, by table), descriptions.ts (what a
│   │   │                                  describe* answers in a shape every ruleset shares); its index.ts)
│   │   ├── pickers.ts                     (what an open* answers, every part's pickers alike)
│   │   ├── CharacterInputs.ts             (CharacterInput, CharacterRows: a character's rows as the server reads
│   │   │                                  them, and their references resolved as the view reads them)
│   │   └── CharacterProjection.ts         (the rows a level-up adds before it's saved: levels added, replaced or
│   │                                      left out, and the picks at them)
│   ├── view/                              (RulesetView, RulesetData, with a list's members, RulesetComposition, the
│   │                                      sibling merge: SiblingMerge, SiblingRows)
│   ├── cow/                               (CowData, CowDataBuilder; CowSources: the source chain and the rows CowData
│   │                                      is read from; ExtensionNames: the extensions' name check)
│   ├── customizations/                    (ModifierEdits, PropertyEdits, RequirementEdits, on CustomizationEdits:
│   │                                      an entity's customizations, bound to it, read from its bucket in the
│   │                                      view, described, and what they store, checked; TargetLabels:
│   │                                      their labels, one way; CustomizedEntity: the entity they're on, as the
│   │                                      view has it; PropertyTypeCatalog: the property types and values, the
│   │                                      rules' then the ruleset's own)
│   ├── entities/                          (RulesetEntity: an entity kind's steps, which a ruleset's kinds extend;
│   │                                      CustomizationPageEntity: a kind whose page shows its customizations;
│   │                                      ListedEntity: a kind a ruleset lists, a feat in a pool, a power on a
│   │                                      spell list; AbilityEntity, LanguageEntity, MechanicEntity, SaveEntity:
│   │                                      the plain kinds, which a module uses as they are; GeneratedFeats: the
│   │                                      base of a set of feats an entity brings (featsOf), made in the pool a
│   │                                      ruleset names, removed by a set that removes its feats)
│   ├── fields/                            (Field, FieldCodec: an entity's fields kept in its properties)
│   ├── character/                         (CharacterBase: a character's state, its evaluators and its build, its
│   │                                      components set up and finished, the modifiers in rounds behind their
│   │                                      requirements, the ruleset's steps its hooks; the rows it has from outside
│   │                                      its source chain and the names its issues give, findSourceIssues and
│   │                                      resolveEntityName, over its ruleset's rows and names, listEntityRows
│   │                                      and nameEntity; CharacterDataLoader: its data, what every ruleset's
│   │                                      reads (LoadedCharacter: its campaign and player, its inventory's items,
│   │                                      its modifiers in order and the groups gating them, the rulesets its rows
│   │                                      may come from), the ruleset's parts, its modifiers' sources and its own
│   │                                      data its hooks (partsOf, sourcesOf, loadOwn); CharacterComponent: a
│   │                                      component, its initialize and its finalize; Validates: its issues, the
│   │                                      ruleset's own a hook; CharacterBuilder: a character of its row's kind,
│   │                                      on CharacterBase, its master built first)
│   ├── levelUp/                           (LevelUpBase: what every level flow reads, the view, the character's
│   │                                      rows and its ruleset's level-up rules, LevelUpRules; SelectionChecks: a
│   │                                      level's hit points and selections checked; the flows any ruleset takes
│   │                                      as they are, LevelRemoval and BondedCreatures, LevelsPlanning, a save's
│   │                                      and an edit's checks in their order over the rules' hooks, and
│   │                                      LevelSelections, a saved level's selections with what the ruleset adds
│   │                                      of a picked feat; PicksDistribution: a save's pooled picks spread over
│   │                                      its planned levels, the feats and powers in each level's pool slots,
│   │                                      none dropped, the skill points a hook, distributeSkills, and the picks
│   │                                      that overfill a pool refused, refuseOverfull)
│   ├── pickers/                           (Picker: one pipeline, `filters` and `describe(rows)`: the rows as the
│   │                                      view reads them, those it offers, each with whether who it picks for
│   │                                      meets its requirements and the tree of those it fails, and what it adds;
│   │                                      a ruleset's picker says what differs. CharacterPicker checks against the
│   │                                      character as the level-up plans it (`project`), its ruleset's build
│   │                                      (`build`), built once; LevelPicker, a feat's or a power's, projects it
│   │                                      to the level it picks at, with the feats picked so far, and leaves out
│   │                                      what the character holds with every level it has and plans (`holder`))
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
    ├── index.ts                           (what the entry takes of it: Dnd35Module)
    ├── limits.ts                          (RULESET_LIMITS: the bounds its operations check on its columns)
    ├── Dnd35Module.ts                     (Dnd35Module.create(): the 3.5 module, by the contract, each part a class
    │                                      extending its abstract part)
    ├── descriptions.ts                    (Dnd35Descriptions: what the 3.5 rules describe in their own shape)
    ├── Dnd35TargetPaths.ts                (the categories' order; each labels the ruleset's names: labelNames)
    ├── Dnd35PropertyTypes.ts              (the property types and values it serves: vocabulary/dnd3.5/properties/)
    ├── model/                             ← what a character has, a folder per concept: its component, on core's
    │   │                                  CharacterComponent, and its paths' category (abilities/ aptitudes/
    │   │                                  classes/ feats/ identity/ powers/ saves/ skills/, AbilitiesComponent,
    │   │                                  AbilitiesPaths…), and the shared base
    │   ├── DetailedCharacter.ts           (which wires CharacterState, on core's CharacterBase, and its concerns/:
    │   │                                  Builds, the build's 3.5 steps, Diagnoses, its own issues and its
    │   │                                  entities' rows and names, PossessesVirtually, and core's Validates;
    │   │                                  CharacterComponents, the components in the order the build sets them up;
    │   │                                  Dnd35CharacterBuilder, on core's CharacterBuilder: a character of its
    │   │                                  row's kind)
    │   ├── loading/                       (DetailedCharacterDataLoader, on core's CharacterDataLoader, and
    │   │                                  LoadedCharacterData; its steps its concerns/: CustomizesEntities,
    │   │                                  LoadsPicks, ReadsRuleset, ResolvesPossessions; loadedEntities.ts: the
    │   │                                  entities it loads, CustomizedFeat, CustomizedPower…)
    │   ├── combat/                        (CombatComponent on CombatState, which includes concerns/: ArmorClass,
    │   │                                  HitPoints, Attacks, InitiativeAndSpeed; ArmorsComponent, ShieldsComponent,
    │   │                                  WeaponsComponent, EncumbranceComponent; the combat, items.* and weapon.*
    │   │                                  path categories: CombatPaths, ItemsPaths, WeaponPaths)
    │   ├── spellcasting/                  (SpellcastingComponent on SpellcastingState, which includes concerns/:
    │   │                                  BonusCasterLevels, KnownPowers; SpellcastingPaths)
    │   ├── inventory/                     (InventoryComponent)
    │   └── bonded/                        (the bonded creatures' characters, an advancing one's feats and skill
    │                                      ranks scaled to its hit dice, BondedComponent, BondedPaths)
    ├── entities/                          ← the module's `entities`: an entity kind's rules, a folder per kind
    │   ├── Dnd35Entities.ts               (each kind's class, by its table: `of`)
    │   ├── aptitudes/ classes/ feats/ items/ powers/ races/ skills/
    │   │                                  (XEntity: an entity described, what saving or deleting one writes; fields.ts:
    │   │                                  its fields off its properties; classes/ ClassLevelEntity, ClassSkills,
    │   │                                  ClassTable: a class's parts, which ClassEntity hands out; the abilities,
    │   │                                  languages, mechanics and saves are core's kinds as they are)
    │   └── feats/                         (SkillFocusFeats, SpellFocusFeats: a skill's Skill Focus, a school's Spell
    │                                      Focus, sets of core's GeneratedFeats in the general feats' pool)
    ├── ruleset/                           ← the module's `ruleset`: what it answers of a ruleset as a whole
    │   ├── Dnd35Ruleset.ts                (findMissingContent: what a ruleset published to be played needs, which
    │   │                                  core's checkPublishable refuses it without)
    │   └── fields.ts                      (RULESET_FIELDS: the ruleset's own fields, its skill points' ability)
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
    ├── levelUp/                           ← the module's `levelUp`: Dnd35LevelUp, on core's LevelUpPart, gives
    │                                      the level-up rules core's flows read (buildCharacter,
    │                                      getAbilityIncreaseTotal, hitPointsOf, unrolledLevelHp,
    │                                      planBondedCreatures: BondedPlans; and the save's hooks, the issues an
    │                                      edited level answers for, findEditedLevelIssues, its own). A class per
    │                                      3.5 operation on LevelUpState (core's LevelUpBase, with the steps the
    │                                      wizard and the preview share, the skills step its concern,
    │                                      SpendsSkillPoints: what the form's skill points come to, as a save
    │                                      spreads them; and a pool's room: the picks fitted to their pools,
    │                                      fitPicks): PlannedLevelsState, the planned levels, what they give (each
    │                                      level's pool slots, its concern PlansAptitudeSlots) and their picks
    │                                      spread over them (Dnd35PicksDistribution, on core's PicksDistribution:
    │                                      the skill points class-skill levels first, within each level's rank
    │                                      caps), which LevelUpPreview (the wizard's preview) and LevelUpPlan (what
    │                                      core's save asks: the planned levels read, their picks spread, the pools
    │                                      picks overfill) build on; LevelUpSteps: the wizard's steps, which it
    │                                      lists (abilities, skills, feats, powers) and answers by name;
    │                                      Dnd35LevelSelections: a saved level's selections, with each feat's pools
    ├── pickers/                           (the 3.5 pickers, on core's: ClassPicker (a class's next level) on
    │                                      CharacterPicker; Dnd35LevelPicker (FeatPicker, PowerPicker: the level
    │                                      they pick at) on LevelPicker, with 3.5's builder and unrolled hit points;
    │                                      RacePicker on Picker, checking a new character's form)
    ├── content/                           ← the module's `content`: Dnd35Content, what the seeders and the codegen
    │                                      ask: BookPaths, and the codecs of the fields they seed
    └── rules/                             (the rules several sides read: AbilityRules, LevelRules, SkillRules,
                                           ItemPlacement and InventorySlots: where an item goes and an entry's
                                           slot, SpellLists: the view's spell lists, derived once with it
                                           (`RulesetData.derive`), BondedRaceData: a bonded creature's stat block;
                                           over the books' numbers in vocabulary/dnd3.5/)
```

In the server: what reads the rows an operation takes (`server/services/characters/characterInputs.ts`: `readCharacterInput`, `readBondedInputs`), and what writes what an operation plans (`server/services/rulesets/entityWrites.ts`: `writeEntityWrites`; `levels/bondedWrites.ts`: `writeBondedCreatures`). The PDF job (`server/jobs/generatePdf.ts`) and the shared PDF route render the document `character(input).describeSheet` answers. The server names no ruleset and builds no character: it reads, asks the engine and writes. Each of its actions asks the engine one operation, which answers it whole (`arkyvree/one-engine-op`): a plan carries what it answers once written, a picker or a list its filters, a description all its page shows. It binds the engine to the view as its scope gives it (`Engine.for(scope)`), reading of it only the copy-on-write data (`rulesetData.cow`: the source chain its reads filter by, what `EntityNames` and `CustomizationEdit` check and write by; `arkyvree/opaque-view`).

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
│   │       ├── CharacterLevelsService.ts  (a save, an edit, a removal: levelUp().planLevels, planEdit,
│   │       │                              planRemoval, each with what the bonded creatures become; the preview;
│   │       │                              a saved level's selections)
│   │       ├── concerns/                  (Pickers: the class, feat and power pickers' pages; Steps: the steps
│   │       │                              the ruleset lists for a level, and one by its name)
│   │       └── bondedWrites.ts            (the bonded creatures the engine plans, written)
│   └── rulesets/                          ← entity CRUD for feats/powers/aptitudes/…
│       └── entityWrites.ts                (what the engine plans a form writes beside its row, written)
└── routers/
    └── api/
        └── characters/
            └── levels/index.ts            ← the level routes
```

### What goes in `engine/` vs `dnd3.5/`

#### Universal (anything of these is a sign the file belongs in `engine/` or is a generic type)

- Takes a level-based character (abilities/class/levels/feats/powers in the abstract) and operates on it.
- No hardcoded game values (spell level = 9, class names, save names, skill rank bounds).
- No `SPELL_SCHOOL` / `WIZARD_PROHIBITED_SCHOOL` / 3.5-specific property constants.
- Doesn't cast to the 3.5 `DetailedCharacter` or narrow to 3.5 types.
- Asks the ruleset for what's its through the module's contract (its property types, which order an entity's properties, its target paths' `getEntityNamingCategories`) instead of hardcoding.

#### Ruleset-specific (signs the file belongs in `dnd3.5/` or a sibling ruleset dir)

- Uses 3.5 concepts in types/signatures: `rank`, `powerLevel` as spell level 0–9, `saveName` as Fortitude/Reflex/Will, class-skill distinctions, wizard prohibited schools, BAB progression.
- References named classes/spells/feats/mechanics: "Wizard Spells", "Fighter Bonus Feat", "Power Attack", "specialization school".
- Computes a 3.5-shaped result: `{ total, available, spent, perlevel }` skill budget, a `computeSkillPointsPerLevel` in the level-up (`PlannedLevelsState`), etc.
- Imports from `@/engine/rulesets/dnd3.5/*` or casts to a `Dnd35*` type.

### The type split pattern

The engine's types keep the narrowest surface any level-based system could implement: the module's contract (`engine/core/module/contract.ts`), the rows it takes (`CharacterInputs.ts`), its operations' types by role, and what its machinery reads, each beside its area (`RulesetView` in `core/view/`, `Components` and `TargetPaths` in `core/paths/`). A ruleset's types are its own, each beside what produces it. A part's types sit beside it, in its folder (`engine/core/module/parts/<part>/`: its abstract class, and its index), and sort there by role, as their operations' verbs do: what an operation takes is `requests.ts` (one named type per input: a form's request, `LevelUpRequest`, `NewCharacterRequest`; a step's or a picker's query, `LevelQuery`, `PickQuery`; whether to force the rules is always the operation's last argument, never a request's field), what a `plan…` answers is `plans.ts` (a named plan, never a bare list: `LevelsPlan`, `AbilitiesPlan`, `BondedCreaturesPlan`, `EntityCreatePlan`, and the rows it writes, `FeatPick`, `SkillRank`, `AbilityScore`), what a `describe…` answers in a shape every ruleset shares is `descriptions.ts` (`CharacterCard`, `CharacterCreation`, `WizardStep`), and what an `open…` answers is the module's `pickers.ts`, which every part's pickers share. So a part's folder holds its whole contract: the characters' requests are `parts/characters/requests.ts`, the level-up's `parts/levelUp/requests.ts`, and a type another part reads is imported from its owner's index (a level-up's new bonded creature takes the characters' `AbilityScore`). What a level-up projects is rows (`CharacterProjection.ts`, beside `CharacterInputs.ts`): a ruleset builds a planned character as it builds a saved one, so what a level grants and what a pick carries are read one way.

```ts
// engine/core/module/contract.ts  (universal): each part an abstract class of `parts/<part>/`, which a ruleset extends
export interface RulesetModule<D extends Descriptions, E extends EntityKindsContract, F extends Record<string, Fields>> {
  characters: CharactersPart<D>;
  content: ContentPart<F>;
  entities: EntitiesPart<E>;
  levelUp: LevelUpPart<D>;
  ruleset: RulesetPart;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPaths;
}

// engine/core/module/parts/levelUp/LevelUpPart.ts  (universal): what the server reads is a core type, what it hands the
// client as it is the ruleset's own (`D`)
export default abstract class LevelUpPart<D extends Descriptions> {
  abstract describePreview(view: RulesetView, character: CharacterInput, …): D["preview"];
  // The wizard's steps are the ruleset's: it lists a level's, and answers one by its name (`D["step"]`, a union of
  // its steps, each named for which it is)
  abstract describeStep(view: RulesetView, character: CharacterInput, name: string, query: LevelQuery): D["step"];
  abstract describeSteps(view: RulesetView, character: CharacterInput, query: LevelQuery): readonly WizardStep<D["step"]["name"]>[];
  abstract planLevels(view: RulesetView, character: CharacterInput, bonded: CharacterInput[], request: LevelUpRequest, force: boolean): LevelsPlan;
  …
}
```

```ts
// engine/rulesets/dnd3.5/levelUp/Dnd35LevelUp.ts  (the 3.5 module's own)
export default class Dnd35LevelUp extends LevelUpPart<Dnd35Descriptions> { … }

// engine/core/module/CharacterProjection.ts  (universal): what a level-up adds before it's saved, as the rows it
// would save, which a ruleset builds the character from as from saved rows
const projection = new CharacterProjection(input);
projection.dropLevelsFrom(editedLevelId); // the character as it was before a level
const level = projection.addLevel(klassLevelId, { abilityIncreases, hp, replacing }); // or a level replaced where it stands
projection.pick(level, { feats, powers, skills });
new Dnd35CharacterBuilder().build(view, projection.input);
```

A module is typed by the contract: each part is an abstract class of `engine/core/module/parts/<part>/`, which a ruleset's part extends, so the compiler lists every operation a part lacks ("Non-abstract class 'Pf1LevelUp' is missing implementations for the following members of 'LevelUpPart'…"). `Modules.of(baseRules)` hands each module out as the contract's type (`Module`, over what the registered modules describe), and each handle's operation takes its arguments from its part's abstract method, past those the handle binds (`Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>`), so the server calls an operation with the contract's types, naming no ruleset:

```ts
// server/services/characters/levels/CharacterLevelsService.ts
return await withEditableCharacter(db, session, characterId, (scope, character) =>
  Engine.for(scope).character(character).levelUp().describePreview(levels),
);

// engine/api/LevelUpEngine.ts
type Args<K extends keyof Module["levelUp"]> = Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>;

export default class LevelUpEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly input: CharacterInput,
  ) {}

  describePreview(...args: Args<"describePreview">) {
    return this.module.levelUp.describePreview(this.view, this.input, ...args);
  }
}
```

The engine's own types name no ruleset (`arkyvree/layers`): its path walk reads `Components`, which the 3.5 character narrows to its own (`Dnd35Components`).

### The module's parts

What a ruleset answers is its module's: five parts, each a class whose operations call the classes its domain folders hold, and the factories and the order the machinery calls. A character isn't one of them: an operation builds the ruleset's own (`CharacterBuilder.build`), from the input it's given. The entry's handles ask them, each past what it binds (the view, a character's rows, a class).

| Member | What it answers | 3.5's | The handles that ask it |
|---|---|---|---|
| `characters` | a character's sheets (the API's, a campaign member's reading, partial or whole, the printed one), a list's card of one, its inventory (each entry with where its item can go and where it's worn), how a new one sets its ability scores (the methods its form runs by kind, the scores' bounds, each score's modifier), what a new one and an inventory entry store (what equipping an item checks), what keeps a slot from taking an item, the languages it can speak, the races a new character can pick | `Dnd35Characters`: `describeCreation`, `describeSheet`, `describePlacement`, `openRacePicker`: each named as its handle's operation is; `describeCard`, `describeInventory` (over its hook, `describeInventoryEntry`: 3.5's `InventoryEntries`, by `ItemPlacement`) and `planLanguages` are `CharactersPart`'s, which read the schema's rows and the view alone, and so are `describe`, `describeForMember`, `planInventoryEntry`, `planAbilities` and `planCreate`, which guard a character's privacy and integrity over 3.5's hooks (`describeFull`, `describePartial`: `CharacterDescription`; `planPlacement`: `InventoryEntries`; `describeCreation`: `NewCharacters`) | `character(input)` (`CharacterEngine`), `characters()` (`CharactersEngine`) |
| `entities` | each entity kind's rules, by its table: an entity found and described, a page opened (`openList`), what saving or deleting one writes, what the rules refuse of an edit; a class's levels, class skills and table, which the classes' kind hands out | `Dnd35Entities`: `of(view, type)`, each kind's class (`SkillEntity`, `FeatEntity`, `ItemEntity`…; `ClassEntity`'s `levels(klassId)`, `skills(klassId)`, `table(klassId)`) | `entities(type)`, `class(klassId)` (`ClassEngine`) |
| `levelUp` | the level flows: the preview, a save's levels and its check (its picks refused when they pick a power the character knows in its pool already or overfill a pool, forced or not; the character with them, unless forced), a saved level's edit, the last level's removal, the bonded creatures the levels make, the wizard's steps and pickers, a saved level's selections | `Dnd35LevelUp`: `describePreview`, `describeSteps`, `describeStep`, `openFeatPicker`…, `describeLevel`: each named as its handle's operation is, and as the class it opens names it (`LevelUpPreview.describePreview`, `Dnd35LevelSelections.describeLevel`); `planLevels`, `planEdit`, `planRemoval` and `planBonded` are `LevelUpPart`'s, core's flows over the rules 3.5 gives (`LevelsPlanning`, `LevelRemoval`, `BondedCreatures`) | `character(input).levelUp()` (`LevelUpEngine`) |
| `ruleset` | what a ruleset needs as a whole, past its entities: to be published to be played, a player race and class, a skill and a feat | `Dnd35Ruleset`: `findMissingContent`, which `RulesetPart.checkPublishable` reads (an extension needs none) | `checkPublishable` |
| `content` | what the seeders and the codegen ask: the paths a book can target, an entity's fields as its properties | `Dnd35Content`: `listBookTargetPaths`, and the codecs of its seeded fields, which `ContentPart.toEntityProperties` writes with | `Engine.forRules(baseRules)` (`ContentEngine`) |
| `createTargetPaths`, `createPropertyTypes` | the ruleset's path categories, its property types (in stat-block order, which the view orders an entity's properties by: `PropertyOrder`) | `Dnd35TargetPaths`, `Dnd35PropertyTypes` | `targetPaths()`, `modifiers(…)`, `requirements(…)`; `propertyTypes()` |

What the characters part guarantees, whatever the ruleset: the operations that guard a character's privacy and integrity are `CharactersPart`'s, template methods over hooks for what a ruleset describes or checks its own way, so a ruleset supplies the hooks and can't skip a check. `tests/engine/core/module/ModuleConformance.test.ts` runs them on each registered module, with its seeded characters.

- **Private notes**: `describe` and `describeForMember` apply the reading. A reader who doesn't read the notes (a member's `blank` or `partial` reading, a share link's `omit`) is described from rows without them (the character's, its master's, its bonded creatures'), and the sheet's, its creatures' too, are blanked or left out where every ruleset's sheet holds them: its identity's background (`NotedSheet`), its creatures' sheets in `bonded` (`DescribedSheet`, which `Descriptions["sheet"]` extends). A partial reading is the ruleset's allowlist (`describePartial`), given no bonded creatures; the sheet is its `describeFull`.
- **Inventory**: `planInventoryEntry` reads an added item as the view has it (`RequestIds`: a copy's for its source's id), refusing one the view shows none of (unknown, of neither the character's ruleset nor its source chain, or deleted), as `planLanguages` refuses a language, and charges set one without the other or remaining past total; the ruleset's `planPlacement` answers where the item is held, with what equipping it there checks, and the plan names the item by the view's id.
- **Ability scores**: `planAbilities` and `planCreate` refuse a score past the bounds its `describeCreation` gives (`scores`), an ability not of the ruleset or given two scores (by its source's id and its copy's), and `planCreate` a race not of the ruleset or not a player's (of kind `pc`); an unset score starts at `scores.start`, and each is planned under the view's id of its ability, the race too.

A part's operation is a method of a handle of `engine/api/`, which `Engine` hands out, dispatched by the view's base rules (`Modules.of(view.ruleset.baseRules)`, which `Engine.for(scope)` reads once; a content operation by the base rules its caller names, `Engine.forRules(baseRules)`, with that module's own types: its seeded fields). The target paths' handle asks the target paths (`targetPaths()`: `list`, `validate`, `getCompletions`, which `CategoryPaths` answers, over `PathChecks` and `PathCompletions`; `planModifier`, a character's modifier's row, as an entity's modifier plans its own: `ModifierEdits.rowOf`, its value checked by `CategoryPaths.checkValue` and a number stored as the sheet reads it, `LiteralValue.normalize`), and the view's build asks the order (`Engine.copyOnWrite().buildView`). The properties' and the customizations', which no ruleset changes but by its factories, ask the core's classes (`engine/core/customizations/`): `PropertyTypeCatalog` adds the types and values the ruleset's own properties use to its rules' (`createPropertyTypes`: `propertyTypes()`'s `list`, `getTypeCompletions`, `getValueCompletions`); `ModifierEdits`, `PropertyEdits` and `RequirementEdits` (on `CustomizationEdits`, bound to the entity as their handles are) describe an entity's customizations and plan their saves, a modifier's or a requirement's row checked against its target paths (`modifiers(entityType, entityId)`: `describe`, `describeAll`, `planCreate`, `planEdit`, `planDelete`, and `properties(…)` and `requirements(…)` alike; a list's, `targetPaths().describeModifiers`, labeled as the entity's are: `TargetLabels.describe`), on the entity the view has (`CustomizedEntity.find`, refused as not found otherwise). Copy-on-write's (`Engine.copyOnWrite()`) ask the core's classes too (`CowSources`: `buildSourceChain`, `getReads`; `ExtensionNames`: `checkExtensionNames`; `SiblingMerge`: `mergeCustomizations`). `entities(type)` hands out a kind's class, whose `find` and `describe` read the view (`RulesetData.find`; a customizable kind's `describe` with its customizations), and `checkPublishable` asks the ruleset part's `checkPublishable`, which an extension passes. An operation takes the data its caller read: the view (`RulesetView`: the ruleset and its `rulesetData`), which `Engine.for` binds, a character's rows (`CharacterInput`: its record, its rows, a bonded creature's master's), which `character(input)` binds, a request's body. It answers data:

- **A description**: what the API answers (`character(input).describe`, `class(klassId).describeLevels`), a picker's or a list's filters, which the server reads a page with, and what describes the page it read (`levelUp().openFeatPicker`'s `describe`, `entities("feats").openList`'s `describe`), the printed sheet's document (`character(input).describeSheet`).
- **A plan**: what to write, without ids, always a named object (its part's `plans.ts`: `LevelsPlan`, `AbilitiesPlan`, `InventoryEntryPlan`, `BondedCreaturesPlan`…), never a bare list. `EntityWrites` is what an entity's form writes beside its row: the properties its fields are kept in, a requirement on it, the entities it makes (`made`: each with its table, its row's columns, its list links and its customizations; 3.5's Skill Focus and Spell Focus, sets of core's `GeneratedFeats`, `engine/core/entities/GeneratedFeats.ts`), and those it removes (`removed`, by table and id). A level-up's is each level's writes (`LevelWrites`: its row's columns, and its rows in the tables under it, by table: its ability increases, each an ability and an amount, and its picks), and what the master's bonded creatures become with them (`levelUp()`'s `planLevels`, `planEdit`, `planRemoval`; the seeders', `planBonded`: a creature it makes as its row whole, after its master's, with its ability scores), which the service writes as they are, table by table. A plan whose save answers the entity carries what it answers once written (`describe(row)`: the saved row with the fields the save keeps, `entities("skills").planCreate`). The server writes a plan in its transaction (`writeEntityWrites`, `writeBondedCreatures`), which reads of the view only its copy-on-write data, and of the database what a write depends on: whether a grouping's feats are there already, whether a character picked a feat it removes.
- **A refusal**: a `RulesError` naming its kind (`invalid`, `unprocessable`, `conflict`, `not-found`), which the server answers as its error of that kind (`characters().planLanguages`, `checkPublishable`, and a plan's own: `character(input).planInventoryEntry` an item the character can't equip where asked, `entities("aptitudes").planEdit` renaming a pool the characters count on by name). What a character fails is refused with its issues (`RulesError.refuseIssues`): `levelUp().planLevels` refuses the character with its new levels, unless forced.

Its verb says which: `describe…`, `get…` and `list…` answer what something is, `open…` a picker or a list, `plan…` a plan, `check…` refuses or answers what it checked, `validate…` a path's validation, `build…` the view, its copy-on-write data and its source chain (`buildView`, `buildData`, `buildSourceChain`), `merge…` the rows a copy takes of its siblings, and `to…` a conversion (`toEntityProperties`). A method named for a noun hands out a handle (`character(input)`, `class(klassId)`, `entities("skills")`, `levelUp()`), and isn't an operation (`arkyvree/one-engine-op`).

An entity's fields are declared once, in its kind's folder, as a spec a codec reads and writes (`engine/core/fields/`: `Field`'s kinds, `FieldCodec`): `entities/skills/fields.ts` declares `SKILL_FIELDS`, from which come the fields' values (`SkillFieldValues`), their defaults, the property types that store them, their reading off an entity's properties (`read`, in one pass) and their writing back as id-less `PropertyValue`s (`toProperties`, `write`), an edit's merge, the rule between them (`normalize`, which reading and writing apply), and the schema a save reads a form's fields with, a create's (every field) and an edit's (those it changes: `schema({ optional: true })`). Its entity class describes it and plans its saves with them (`skills/SkillEntity.ts`: its `fields`, and what a save writes beside its row), the character's loader reads with them, and the seeders write with them (`Engine.forRules(baseRules).toEntityProperties`):

```ts
// engine/rulesets/dnd3.5/entities/skills/fields.ts
export const SKILL_FIELDS = new FieldCodec(
  {
    checkPenaltyMultiplier: Field.number(SKILL_CHECK_PENALTY_MULTIPLIER, { default: 1, min: 1 }),
    impactedByWeight: Field.flag(SKILL_IMPACTED_BY_WEIGHT),
    usableWithoutTraining: Field.flag(SKILL_USABLE_WITHOUT_TRAINING),
  },
  { normalize: (fields) => ({ ...fields, checkPenaltyMultiplier: fields.impactedByWeight ? fields.checkPenaltyMultiplier : 1 }) },
);
```

```ts
// engine/rulesets/dnd3.5/entities/skills/SkillEntity.ts
export default class SkillEntity extends RulesetEntity<"skills", SkillBody, SkillColumns, typeof SKILL_FIELDS.fields> {
  private readonly skillFocus = new SkillFocusFeats(this.view);

  protected readonly fields = SKILL_FIELDS;

  protected override writesOf(body: SkillBody, given: Partial<SkillFieldValues>, skill?: Skill): EntityWrites {
    const fields = this.formFields(given, skill);
    const renamed = skill?.name !== body.name;
    return {
      made: renamed ? this.skillFocus.make(body.name) : [],
      properties: fields && this.fields.write(fields),
      removed: skill && renamed ? this.skillFocus.remove(skill.name) : [],
    };
  }
  …
}
```

A small rule several of a ruleset's modules share is the ruleset's own (`rules/AbilityRules.ts`: a score's modifier; `rules/LevelRules.ts`: `isAbilityIncreaseLevel`, `countGeneralFeats`; `rules/SkillRules.ts`: a level's skill points, a rank's cost, a skill's most ranks, how points spread over levels, a skill's subtypes; `rules/ItemPlacement.ts` and `rules/InventorySlots.ts`: where an item goes, an entry's slot; `rules/SpellLists.ts`: the view's spell lists; `rules/BondedRaceData.ts`: a bonded creature's stat block), which they import: it's no part of the contract. The numbers and tables a rule reads are the books' facts, its vocabulary's (`vocabulary/dnd3.5/`: the level intervals in `classes.ts`, the skill costs and caps in `skills.ts`, `combat.ts`, `sizes.ts`, `carrying.ts`, the bonded creatures' stat blocks in `bondedCreatures.ts`): a rule is a function over them, and a constant the engine keeps is its own machinery (a path's spec, a codec, a message, a placeholder such as `LevelRules.UNROLLED_LEVEL_HP`).

A bound the client and the API check too is a constant of the ruleset's vocabulary, which every side reads instead of writing the number: `MAX_SPELL_LEVEL` (`vocabulary/dnd3.5/spells.ts`) for the aptitudes' spell levels, the spellcasting and the spell forms, `MAX_CLASS_LEVEL` (`vocabulary/dnd3.5/classes.ts`) for the class-level forms and the bonus caster levels, `MAX_ABILITY_SCORE` (`vocabulary/dnd3.5/abilities.ts`) for a new character's ability scores and the sheet's, and `MAX_ITEM_VARIANTS` (`vocabulary/dnd3.5/itemTemplates.ts`) for the variants form. The module's operations check them (`RULESET_LIMITS`, `limits.ts`: a new class level's number and its saves' bases, a spell's levels, a character's ability scores, the variants an item's form makes, and a level-up's planned levels, each within its class's last level and all within a character's, the levels it has counted, `MAX_CHARACTER_LEVEL`, `vocabulary/dnd3.5/classes.ts`: the class picker's options say how many levels the character has left, and Add Level's class plan adds none past them).

More complex operations (bound to the detailed character, returning rich data) belong on the ruleset's level-up classes (on core's `LevelUpBase`, which checks a level's selections, `SelectionChecks`; and the pickers on core's `Picker`, `CharacterPicker` and `LevelPicker`, building the character from the rows a level-up adds, `CharacterProjection`) or on its character (a concern of `DetailedCharacter`), which an operation builds from the input it's given (`CharacterBuilder.build`).

### The level flows ask the module

The level flows (`server/services/characters/levels/`: the preview, a save, an edit, a removal, the wizard's steps and pickers, a level's selections, the bonded creatures' writes) are the server's: they read the character's rows (`readCharacterInput`, `readBondedInputs`; a save's in its transaction, the character locked), ask the engine, and write what it plans. What a level-up is, its rules, is the module's `levelUp` (the 3.5 module's `Dnd35LevelUp`, which opens a class per operation: the planned levels' class levels and projections, the preview and a save's distribution, the steps' slots, the pickers' filters and options, a level's selections, the bonded creatures' plans), which build the characters a step needs from the rows they're given. What a save, an edit and a removal check and write is core's, the same for every ruleset (`LevelsPlanning`, `LevelRemoval`): a save's and an edit's checks run in one order over what the ruleset computes (see [how to add a new ruleset](#how-to-add-a-new-ruleset)). A second ruleset extends `LevelUpPart` with a level-up of its own. Its wizard's steps are its own: the module lists a level's (`describeSteps`, each its name and label: `GET /characters/:characterId/level-steps`) and answers one by its name (`describeStep`: `GET /characters/:characterId/level-steps/:step`, a step it doesn't have refused as not found), each taking the level it's for (`LevelQuery`: its class's level, the levels planned before it, or the level an edit replaces; a picker's, `PickQuery`, adds its pool) and what the wizard picked at it so far (`picks`), which it answers what they come to, as the preview does of the picks over the planned levels: 3.5's skills step and preview spend the skill points as the save spreads them (`SpendsSkillPoints`, over `Dnd35PicksDistribution`), each skill with the points it keeps, the ranks they buy, its ranks at each count of points, its rank step and the most it takes alone, so the client looks them up. The client's wizards ask them on the generic wizard's hooks, which keep the picks the answers say fit and save them, and the Add Level and Edit Level dialogs, their base rules' own (`getLevelWizards`, see [docs/frontend.md](./frontend.md)), read their ruleset's answers into it and render each step by its name with their step components. A body's fields are 3.5's: a ruleset with other fields needs the routes to take the module's (planned).

Entity CRUD services (`FeatsService`, `PowersService`, `SkillsService`, `ClassLevelsService`, `AptitudesService`, …) operate on rows of the generic schema, and ask the module's `entities` what's ruleset-specific about them, one operation per action: an entity's fields, what saving it writes, what its rules refuse. Their customizations' services (`ModifiersService`, `PropertiesService`, `RequirementsService`, `PropertyTypesService`) ask the engine's customizations and property types the same way.

### Routes

The level routes (`server/routers/api/characters/levels/index.ts`) take the generic schema's level-up: class levels, skill points, and feats and powers by their pool; the module bounds them (a class's last level, a character's: `PlannedLevelsState`), and reads what its own pickers take (a spell level, a specialist's excluded schools).

A body's fields that a ruleset's rules take, and the bounds they set on its columns, are the engine's. A route carries an entity's fields as one object, `fields` (`buildEntityFieldsSchema`, `server/routers/api/schemaBuilders.ts`: any object, typed as the engine's plan takes it, so the client's forms keep their types), and a column a rule bounds as its type alone (a class's `hitDie`, a class level's number, a pool's spell level, an ability's score). The operation reads the fields by the kind's codec (`RulesetEntity.readFields`: every field for a create, those it changes for an edit, a spell's always optional) and checks the bounds by the module's limits (`checkForm`, `planVariants`, `planAbilities`), refusing with a `RulesError` "invalid" (`RulesError.parse`), which answers 400 with an issue per field as a route's validation does (`fields.bab`, `saves.0.base`, `aptitudes.0.level`). A kind whose page edits its properties (a class, a race, a feat, an item) takes no `fields`. An edit gives the fields it changes: the entity's base merges them over those it keeps (`formFields`), for a skill, a spell and a class level alike. A character's ability edit is the module's too (`characters().planAbilities`: each ability the ruleset's, each score in the bounds its `describeCreation` gives), which the service writes. A character's alignment and gender are the database's enums, whose options `shared/enums.ts` writes out (`ALIGNMENT_OPTIONS`, `GENDER_OPTIONS`). The server imports nothing of `vocabulary/dnd3.5/`.

### What's intentionally generic schema, not ruleset-specific

The DB schema includes some concepts that read as D&D-family but are actually **generic primitives**:

- **Aptitudes** (`aptitudesInRules`, `feats_aptitudes`, `powers_aptitudes`) — "named pools of grantable abilities with slot counts." Works for 5e (ASI/feat pools, spells known), PF2e (feat types, spells), etc. 3.5 just happens to use this for "Wizard Spells", "Fighter Bonus Feat", etc.
- **Saves** (`savesInRules`, `klass_level_saves`) — "defense categories with per-class-level progression." Every level-based RPG with a resistance mechanic fits this.
- **Requirements / Modifiers / Properties** — fully generic customization system. Target paths are data, not code. See `docs/customization.md` and `docs/target-paths.md`.

The 3.5-ness in these tables lives in the **seeded values**, not the schema shape. Don't split them.

### How to add a new ruleset

The contract is the code: `engine/core/module/parts/` holds a folder per part, its abstract class beside what its operations take and answer, and the compiler lists what a ruleset's part lacks. A ruleset is a module under `engine/rulesets/<ruleset>/`, which the engine's handles dispatch to by its base rules (`Modules.of`).

1. **Its base rules**: a value of the `base_rules` enum (`drizzle/schema.ts`, a migration, and `shared/enums.ts`), then its module in `MODULES` (`engine/api/Modules.ts`): until it has its row, `Modules.of` reports it, one error, and the registered modules keep their types. Its vocabulary names it by a constant of its own value (3.5's `DND35_BASE_RULES`, `vocabulary/dnd3.5/baseRules.ts`, `satisfies BaseRules`), which its seeders and its codegen ask the engine by, so `Engine.forRules` answers with its module's types (`ModuleOf`).
2. **Its module**: a factory returning a `RulesetModule<D, E, F>` (3.5's `Dnd35Module.create`): `D`, what it describes in its own shape (3.5's `descriptions.ts`); `E`, its entity kinds by table; `F`, the fields its content seeds, by entity. Each part extends its abstract class: `CharactersPart<D>`, `LevelUpPart<D>`, `EntitiesPart<E>`, `ContentPart<F>`, `RulesetPart`. A part's abstract members are what the ruleset answers its own way; what reads the schema alone is the part's (`planLanguages`, `describeCard`, `describeInventory`), and so is what guards a character's privacy and integrity (`describe`, `describeForMember`, `planInventoryEntry`, `planAbilities`, `planCreate`: [what the characters part guarantees](#the-modules-parts)), over a hook where a ruleset differs (`describeInventory` over `describeInventoryEntry`, `describe` over `describeFull`, `planInventoryEntry` over `planPlacement`, `checkPublishable` over `findMissingContent`, `toEntityProperties` over `codecs`). What the generic client runs is the part's shape, its data the ruleset's: a new character's ability scores are set by the methods `describeCreation` answers, each a kind the create dialog runs (`roll` by its dice, `array` by its scores, `pointBuy` by its costs and budget), with the scores' bounds and each score's modifier (3.5's in `vocabulary/dnd3.5/creation.ts`).
3. **Its character** in `engine/rulesets/<ruleset>/model/`, which its parts build, on core's character (`engine/core/character/`): its character extends `CharacterBase`, handing it its target paths, which the base's evaluators walk, and implements its build's step before the modifiers (`prepareSheet`), its own issues (`findRulesetIssues`), and the rows and the names of its entities (`listEntityRows`, `nameEntity`), which the base checks against its source chain (`findSourceIssues`) and names its issues by (`resolveEntityName`, which names the character, its items and a modifier's source itself): 3.5's `DetailedCharacter`. Its builder extends `CharacterBuilder`, a character for each row kind (3.5's `Dnd35CharacterBuilder`). Its data loader, which its character hands the build (`createDataLoader`), extends `CharacterDataLoader<D>` (3.5's `DetailedCharacterDataLoader`): the base loads what every ruleset's character reads (`LoadedCharacter`: its campaign and player, its inventory's items as the view composes them, its modifiers in the order they apply with the requirement groups gating them, the rulesets its rows may come from), and the ruleset says what its character has of its entities (`partsOf`), which of them its modifiers come from and in what order, its equipped items among them (`sourcesOf`), and its data (`loadOwn`, `D`). Its components (`components`, built by a factory, 3.5's `CharacterComponents`) each extend `CharacterComponent<D>`, `D` its loaded data: a component is built with the sibling components it reads and nothing else, and implements `initialize(data, view)`, which the build calls in the order the factory lists them, each after what it reads, then `finalize` where it computes from what the modifiers left (3.5's spellcasting). A component reads its siblings, counting what it computes from them when read, and writes none of them (3.5's two exceptions: [customization.md](./customization.md#how-a-sheet-is-built)); its getters are what its path category's `component` names (`ComponentSpec`).
4. **Its level-up and pickers**, on core's (`engine/core/levelUp/`, `engine/core/pickers/`): its `LevelUpPart` gives the rules core's flows read (`LevelUpRules`: `buildCharacter`; `getAbilityIncreaseTotal`, what a level's ability increases add up to, and `hitPointsOf`, a level's hit points by its class's hit die, which `SelectionChecks` holds a level's to; `unrolledLevelHp`, the hit points a level a flow projects counts before they're rolled; `planBondedCreatures`), with which they remove a level and plan the bonded creatures as they are. A save and an edit are core's too (`LevelsPlanning`, which `planLevels` and `planEdit` open), checked in the order every ruleset's are: a level-up's planned levels read (`getPlannedKlassLevels`), its selections the ruleset's, its picks spread over its levels (`distributePicks`); then each level not saved already, its ability increases adding up, its hit points, selections and pools checked and no non-stackable feat or power picked twice at a level (`SelectionChecks`); then no pick the character holds already, forced or not: a non-stackable feat it has, picked or granted at another of its levels, saved or planned, a later one too, or made possessed by a modifier, then a power it knows in its pool already, then either given by the level's (or the level-up's) other picks, which stay, an edited level's own saved picks staying (`SelectionChecks.checkPicksNotHeld`, over the feats and the powers in each pool the ruleset's character holds, `getHeldFeats` and `getHeldPowers`, each marked `given` when its modifiers give it: `CheckedCharacter`; the preview's and the steps' `withoutHeldPicks` drop them alike); then no pool overfilled, forced or not (`findOverfullPools`, refused by `PicksDistribution.refuseOverfull`); then the character with them valid unless forced, an edit's in the issues the level answers for (`findEditedLevelIssues`, given the character before the level and with it alone). The ruleset computes what those hooks answer, and never sequences the checks. Its own flows extend `LevelUpBase` (3.5's `LevelUpState`), a saved level's selections `LevelSelections` (`featDetailsOf`), and a save's picks spread over its planned levels `PicksDistribution` (`levelCount`, `distributeSkills`: 3.5's `Dnd35PicksDistribution`), which places the feats and powers in each level's pool slots. A picker extends `Picker` (`filters`, `meets`, `describeFailed`, and `offer`, `requirementsOf`, `detailsOf` or `order` where it differs), `CharacterPicker` when it checks a character (`filters`, `project`; it takes the ruleset's character builder), or `LevelPicker` when it picks at a level (a feat or a power: the character projected to the level with the feats and powers picked so far, whose requirements an option is checked against; and what it leaves out read off the character with every level it has and the wizard plans, a later one too, the level in its place, and the feats and powers picked so far, `holder`, as the save checks a level against every other and the level's picks against each other; it takes the builder and the ruleset's unrolled hit points, 3.5's `Dnd35LevelPicker`).
5. **Its target paths and property types**: a `CategoryPaths` subclass over one `PathCategory` per domain, and a `PropertyTypesProvider` (see [target-paths.md](./target-paths.md)).
6. **Its entities**: each kind extends `RulesetEntity` (or `CustomizationPageEntity`); `EntityKindsContract` says which tables it answers of and what more a class, an item, a feat list and a power list answer.
7. **Its content and its seeding**: its row in the content's registry (`RULESET_CONTENT` in `database/packages/registry.ts`, a `Record<BaseRules, RulesetContent>`, so the compiler asks for it): its core package, its extensions, its seeder and its test characters, which the runner and the scripts (the dev and test seeds among them, `scripts/db/seeds/`) read it through, and nothing else of theirs does (`arkyvree/ruleset-folders`). Its content is `content/<ruleset>/` (what it's written with, `builders/`; its hand-written rows, `data/`; its generated books, `generated/`; its packages as data, `packages/`, a `CorePackageDefinition` and its `ExtensionPackageDefinition`s; its dev and test characters, `testData/`, each a `CharacterSeed`). Its seeder (`database/seeders/<ruleset>/`) is a concrete `ContentSeeder<Core, Book>` of that content, which implements the contract's abstract members: `seedCore` (the core rules' content its core package gives, in the core ruleset the runner creates), `seedExtension` (an extension's book, in the extension of it the runner creates, beside the core rules' content) and `copyPowerLinks` (the links a power's copy keeps). Its steps build on the ones every ruleset's content seeds alike, which `ContentSeeder` has (`database/seeders/core/concerns/`: aptitudes, abilities, saves, languages, feats, races, items, an extension's copies), from the core's seed types (`content/core/builders/`), and add its own (3.5's classes, skills, spells). Its codegen is `codegen/<ruleset>/`. Each is on what every ruleset shares (`content/core/`, `codegen/core/`, `database/seeders/core/`); its folders are its own (`arkyvree/ruleset-folders`), each holds its role (`arkyvree/layers`), and its codegen and seeder reach its content only by the edges `arkyvree/root-folders` declares. See [packages.md](./packages.md).
8. **Its vocabulary**: `vocabulary/<ruleset>/`, beside `engine/`, `content/` and `shared/`: its lists, labels, tables and bounds, the books' facts (3.5's spell levels and their names, its hit dice, its property names and their values, its size, carrying, combat and skill tables, its bonded creatures' stat blocks), data only (`arkyvree/vocabulary-data`: no function or class; a rule is its module's), which its module, its content, its codegen, its seeder and the client import directly and the server never does. Its row in the client's registries, which a generic page reads it through: `getVocabulary` (`client/src/pages/rulesets/vocabularyFactory.ts`, a `Record<BaseRules, RulesetVocabulary>`, so the compiler asks for it) beside the other factories by base rules ([frontend.md](./frontend.md)); a generic client module never reads its folder (`arkyvree/ruleset-folders`).
9. **Its client part**: its folders in the client (`client/src/**/<ruleset>/`), each reached through its row in the client's registries, a `Record<BaseRules, …>` the compiler asks for (`CLIENT_REGISTRIES` in `lint/architecture.mjs` lists them). Each registry declares its contract, an interface naming what a ruleset gives it with the props its parts take, which the ruleset's components import from it, so the compiler checks the row against the registry's words:
   - its sheet's sections under the identity, in its order, the generic ones among them (`getSections`: `SheetSections`, 3.5's in `components/characters/sections/dnd3.5/`, with its equipment's load);
   - its Add Level and Edit Level dialogs (`getLevelWizards`): each its steps' components by the name it lists them by, which the generic `LevelWizardDialog` shows, and its hook on the generic wizard's (`pages/characters/details/components/levelUp/`, which hold the plan or the edited level, the picks fitted to the answers, the save and the way through the steps), reading its preview's and its steps' answers into the factory's `PreviewAnswers` and `EditAnswers`, and giving its steps what they read of them; its picks take the level routes' shape, every ruleset's (`LevelUpFormData`);
   - its class page: a class's empty form and an existing class's (`toClassForm`), a new level's fields under its number, its next level and the saves it sends (`getClassForms`), and its details card, its Levels tab's columns of a level's own fields, and its own tabs after the levels and the skills (`getClassSections`);
   - its ruleset page's sections and license notice (`getSections`), its entity pages (`getEntityPages`), its customization editors (`renderEditor`), its races' and classes' kinds (`useEntityFilters`), its words (`entityTypeLabel`), its abilities' order (`sortAbilities`) and its vocabulary (`getVocabulary`).
10. **Its rulings**: `docs/<ruleset>/rules-decisions.md`, how it reads its rules where the source is ambiguous or where it deliberately differs, each naming the code that holds it (3.5's: [docs/dnd3.5/rules-decisions.md](./dnd3.5/rules-decisions.md)).

   A generic client page holds no rule of a ruleset: what one has (a field, a column, a tab, a section) is a registry's slot, and a page whose parts are its base rules' waits for its ruleset to load, never assuming one. No generic client module imports its folders (`arkyvree/ruleset-folders`).

### How to extend `engine/` without leaking a ruleset

The engine is the machinery every ruleset runs on: the evaluators, the path walk and the path language, the view, copy-on-write's state, the module's contract and the operations that dispatch to it. Its core imports nothing from a ruleset, not even a type (`arkyvree/layers`). If you feel you have to, the file probably belongs to the ruleset.

If the services need a per-ruleset value or answer:
- Add an operation: an abstract method of its part (`engine/core/module/parts/<part>/`, its request and plan types beside it), which every ruleset's part then implements (`Dnd35Entities`, `Dnd35LevelUp`, …), and the method of the handle it's about that dispatches to it (`LevelUpEngine`, `ClassEngine`, …: `engine/api/`; an entity kind's is a method of its entity class, on `RulesetEntity`, which `entities(type)` hands out), or a handle of its own, which `RulesetEngine` hands out under a noun (`class(klassId)`). `engine/index.ts` exports a handle's type when the server derives a body's or a plan's from it, as every registered ruleset's operation takes it (`Accepted<EntityKinds["skills"]["planCreate"]>[0]`: one module's body, every module's together once there are several).
- A value the client and the API need too lives in the ruleset's vocabulary, `vocabulary/<ruleset>/` (`MAX_SPELL_LEVEL`), as data (`arkyvree/vocabulary-data`), never in a file another ruleset would read; the module's operations check it (`RULESET_LIMITS`), and the server reads none of it.

If you need a per-ruleset behavior too complex for one class (takes the detailed character, returns rich data, reads several components), make it a method of the ruleset's level-up base (`LevelUpState`, on core's `LevelUpBase`) or a concern of its character, which its operations call. A part is typed by the contract (its abstract class), so nothing casts.

### Grey areas and audit findings

An audit on 2026-04-16 identified real leaks and some false alarms. It predates the engine's restructure, which moved every component under `dnd3.5/`: the components it calls generic are 3.5's, and generic in that a second ruleset could take them as they are.

**Fixed:**
- `MAX_SPELL_LEVEL = 9` was hardcoded in the aptitudes component (`dnd3.5/model/aptitudes/AptitudesComponent.ts`) — now one constant in `vocabulary/dnd3.5/spells.ts`, which the spellcasting, the client and the module's operations (through `RULESET_LIMITS`) read too.
- `buildCharacterResponse.ts` lived in `routers/api/` with a cast to the 3.5 character — moved to the 3.5 module, now `CharacterResponse` (`engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts`).
- `server/routers/api/characters/levels/` had 3.5-shaped query params (`powerLevel`): moved under `dnd3.5/`, then back once the level flows asked the module (`levelUp`), which reads them.

**Not leaks (confirmed generic):**
- `SkillWithRank.rank: number`, `CustomizedPower.powerLevel: number | null`, `CustomizedPower.saveName: string | null` — neutral primitive fields with 3.5-flavored seeded content but no schema constraint forcing 3.5 semantics.
- Aptitudes, saves, requirements/modifiers/properties tables — generic primitives; see "What's intentionally generic" above.
- `SavesComponent` (`dnd3.5/model/saves/`) — iterates generic save data, no 3.5 hardcoding.
- Alignment path in `IdentityComponent` — "alignment" is a fantasy-RPG convention, string field value is content-level.

## Key Files

| File | Purpose |
|---|---|
| `server/cow/views/` | `withRulesetScope` / `withRulesetScopes` (consumer entry points), `RulesetViews` (the cache), and what it reads with: a ruleset's own rows (`RawDataReader`) and the rows its `CowData` is built from (`CowDataReader`): copy-on-write's read side. `CowData` itself (`engine/core/cow/CowData.ts`, built by the engine's `Engine.copyOnWrite().buildData`) is what a scope resolves ids through. |
| `server/cow/writes/` | `EntityEdit` (the row an entity's change writes), `CustomizationEdit` (a customization's), `EntityNames` (the names a create takes), `EntityCopy` (a copy of an inherited entity), `EntityRevert` (a copy reverted to its source, what names it repointed), `CustomizationCopies` and `EntityRepositories`: copy-on-write's write side. `EntityCopy` merges sibling data into newly COW'd local copies by the engine's rules (`Engine.copyOnWrite().mergeCustomizations`, `mergeAptitudeLinks`). Sibling read-time merging lives in the compose step (`engine/core/view/RulesetComposition.ts`). |
| `server/services/rulesets/RulesetsService.ts` | `forkRuleset`, `publishRuleset`, `archiveRuleset` |
| `server/services/rulesets/extensions/RulesetExtensionsService.ts` | `subscribeExtension`, `unsubscribeExtension`, `getExtensions` |
| `server/services/rulesets/changes/RulesetChangesService.ts` | `getChanges`, `revertOverride` |
| `server/services/policies/RulesetsPolicy.ts` | Authorization checks for all ruleset operations: the ruleset's own, plus the concerns in `policies/concerns/` (entities, contributors, extensions, creating campaigns and characters), over the roles in `RulesetRoles.ts` |
| `server/services/rulesets/*/` | Entity services (feats, powers, classes, etc.) using the COW pattern |
| `server/services/rulesets/EntityWriter.ts` | `EntityWriter`: a kind's create, update and delete, in one order around the plan its rules give |
| `server/services/rulesets/entityWrites.ts` | `writeEntityWrites`: what the engine plans a form writes beside an entity's row (`EntityWrites`), written in the action's transaction |
| `server/services/rulesets/listLinks.ts` | `createListLinks`, `setListLinks`: an entity's list links (a feat's pools, a power's lists), as a plan gives them (`ListLink`) |
| `server/services/characters/characterInputs.ts` | `readCharacterInput`, `readBondedInputs`: a character's rows, read in its ruleset's scope, which the engine builds it from |
| `server/repositories/*Repository.ts` | COW-aware SQL queries with snapshot exclusion |
| `engine/index.ts` | The engine's one entry: `Engine`, its handles' types (`ClassEngine`, `LevelUpEngine`), each entity kind's rules by table (`EntityKinds`, its operations' arguments as every registered ruleset's take them: `Accepted`), its operations' types, and `RulesError` |
| `engine/api/` | `Engine` and the handles it hands out, a class each (`RulesetEngine`, which `Engine.for(scope)` binds to a view, and its handles by what the rules are about: `CharacterEngine`, `LevelUpEngine`, `ClassEngine`…, and an entity kind's own class, which `entities(type)` hands out; `ContentEngine`, `Engine.forRules`; `CopyOnWriteEngine`, `Engine.copyOnWrite`), each operation a method dispatched to the ruleset's module by its base rules (`Modules.ts`: `Modules.of`), or to the core's classes with the module's factories (`ModifiersEngine`, `PropertiesEngine`, `RequirementsEngine`, `PropertyTypesEngine`, `TargetPathsEngine`) |
| `engine/core/module/` | The module's contract (`contract.ts`: `RulesetModule`), the rows a character is built from (`CharacterInputs.ts`: `CharacterInput`, `CharacterRows`, resolved as the view reads them) and those a level-up adds before it's saved (`CharacterProjection.ts`), the parts, a folder each (`parts/characters/`, `parts/levelUp/`, `parts/entities/`, `parts/content/`, `parts/ruleset/`: its abstract class, and its types by role: what an operation takes, `requests.ts`; what a plan writes, `plans.ts`: `EntityWrites`, `LevelsPlan`…; what a description shares, `descriptions.ts`), and a picker's shape (`pickers.ts`) |
| `engine/rulesets/dnd3.5/model/` | The 3.5 character: its state (`CharacterState`, on core's `CharacterBase`), its concerns (`Builds`, the build's 3.5 steps; `Diagnoses`; `PossessesVirtually`; core's `Validates`), its components (`CharacterComponents`, each on core's `CharacterComponent`, in the order the build sets them up), `DetailedCharacter`, which wires them, `Dnd35CharacterBuilder`, which builds one from its input, and a folder per concept a character has (its component and its paths' category) |
| `engine/core/` | The machinery: `ModifierEvaluator`, `RequirementEvaluator`, the path walk and the path language and their types (`paths/`), the ruleset view and `RulesetView` (`view/`), copy-on-write's state (`cow/`), an entity's customizations and the property types (`customizations/`), and the bases a ruleset extends: the module's parts (`module/parts/`), a character (`character/`), the level flows (`levelUp/`), the pickers (`pickers/`) and the entity kinds (`entities/`) |
| `engine/rulesets/dnd3.5/` | 3.5 implementation: what a character has (`model/`), its module's parts in their folders (`characters/`, `entities/`, `levelUp/`, `content/`, each opening with its facade), the pickers (`pickers/`) and the rules several of them read (`rules/`), over the books' numbers in `vocabulary/dnd3.5/` |
| `engine/rulesets/dnd3.5/model/concerns/Builds.ts` | The build's 3.5 steps, which core's build runs (`CharacterBase.build`: the loader, on core's `CharacterDataLoader`, `loading/`, gives each entity the modifiers and requirements the compose step merged into `rulesetData`; then each component's `initialize`, the steps around the requirements, the modifier rounds, each component's `finalize`, and the late modifiers) |
| `database/seeders/core/concerns/CopiesOnWrite.ts`, `database/seeders/dnd3.5/concerns/CopiesIntoExtensions.ts` | Seed-time COW: copies the core feats and spells an extension changes (the core's), and changes the copies as its book says (3.5's) |
| `tests/services/rulesets/Extensions.test.ts` | Extensions, COW, fork inheritance, merge, name conflicts, publish validation, sibling merge (feats + powers: aptitudes, requirements, modifiers across all endpoints) |
| `tests/services/rulesets/Sibling*.test.ts`, `tests/services/rulesets/customization/Sibling*.test.ts`, `tests/cache/aptitudeDedup.test.ts` | Siblings: what the composed view shows, edits and customization writes on a sibling-merged entity, aptitude deduplication |
