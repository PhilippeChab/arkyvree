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
- **Validation (kind = 'ruleset')**: its view (its own entities and those inherited from its source chain) must give what its rules make a character of, which the engine checks (`Engine.for(scope).checkPublishable`; 3.5's `RulesetPublishing.checkPublishable`: a player race, a player class, a skill and a feat)
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
2. **In-use check** (`isExtensionInUseByHost`) — blocks with `ConflictError` if any character on the host has picked an extension-owned entity, either directly or via a host-side COW shadow of one. The shadow case matters because step 5 below hard-deletes those shadows; without this guard the character pick would silently dangle. (Scoped to the host only; fork-of-fork is blocked at policy time so descendant forks aren't a concern. If that ever changes, the character repos' `exists` extension branch (`{ hostRulesetId, extensionRulesetId, shadow…Ids }`) would need to widen the join.)
3. Finds snapshots whose `sourceEntityId` belongs to the extension (COW copies of extension entities)
4. **Repoints what the host keeps that names the extension's lists** (`repointDepartingReferences`, `extensions/departingReferences.ts`): its feats' and powers' links, and its classes' level grants, to the extension's lists (and to its copies of them) move to the list of the same name the host keeps, as its view will show it (`CowDataBuilder.build` without the extension); a list's name is its identity, as the namesakes pair. A link to a list no other book of the host has, or a host row naming another of the extension's entities (an item's template, a class's or a race's parent, a spell's save, a save's or a skill's ability, a class's skill or its levels' saves, granted feats and powers: `RulesetEntities.findReferences`), refuses the unsubscribe with a `ConflictError` naming them, before anything changes
5. Deletes those COW copies and their snapshots
6. Removes `extensionId` from the array
7. Soft-deletes the tracking row

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

- **Scoping is current + descendants.** The Character* repos' in-use
  `exists` takes `{ <entity>Id, rulesetId }` and internally joins on `rulesetsInRules`
  with `id = $rulesetId OR $rulesetId = ANY(ancestor_ruleset_ids)` — single
  SQL roundtrip. With forks of forks blocked, descendants of a base ruleset
  are at most one level deep, but the query shape stays the same so the
  guard is robust if depth ever changes. A parent author deleting a feat
  that a downstream fork's character picked is blocked; a fork deleting an
  inherited entity that only the parent's character uses is not (parent's
  characters are unrelated to the fork).

- **Picks stored under a source id count against its local copy.** A
  character that picked an inherited entity keeps the source id after the fork
  copies it. Deleting that copy leaves a tombstone hiding the source, which
  would orphan the pick. Every in-use `exists` matches the entity id with
  `idMatches`, so inside the delete's `withRulesetScope` it also matches the
  pre-copy ids that resolve to the copy. `revertOverride` runs outside a scope
  and matches the copy's own id only: restoring the source keeps pre-copy
  picks valid.

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
ids, rulesetId)` and is reused by every entity-delete service and
`revertOverride`. One helper, one scoping rule, one source of truth.

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

A kind's creates, updates and deletes go through its writer, `EntitySaves` (`server/services/rulesets/EntitySaves.ts`), a field of its service: the service hands it the plan its rules give (`Engine.for(scope).entities(type)`), and it takes every kind's steps around it, in one order:

```ts
private readonly saves = new EntitySaves("saves", Saves, savesInRules, "Save");

return await this.saves.create(session, rulesetId, body.name, (scope) =>
  Engine.for(scope).entities("saves").planCreate(body),
);
return await this.saves.update(session, rulesetId, body, (scope) =>
  Engine.for(scope).entities("saves").planEdit(saveId, body),
);
return await this.saves.delete(session, rulesetId, saveId, (scope) =>
  Engine.for(scope).entities("saves").planDelete(saveId),
);
```

- **A create** checks access, then the name against the composed view (`EntityNames.assertNameAvailable`), plans, writes the row, points a tombstone the name hides at it (`repointTombstone`), and writes its list links (`listLinks.ts`), what its plan writes beside it (`writeEntityWrites`) and the customizations it copies (an item's duplicate's).
- **An update** writes the row the view's entity resolves to: the fork's own, or the copy of an inherited one (`EntityEdit.cowToEdit`), refused when stale (a copy's `updatedAt` isn't the client's). It replaces its list links when the plan gives them.
- **A delete** is refused while the entity is in use: picked by a character, unless the kind says otherwise (a save granted by a class level, `inUse`). It deletes the row the entity resolves to (`EntityEdit.cowToDelete`), the fork's own locked first, with what its plan removes.

Each records its activity (`createSave`, `updateSave`, `deleteSave`: the writer's activity name), and drops the ruleset's views. A kind adds what's its own: what its plan reads (a feat's tombstone ancestor, whether it was generated), what refuses its delete (`refuse`: an item template's copies), what its activity carries (`activityData`: a power's base rules) and what it compares to the entity it was (an item's template, from the row).

A save answers its row with the fields the entity keeps once saved (its plan's `fields`: a skill's, a race's, none of an ability's), as a page describes its rows, and a class's levels, class skills and table keep their handle (`class(klassId).planLevelDelete`, `describeLevel`).

Every kind's rules are a class on one base (`engine/core/entities/RulesetEntity.ts`), whose steps every kind takes, a kind adding its rules to the ones they name:
- **Described** (`describe(id)`): the entity found (`find`, refused as not found), its row as the view resolves it, with the fields its properties hold (the kind's `fields`, a codec: `FieldCodec.NONE` for a kind without). A kind whose page shows its customizations adds them (`CustomizationPageEntity`: a race, a feat, a power, an item, a class level); an item's are merged with its template's (`propertiesOf`, `requirementsOf`).
- **Listed** (`openList(where)`): what the server reads a page with (`filters`) and its rows described alike. A feat's and a power's list narrows them to a list's, and gives its rows their lists as the ruleset composes them (`ListedEntity`, which also refuses a feat in a spell list and a spell in a feat pool); an item's gives its rows their template's name.
- **Saved** (`planCreate(body)`, `planEdit(id, body)`): the form checked (`checkSave`), its row's columns (`columnsOf`), its list links (`linksOf`), what it writes beside them (`writesOf`: a skill's fields and its Skill Focus, a power's fields and its school's Spell Focus, a class level's base attack and skill points), and the fields it keeps once saved (`fields`).
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
├── index.ts                               ← the entry: Engine, its handles' and its operations' types, a body's ruleset
│                                          fields and bounds
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
│   │   ├── contract.ts                    (RulesetModule)
│   │   ├── CharacterInputs.ts             (CharacterInput, CharacterRows: a character's rows as the server reads
│   │   │                                  them, and their references resolved as the view reads them)
│   │   ├── CharacterProjection.ts         (the rows a level-up adds before it's saved: levels added, replaced or
│   │   │                                  left out, and the picks at them)
│   │   └── writes.ts                      (EntityWrites: what saving an entity writes beside its row, without ids)
│   ├── view/                              (RulesetView, RulesetData, with a list's members, RulesetComposition, the
│   │                                      sibling merge: SiblingMerge, SiblingRows)
│   ├── cow/                               (CowData, CowDataBuilder; CowSources: the source chain and the rows CowData
│   │                                      is read from; ExtensionNames: the extensions' name check)
│   ├── customizations/                    (ModifierEdits, PropertyEdits, RequirementEdits, on CustomizationEdits:
│   │                                      an entity's customizations, bound to it, read from its bucket in the
│   │                                      view, described, and what their saves store, checked; TargetLabels:
│   │                                      their labels, one way; CustomizedEntity: the entity they're on, as the
│   │                                      view has it; PropertyTypeCatalog: the property types and values, the
│   │                                      rules' then the ruleset's own)
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
    ├── index.ts                           (what the entry takes of it: Dnd35Module, ENTITY_FIELDS, RULESET_LIMITS)
    ├── Dnd35Module.ts                     (Dnd35Module.create(): the 3.5 module, a Dnd35RulesetModule, its parts by
    │                                      their own types)
    ├── Dnd35TargetPaths.ts                (the categories' order; each labels the ruleset's names: labelNames)
    ├── Dnd35PropertyTypes.ts              (the property types and values it serves: shared/dnd3.5/properties/)
    ├── model/                             ← what a character has, a folder per concept: its component and its paths'
    │   │                                  category (abilities/ aptitudes/ classes/ feats/ identity/ powers/ saves/
    │   │                                  skills/, AbilitiesComponent, AbilitiesPaths…), and the shared base
    │   ├── DetailedCharacter.ts           (which wires CharacterState and its concerns/: Builds, Validates and its
    │   │                                  issues, PossessesVirtually; CharacterComponents; CharacterBuilder: a
    │   │                                  character of its row's kind, built from its input)
    │   ├── loading/                       (DetailedCharacterDataLoader and LoadedCharacterData, and its steps:
    │   │                                  CustomizedEntities, Picks, Possessions, RulesetReadings)
    │   ├── combat/                        (CombatComponent on CombatState, which includes concerns/: ArmorClass,
    │   │                                  HitPoints, Attacks, InitiativeAndSpeed; ArmorsComponent, ShieldsComponent,
    │   │                                  WeaponsComponent, EncumbranceComponent; the combat, items.* and weapon.*
    │   │                                  path categories: CombatPaths, ItemsPaths, WeaponPaths)
    │   ├── spellcasting/                  (SpellcastingComponent on SpellcastingState, which includes concerns/:
    │   │                                  BonusCasterLevels, KnownPowers; SpellcastingPaths; SpellLists)
    │   ├── inventory/                     (InventoryComponent, InventorySlots)
    │   └── bonded/                        (the bonded creatures' characters, BondedComponent, BondedPaths,
    │                                      BondedRaceData: their stat blocks; BondedScaling)
    ├── entities/                          ← the module's `entities`: an entity kind's rules, a folder per kind
    │   ├── Dnd35Entities.ts               (each kind's class, by its table: `of`)
    │   ├── entityFields.ts                (ENTITY_FIELDS, RULESET_LIMITS: a body's fields the rules take, and their
    │   │                                  bounds)
    │   ├── abilities/ aptitudes/ classes/ feats/ items/ languages/ mechanics/ powers/ races/ saves/ skills/
    │   │                                  (XEntity: an entity described, what saving or deleting one writes; fields.ts:
    │   │                                  its fields off its properties; classes/ ClassLevelEntity, ClassSkillEntity,
    │   │                                  ClassTable: a class's parts, which ClassEntity hands out)
    │   └── feats/                         (GeneratedFeats: the feats a save makes or removes, in the general feats'
    │                                      pool; SpellFocusFeats: a school's Spell Focus)
    ├── ruleset/                           ← the module's `ruleset`: what it answers of a ruleset as a whole
    │   ├── Dnd35Ruleset.ts                (checkPublishable: what a ruleset published to be played needs)
    │   └── fields.ts                      (RULESET_FIELDS: the ruleset's own fields, its skill points' ability)
    ├── characters/                        ← the module's `characters`: what it answers of a character
    │   ├── Dnd35Characters.ts             (the module's characters)
    │   ├── CharacterEdits.ts              (what its creation stores, the languages it can speak)
    │   ├── description/                   (CharacterDescription: the 3.5 API response shape, whole or partial, its
    │   │                                  private notes as the viewer reads them; CharacterResponse; CharacterCards:
    │   │                                  a list's card of one)
    │   ├── inventory/                     (InventoryEntries: a character's entries described, what an entry's add or
    │   │                                  edit stores; Equipping: what equipping an item checks)
    │   └── sheet/                         (the printed sheet, in React PDF: CharacterSheet and its pages, SheetFormat)
    ├── levelUp/                           ← the module's `levelUp`: a class per operation on a base, LevelUpState:
    │                                      the view and the character's rows, the character built (`build`), class
    │                                      level lookups, the steps' shapes, the bonded creatures; its concern:
    │                                      ChecksSelections; PlannedLevelsState: the planned levels and what they
    │                                      give (AptitudeSlotsPlan), which LevelUpPreview (the wizard's preview) and
    │                                      LevelUpPlan (a save's levels checked, its picks spread over them,
    │                                      PicksDistribution) build on; LevelEdit: a saved level's edit, and the issues it
    │                                      answers for; LevelRemoval: the last level removed; LevelUpSteps: the
    │                                      wizard's steps; LevelSelections: a saved level's selections;
    │                                      BondedCreatures: what a master's creatures become as its saved levels
    │                                      make them, which every save plans with BondedPlans; Dnd35LevelUp: the
    │                                      module's levelUp, which opens them)
    ├── pickers/                           (Picker: one pipeline, `filters` and `describe(rows)`: the rows as the
    │                                      view reads them, those it offers, each with whether who it picks for meets
    │                                      its requirements and the tree of those it fails, and what it adds; a kind
    │                                      says what differs. CharacterPicker checks against the character as the
    │                                      level-up plans it, built once; ClassPicker (a class's next level) and
    │                                      LevelPicker (FeatPicker, PowerPicker: the level they pick at) on it;
    │                                      RacePicker checks a new character's form)
    ├── content/                           ← the module's `content`: Dnd35Content, what the seeders and the codegen
    │                                      ask: BookPaths, EntityProperties
    └── rules/                             (the tables and rules several sides read: LevelRules, SkillRules, sizes,
                                           carrying, combat)
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
│   │       ├── concerns/                  (Pickers: the class, feat and power pickers' pages; Steps: the wizard's
│   │       │                              ability, feat, power and skill steps)
│   │       └── bondedWrites.ts            (the bonded creatures the engine plans, written)
│   └── rulesets/                          ← entity CRUD for feats/powers/aptitudes/…
│       └── entityWrites.ts                (what the engine plans a save writes beside its row, written)
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

The engine's types keep the narrowest surface any level-based system could implement: the module's contract (`engine/core/module/contract.ts`), the rows it takes (`CharacterInputs.ts`) and what it writes (`writes.ts`), and what its machinery reads, each beside its area (`RulesetView` in `core/view/`, `Components` and `TargetPaths` in `core/paths/`). A ruleset's types are its own, each beside what produces it. What a level-up projects is rows (`CharacterProjection.ts`, beside `CharacterInputs.ts`): a ruleset builds a planned character as it builds a saved one, so what a level grants and what a pick carries are read one way.

```ts
// engine/core/module/contract.ts  (universal)
export interface RulesetModule {
  characters: object;
  content: object;
  entities: object;
  levelUp: object;
  ruleset: object;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPaths;
}
```

```ts
// engine/rulesets/dnd3.5/Dnd35Module.ts  (the 3.5 module's own)
export interface Dnd35RulesetModule extends RulesetModule {
  characters: Dnd35Characters;
  content: Dnd35Content;
  entities: Dnd35Entities;
  levelUp: Dnd35LevelUp;
  ruleset: Dnd35Ruleset;
}

// engine/core/module/CharacterProjection.ts  (universal): what a level-up adds before it's saved, as the rows it
// would save, which a ruleset builds the character from as from saved rows
const projection = new CharacterProjection(input);
projection.dropLevelsFrom(editedLevelId); // the character as it was before a level
const level = projection.addLevel(klassLevelId, { abilityId, hp, replacing }); // or a level replaced where it stands
projection.pick(level, { feats, powers, skills });
CharacterBuilder.build(view, projection.input);
```

A module is typed by its parts: the contract gives each as an `object`, and a module's type gives them its own. `Modules.of(baseRules)` hands each module out as its type (`Module`), and each handle's operation takes its arguments from its part's own method, past those the handle binds (`Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>`), so the server calls an operation with the module's own types, naming no ruleset:

```ts
// server/services/characters/levels/CharacterLevelsService.ts
return await withEditableCharacter(db, session, characterId, (scope, character) =>
  Engine.for(scope).character(character).levelUp().describePreview(levels, abilityIds),
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

The engine's own types name no ruleset (`arkyvree/layers`): its `DetailedCharacterInterface` holds `Components`, which the 3.5 character narrows to its own (`Dnd35Components`).

### The module's parts

What a ruleset answers is its module's: five parts, each a class whose operations call the classes its domain folders hold, and the factories and the order the machinery calls. A character isn't one of them: an operation builds the ruleset's own (`CharacterBuilder.build`), from the input it's given. The entry's handles ask them, each past what it binds (the view, a character's rows, a class).

| Member | What it answers | 3.5's | The handles that ask it |
|---|---|---|---|
| `characters` | a character's sheets (the API's, a campaign member's reading, partial or whole, the printed one), a list's card of one, its inventory, what a new one and an inventory entry store (what equipping an item checks), the languages it can speak, the races a new character can pick | `Dnd35Characters`: `describe`, `describeForMember`, `describeSheet`, `describeCard`, `describeInventory`, `planCreate`, `planInventoryEntry`, `checkLanguages`, `openRacePicker`: each named as its handle's operation is | `character(input)` (`CharacterEngine`), `characters()` (`CharactersEngine`) |
| `entities` | each entity kind's rules, by its table: an entity found and described, a page opened (`openList`), what saving or deleting one writes, what the rules refuse of an edit; a class's levels, class skills and table, which the classes' kind hands out | `Dnd35Entities`: `of(view, type)`, each kind's class (`SkillEntity`, `FeatEntity`, `ItemEntity`…; `ClassEntity`'s `levels(klassId)`, `skills(klassId)`, `table(klassId)`) | `entities(type)`, `class(klassId)` (`ClassEngine`) |
| `levelUp` | the level flows: the preview, a save's levels and its check (the character with them, unless forced), a saved level's edit, the last level's removal, the bonded creatures the levels make, the wizard's steps and pickers, a saved level's selections | `Dnd35LevelUp`: `describePreview`, `planLevels`, `planEdit`, `planRemoval`, `planBonded`, `describeAbilityStep`, `describeFeatStep`…, `openFeatPicker`…, `describeLevel`: each named as its handle's operation is, and as the class it opens names it (`LevelUpPlan.describePreview`, `LevelEdit.planEdit`) | `character(input).levelUp()` (`LevelUpEngine`) |
| `ruleset` | what a ruleset needs as a whole, past its entities: to be published to be played, a player race and class, a skill and a feat | `Dnd35Ruleset`: `checkPublishable` (`RulesetPublishing`) | `checkPublishable` |
| `content` | what the seeders and the codegen ask: the paths a book can target, an entity's fields as its properties | `Dnd35Content`: `listBookTargetPaths`, `toEntityProperties` | `Engine.forRules(baseRules)` (`ContentEngine`) |
| `createTargetPaths`, `createPropertyTypes` | the ruleset's path categories, its property types (in stat-block order, which the view orders an entity's properties by: `PropertyOrder`) | `Dnd35TargetPaths`, `Dnd35PropertyTypes` | `targetPaths()`, `modifiers(…)`, `requirements(…)`; `propertyTypes()` |

A part's operation is a method of a handle of `engine/api/`, which `Engine` hands out, dispatched by the view's base rules (`Modules.of(view.ruleset.baseRules)`, which `Engine.for(scope)` reads once; a content operation by the base rules its caller names, `Engine.forRules(baseRules)`). The target paths' handle asks the target paths (`targetPaths()`: `list`, `validate`, `checkValue`, `getCompletions`, which `CategoryPaths` answers, over `PathChecks` and `PathCompletions`), and the view's build asks the order (`Engine.copyOnWrite().buildView`). The properties' and the customizations', which no ruleset changes but by its factories, ask the core's classes (`engine/core/customizations/`): `PropertyTypeCatalog` adds the types and values the ruleset's own properties use to its rules' (`createPropertyTypes`: `propertyTypes()`'s `list`, `getTypeCompletions`, `getValueCompletions`); `ModifierEdits`, `PropertyEdits` and `RequirementEdits` (on `CustomizationEdits`, bound to the entity as their handles are) describe an entity's customizations and plan their saves, a modifier's or a requirement's row checked against its target paths (`modifiers(entityType, entityId)`: `describe`, `describeAll`, `planCreate`, `planEdit`, `planDelete`, and `properties(…)` and `requirements(…)` alike; a list's, `targetPaths().describeModifiers`, labeled as the entity's are: `TargetLabels.describe`), on the entity the view has (`CustomizedEntity.find`, refused as not found otherwise). Copy-on-write's (`Engine.copyOnWrite()`) ask the core's classes too (`CowSources`: `buildSourceChain`, `getReads`; `ExtensionNames`: `checkExtensionNames`; `SiblingMerge`: `mergeCustomizations`). `entities(type)` hands out a kind's class, whose `find` and `describe` read the view (`RulesetData.find`; a customizable kind's `describe` with its customizations), and `checkPublishable` asks the ruleset part's `checkPublishable`, which an extension passes. An operation takes the data its caller read: the view (`RulesetView`: the ruleset and its `rulesetData`), which `Engine.for` binds, a character's rows (`CharacterInput`: its record, its rows, a bonded creature's master's), which `character(input)` binds, a request's body. It answers data:

- **A description**: what the API answers (`character(input).describe`, `class(klassId).describeLevels`), a picker's or a list's filters, which the server reads a page with, and what describes the page it read (`levelUp().openFeatPicker`'s `describe`, `entities("feats").openList`'s `describe`), the printed sheet's document (`character(input).describeSheet`).
- **A plan**: what to write, without ids. `EntityWrites` (`engine/core/module/writes.ts`) is what saving an entity writes beside its row: the properties its fields are kept in, a requirement on it, the entities it makes (`made`: each with its table, its row's columns, its list links and its customizations; 3.5's general feats, `feats/GeneratedFeats.ts`), and those it removes (`removed`, by table and id). A level-up's is its levels and their picks, and what the master's bonded creatures become with them (`levelUp()`'s `plan`, `planEdit`, `planRemoval`; the seeders', `planBonded`). A plan whose save answers the entity carries what it answers once written (`describe(row)`: the saved row with the fields the save keeps, `entities("skills").planCreate`). The server writes a plan in its transaction (`writeEntityWrites`, `writeBondedCreatures`), which reads of the view only its copy-on-write data, and of the database what a write depends on: whether a grouping's feats are there already, whether a character picked a feat it removes.
- **A refusal**: a `RulesError` naming its kind (`invalid`, `unprocessable`, `conflict`, `not-found`), which the server answers as its error of that kind (`characters().checkLanguages`, `checkPublishable`, and a plan's own: `character(input).planInventoryEntry` an item the character can't equip where asked, `entities("aptitudes").planEdit` renaming a pool the characters count on by name). What a character fails is refused with its issues (`RulesError.refuseIssues`): `levelUp().planLevels` refuses the character with its new levels, unless forced.

Its verb says which: `describe…`, `get…` and `list…` answer what something is, `open…` a picker or a list, `plan…` a plan, `check…` refuses or answers what it checked, `validate…` a path's validation, `build…` the view, its copy-on-write data and its source chain (`buildView`, `buildData`, `buildSourceChain`), `merge…` the rows a copy takes of its siblings, and `to…` a conversion (`toEntityProperties`). A method named for a noun hands out a handle (`character(input)`, `class(klassId)`, `entities("skills")`, `levelUp()`), and isn't an operation (`arkyvree/one-engine-op`).

An entity's fields are declared once, in its kind's folder, as a spec a codec reads and writes (`engine/core/fields/`: `Field`'s kinds, `FieldCodec`): `entities/skills/fields.ts` declares `SKILL_FIELDS`, from which come the fields' values (`SkillFieldValues`), their defaults, the property types that store them, their reading off an entity's properties (`read`, in one pass) and their writing back as id-less `PropertyValue`s (`toProperties`, `write`), an edit's merge, the rule between them (`normalize`, which reading and writing apply), and the shapes a route validates a body's fields with, a create's and an edit's (`ENTITY_FIELDS`, built from the specs). Its entity class describes it and plans its saves with them (`skills/SkillEntity.ts`: its `fields`, and what a save writes beside its row), the character's loader reads with them, and the seeders write with them (`Engine.forRules(baseRules).toEntityProperties`):

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
  protected readonly fields = SKILL_FIELDS;

  protected override writesOf(body: SkillBody, skill?: Skill): EntityWrites {
    const fields = this.formFields(body, skill);
    const renamed = skill?.name !== body.name;
    return {
      made: renamed ? SkillFocusFeats.make(this.view, body.name) : [],
      properties: fields && this.fields.write(fields),
      removed: skill && renamed ? SkillFocusFeats.remove(this.view, skill.name) : [],
    };
  }
  …
}
```

A small rule several of a ruleset's modules share, a constant or a predicate, is the ruleset's own (`rules/LevelRules.ts`: `isAbilityIncreaseLevel`, `countGeneralFeats`, `GENERAL_FEATS_APTITUDE`; `rules/SkillRules.ts`: a level's skill points, a rank's cost, a skill's most ranks), which they import: it's no part of the contract.

A bound the client and the API check too is a constant of the ruleset's shared vocabulary, which every side reads instead of writing the number: `MAX_SPELL_LEVEL` (`shared/dnd3.5/spells.ts`) for the aptitudes' spell levels, the spellcasting and the spell forms, `MAX_CLASS_LEVEL` (`shared/dnd3.5/classes.ts`) for the class-level forms and the bonus caster levels, `MAX_ABILITY_SCORE` (`shared/dnd3.5/abilities.ts`) for a new character's ability scores and the sheet's, and `MAX_ITEM_VARIANTS` (`shared/itemTemplates.ts`) for the variants form. The routes read them through the engine (`RULESET_LIMITS`), and a character's last level with them (`MAX_CHARACTER_LEVEL`, `shared/dnd3.5/classes.ts`: the most levels a level-up saves).

More complex operations (bound to the detailed character, returning rich data) belong on the ruleset's level-up classes (`LevelUpState` and its concern, `ChecksSelections`, and the pickers on `Picker`, building the character from the rows a level-up adds, `CharacterProjection`) or on its character (a concern of `DetailedCharacter`), which an operation builds from the input it's given (`CharacterBuilder.build`).

### The level flows ask the module

The level flows (`server/services/characters/levels/`: the preview, a save, an edit, a removal, the wizard's steps and pickers, a level's selections, the bonded creatures' writes) are the server's: they read the character's rows (`readCharacterInput`, `readBondedInputs`; a save's in its transaction, the character locked), ask the engine, and write what it plans. What a level-up is, its rules, is the module's `levelUp` (the 3.5 module's `Dnd35LevelUp`, which opens a class per operation: the planned levels' class levels and projections, the preview and a save's distribution, the checks a save makes, the last level's removal, the steps' slots, the pickers' filters and options, a level's selections, the bonded creatures' plans), which build the characters a step needs from the rows they're given. A second ruleset gives its module a level-up of its own; no line of the server changes.

Entity CRUD services (`FeatsService`, `PowersService`, `SkillsService`, `ClassLevelsService`, `AptitudesService`, …) operate on rows of the generic schema, and ask the module's `entities` what's ruleset-specific about them, one operation per action: an entity's fields, what saving it writes, what its rules refuse. Their customizations' services (`ModifiersService`, `PropertiesService`, `RequirementsService`, `PropertyTypesService`) ask the engine's customizations and property types the same way.

### Routes

The level routes (`server/routers/api/characters/levels/index.ts`) take the generic schema's level-up: class levels, skill ranks, and feats and powers by their pool; the module reads what its own pickers take (a spell level, a specialist's excluded schools).

A body's fields that a ruleset's rules take, and the bounds they set on its columns, are the engine's (`ENTITY_FIELDS`, `RULESET_LIMITS`, the 3.5 module's today: a second module's join them), which a route spreads into its schema, its create's or its edit's (`...ENTITY_FIELDS.skills.create`, `...ENTITY_FIELDS.skills.edit`), and their bounds (`.max(RULESET_LIMITS.spellLevel)`). An edit gives the fields it changes: the entity's base merges them over those it keeps (`formFields`), for a skill, a spell and a class level alike. A character's alignment and gender are the database's enums, whose options `shared/enums.ts` writes out (`ALIGNMENT_OPTIONS`, `GENDER_OPTIONS`). The server imports nothing of `shared/dnd3.5/`.

### What's intentionally generic schema, not ruleset-specific

The DB schema includes some concepts that read as D&D-family but are actually **generic primitives**:

- **Aptitudes** (`aptitudesInRules`, `feats_aptitudes`, `powers_aptitudes`) — "named pools of grantable abilities with slot counts." Works for 5e (ASI/feat pools, spells known), PF2e (feat types, spells), etc. 3.5 just happens to use this for "Wizard Spells", "Fighter Bonus Feat", etc.
- **Saves** (`savesInRules`, `klass_level_saves`) — "defense categories with per-class-level progression." Every level-based RPG with a resistance mechanic fits this.
- **Requirements / Modifiers / Properties** — fully generic customization system. Target paths are data, not code. See `docs/customization.md` and `docs/target-paths.md`.

The 3.5-ness in these tables lives in the **seeded values**, not the schema shape. Don't split them.

### How to add a new ruleset

A ruleset is a module under `engine/rulesets/<ruleset>/`, which the engine's handles dispatch to by its base rules (`Modules.of`): the server, the seeders and the codegen call the same operations, and no line of theirs changes.

1. **Define the module**: a class of `engine/rulesets/<ruleset>/` (3.5's `Dnd35Module.ts`), whose factory (`Dnd35Module.create`) returns a `RulesetModule` of its own (`Dnd35RulesetModule`): its parts, `characters`, `entities`, `levelUp`, `ruleset` and `content`, each a class with the methods the handles of `engine/api/` ask, named as its handles' operations are, with 3.5's arguments (`levelUp().describePreview` asks `describePreview` with the view and the character it binds, then its caller's), and what an operation asks of them (`describeCard`, which `characters().describeCard` asks for a list's character; `checkPublishable`, which `checkPublishable` asks of a ruleset); and its factories, `createTargetPaths` and `createPropertyTypes` (its property types, in the stat-block order its view keeps an entity's properties in). A new ruleset's template items come with its base, which its content package seeds: a fork reads them through its chain.
2. **Write its character** in `engine/rulesets/<ruleset>/character/`: its state (`CharacterState`), the concerns that build and validate it, its components and how they're wired (`CharacterComponents.build`), `DetailedCharacter`, which includes the concerns, and what builds one of its row's kind from its input (`CharacterBuilder.build`). 3.5's are typed against its own components and rows: a second ruleset writes its own, taking the engine's machinery (the evaluators, the paths, the module contract).
3. **Write its target paths**: a `CategoryPaths` subclass (`Dnd35TargetPaths`) over its categories, one `PathCategory` per domain (`AbilitiesPaths`, `CombatPaths`, …: a table of its leaves, their operators by value type, `getOperators`, and the labels of the ruleset's names in its paths, `labelNames`, which `CategoryPaths` merges), which `createTargetPaths` returns and the evaluators walk; and its property types (`Dnd35PropertyTypes`), which `createPropertyTypes` returns: the types and values its rules read, which the core's `PropertyTypeCatalog` lists with those the ruleset's own properties use. See [target-paths.md](./target-paths.md).
4. **Write its entities**: a fields spec for each entity whose fields its rules keep in properties (`entities/skills/fields.ts`), the entity class that describes it and plans its saves (`skills/SkillEntity.ts`), a class's parts, which its kind hands out (3.5's `ClassEntity`: `levels(klassId)`, `skills(klassId)`, `table(klassId)`), and the body's fields and bounds a route validates with (`entityFields.ts`: `ENTITY_FIELDS`, `RULESET_LIMITS`), which join 3.5's in what `engine/index.ts` exports; and its `ruleset` part, what a ruleset needs to be played (3.5's `Dnd35Ruleset`), with the ruleset's own fields (`ruleset/fields.ts`).
5. **Write its level-up**: a class per operation on a base of what they share (3.5's `LevelUpState`, its concerns, and `LevelUpPreview`, `LevelUpPlan`, `LevelEdit`, `LevelRemoval`, `LevelUpSteps`, the pickers…), and the class its `levelUp` part is, which opens them (`Dnd35LevelUp`).
6. **Register the module**: add it to `MODULES` in `engine/api/Modules.ts` (`Modules.of`), keyed by its base rules (`BaseRules`, `shared/enums.ts`): until it is, the engine doesn't compile.
7. **Write its content**: `content/<ruleset>/` (its builders and its data), the package that seeds it (`database/packages/`), and, for books it scrapes, its codegen (`codegen/<ruleset>/`). See [packages.md](./packages.md).

### How to extend `engine/` without leaking a ruleset

The engine is the machinery every ruleset runs on: the evaluators, the path walk and the path language, the view, copy-on-write's state, the module's contract and the operations that dispatch to it. Its core imports nothing from a ruleset, not even a type (`arkyvree/layers`). If you feel you have to, the file probably belongs to the ruleset.

If the services need a per-ruleset value or answer:
- Add an operation: a method of the module's part (`Dnd35Entities`, `Dnd35LevelUp`, …) and the method of the handle it's about that dispatches to it (`LevelUpEngine`, `ClassEngine`, …: `engine/api/`; an entity kind's is a method of its entity class, on `RulesetEntity`, which `entities(type)` hands out), or a handle of its own, which `RulesetEngine` hands out under a noun (`class(klassId)`). `engine/index.ts` exports a handle's type when the server derives a body's or a plan's from it (`Parameters<EntityKinds["skills"]["planCreate"]>[0]`).
- A value the client and the API need too lives in the ruleset's `shared/<ruleset>/` (`MAX_SPELL_LEVEL`), never in a file another ruleset would read; the server takes it through the engine (`RULESET_LIMITS`).

If you need a per-ruleset behavior too complex for one class (takes the detailed character, returns rich data, reads several components), make it a method of the ruleset's level-up base or one of its concerns (`LevelUpState`, `ChecksSelections`…) or a concern of its character, which its operations call. A part is typed by its module (`Dnd35RulesetModule`), so nothing casts.

### Grey areas and audit findings

An audit on 2026-04-16 identified real leaks and some false alarms. It predates the engine's restructure, which moved every component under `dnd3.5/`: the components it calls generic are 3.5's, and generic in that a second ruleset could take them as they are.

**Fixed:**
- `MAX_SPELL_LEVEL = 9` was hardcoded in the aptitudes component (`dnd3.5/model/aptitudes/AptitudesComponent.ts`) — now one constant in `shared/dnd3.5/spells.ts`, which the spellcasting, the client and the routes (through `RULESET_LIMITS`) read too.
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
| `server/cow/writes/` | `EntityEdit` (the row an entity's change writes), `CustomizationEdit` (a customization's), `EntityNames` (the names a create takes), `EntityCopy` (a copy of an inherited entity), `CustomizationCopies` and `EntityRepositories`: copy-on-write's write side. `EntityCopy` merges sibling data into newly COW'd local copies by the engine's rules (`Engine.copyOnWrite().mergeCustomizations`, `mergeAptitudeLinks`). Sibling read-time merging lives in the compose step (`engine/core/view/RulesetComposition.ts`). |
| `server/services/rulesets/RulesetsService.ts` | `forkRuleset`, `publishRuleset`, `archiveRuleset` |
| `server/services/rulesets/extensions/RulesetExtensionsService.ts` | `subscribeExtension`, `unsubscribeExtension`, `getExtensions` |
| `server/services/rulesets/changes/RulesetChangesService.ts` | `getChanges`, `revertOverride` |
| `server/services/policies/RulesetsPolicy.ts` | Authorization checks for all ruleset operations: the ruleset's own, plus the concerns in `policies/concerns/` (entities, contributors, extensions, creating campaigns and characters), over the roles in `RulesetRoles.ts` |
| `server/services/rulesets/*/` | Entity services (feats, powers, classes, etc.) using the COW pattern |
| `server/services/rulesets/EntitySaves.ts` | `EntitySaves`: a kind's create, update and delete, in one order around the plan its rules give |
| `server/services/rulesets/entityWrites.ts` | `writeEntityWrites`: what the engine plans a save writes beside an entity's row (`EntityWrites`), written in the save's transaction |
| `server/services/rulesets/listLinks.ts` | `createListLinks`, `setListLinks`: an entity's list links (a feat's pools, a power's lists), as a plan gives them (`ListLink`) |
| `server/services/characters/characterInputs.ts` | `readCharacterInput`, `readBondedInputs`: a character's rows, read in its ruleset's scope, which the engine builds it from |
| `server/repositories/*Repository.ts` | COW-aware SQL queries with snapshot exclusion |
| `engine/index.ts` | The engine's one entry: `Engine`, its handles' types (`ClassEngine`, `LevelUpEngine`), each entity kind's rules by table (`EntityKinds`), its operations' types, `RulesError`, and a body's ruleset fields and bounds (`ENTITY_FIELDS`, `RULESET_LIMITS`) |
| `engine/api/` | `Engine` and the handles it hands out, a class each (`RulesetEngine`, which `Engine.for(scope)` binds to a view, and its handles by what the rules are about: `CharacterEngine`, `LevelUpEngine`, `ClassEngine`…, and an entity kind's own class, which `entities(type)` hands out; `ContentEngine`, `Engine.forRules`; `CopyOnWriteEngine`, `Engine.copyOnWrite`), each operation a method dispatched to the ruleset's module by its base rules (`Modules.ts`: `Modules.of`), or to the core's classes with the module's factories (`ModifiersEngine`, `PropertiesEngine`, `RequirementsEngine`, `PropertyTypesEngine`, `TargetPathsEngine`) |
| `engine/core/module/` | The module's contract (`contract.ts`: `RulesetModule`), the rows a character is built from (`CharacterInputs.ts`: `CharacterInput`, `CharacterRows`, resolved as the view reads them) and those a level-up adds before it's saved (`CharacterProjection.ts`), and what saving an entity writes (`writes.ts`: `EntityWrites`) |
| `engine/rulesets/dnd3.5/model/` | The 3.5 character: its state (`CharacterState`), its concerns (`Builds`, `Validates`, `PossessesVirtually`), its components (`CharacterComponents`), `DetailedCharacter`, which wires them, `CharacterBuilder`, which builds one from its input, and a folder per concept a character has (its component and its paths' category) |
| `engine/core/` | The machinery: `ModifierEvaluator`, `RequirementEvaluator`, the path walk and the path language and their types (`paths/`), the ruleset view and `RulesetView` (`view/`), copy-on-write's state (`cow/`), an entity's customizations and the property types (`customizations/`) |
| `engine/rulesets/dnd3.5/` | 3.5 implementation: what a character has (`model/`), its module's parts in their folders (`characters/`, `entities/`, `levelUp/`, `content/`, each opening with its facade), the pickers (`pickers/`) and the tables and rules several of them read (`rules/`) |
| `engine/rulesets/dnd3.5/model/concerns/Builds.ts` | The build: the loader (`loading/`) gives each entity the modifiers and requirements the compose step merged into `rulesetData`, then the components, the possession pre-pass and the modifier rounds run |
| `database/packages/dnd35/seed/concerns/CopiesOnWrite.ts` | Seed-time COW: copies the core feats and spells an extension changes |
| `tests/services/rulesets/Extensions.test.ts` | Extensions, COW, fork inheritance, merge, name conflicts, publish validation, sibling merge (feats + powers: aptitudes, requirements, modifiers across all endpoints) |
| `tests/services/rulesets/Sibling*.test.ts`, `tests/services/rulesets/customization/Sibling*.test.ts`, `tests/cache/aptitudeDedup.test.ts` | Siblings: what the composed view shows, edits and customization writes on a sibling-merged entity, aptitude deduplication |
