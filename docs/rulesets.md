# Rulesets, COW & Extensions

## Overview

Rulesets define game rules (races, classes, feats, skills, items, powers, etc.) and support a hierarchical inheritance model. Entities are shared by reference — never copied — until a user modifies one, at which point a local copy is created on demand (Copy-on-Write).

## Ruleset Types

```
Base Ruleset (D&D 3.5)           ← system-owned, userId: null, no parent
├── Complete Warrior (extension)  ← system-owned, rulesetId: baseId, published
├── User's Fork (draft)           ← userId set, rulesetId: baseId
│   └── Complete Warrior (installed extension)
└── Another User's Fork
```

| Type | `userId` | `rulesetId` | `kind` | Description |
|---|---|---|---|---|
| **Base** | `null` | `null` | `ruleset` | System-owned root ruleset (e.g., D&D 3.5). Immutable |
| **System Extension** | `null` | parent ID | `extension` | System-owned supplement (e.g., Complete Warrior). Published, installed by reference |
| **User Fork (playable)** | user ID | parent ID | `ruleset` | User's editable copy of a published ruleset; intended to be played directly |
| **User Fork (extension)** | user ID | parent ID | `extension` | User fork published as an extension; can be subscribed to by other users' forks of the same base, but cannot be used to create characters directly |

### Key Fields on `rulesetsInRules`

| Field | Description |
|---|---|
| `rulesetId` | Parent ruleset (null for base rulesets) |
| `ancestorRulesetIds` | `[parentId]` — only base rulesets can be forked, so the chain has at most one entry |
| `extensionRulesetIds` | Installed extension IDs (appended on install, removed on uninstall) |
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
- **Validation (kind = 'ruleset')**: must have at least one of each entity type — race, class, skill, feat (including inherited from source chain)
- **Validation (kind = 'extension')**: ruleset must be a fork and must not subscribe to other extensions. The minimum-content check is skipped — extensions are layered onto rulesets that already have the basics
- Only the owner can publish; only Draft rulesets can be published

#### What Draft vs Published actually gates

After the policy loosening (`inUse` + COW tombstones now do the protection that the Draft-only edit gates used to), the difference is narrow:

| Capability | Draft | Published |
|---|---|---|
| Edit/delete entities | ✓ | ✓ |
| Subscribe / unsubscribe extensions | ✓ | ✓ |
| **Be forked by other users** | ✗ | ✓ |
| **Appear in public lists** (when `private = false`) | ✗ | ✓ |
| Publish transition | ✓ (Draft → Published) | ✗ |

Published is purely an **outward-facing stability marker** — "others can fork from this baseline" and "this shows up in public discovery." It doesn't restrict what you can do to your own ruleset.

For a `private` ruleset the distinction is functionally a no-op: nobody else can see or fork it regardless of status, and edit behavior is identical. The publish action is only meaningful when paired with `private = false`.

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

1. **Snapshot** — an `entity_snapshots` row is created: `{ rulesetId, entityType, sourceEntityId, forkedEntityId, contentHash }`
2. **Local copy** — the entity + all customizations (modifiers, properties, requirements) + relationships are duplicated into the child ruleset
3. **Modification** — the local copy is updated or deleted (for deletes)
4. **Query exclusion** — the repository SQL excludes the original from ancestor results when a snapshot exists

### COW in Repositories

Each repository's `findManyByRulesetId` builds COW-aware SQL per ancestor:

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

- **Standard entities** (feats, powers, items, races, skills, etc.): COW copies the entity and all customizations
- **Classes**: COW copies the entire class including all levels and their customizations/relationships
- **Customizations on inherited entities**: `cowEntityForCustomization` traces the modifier/property/requirement back to its owning entity, COWs that entity, then finds the matching customization in the new copy via hash matching

### Override Map

`buildOverrideMap()` creates a mapping of `sourceEntityId → forkedEntityId` across the full snapshot chain. Used for:
- **FK remapping**: When copying entities, foreign keys pointing to inherited entities are remapped to their COW copies
- **Detail views**: `resolveOverrides()` applies the map to remap ID references in query results

### Snapshots

| Field | Description |
|---|---|
| `sourceEntityId` | Original ancestor entity ID |
| `forkedEntityId` | Child's local COW copy ID |
| `contentHash` | Baseline hash of entity + customizations at COW time |

### Multi-Extension COW (Sibling Map)

When multiple extensions COW the same base entity, each extension creates its own independent copy. At runtime, one copy "wins" (the first extension in install order) and the others become **siblings**. Their data is merged transparently so the user sees a single entity with combined customizations.

```
Base Ruleset
├── Evasion (base feat, standalone requirement: classes.rogue.level >= 2)
│
├── DMG Extension
│   └── Evasion (COW copy, adds: Shadowdancer >= 2, Assassin >= 8)
│
└── Complete Divine Extension
    └── Evasion (COW copy, adds: Favored Soul >= 5)

User's Fork (subscribed to both DMG + CD)
└── sees ONE "Evasion" with merged requirements:
    OR chain: Rogue >= 2 | Shadowdancer >= 2 | Assassin >= 8 | Favored Soul >= 5
```

**How it works:**

1. `buildOverrideMap()` detects when multiple extension snapshots share the same `sourceEntityId`. It builds a `siblingMap: Map<string, string[]>` mapping the winner's `forkedEntityId` → sibling `forkedEntityId`s.

2. **Entity list filtering**: Sibling entities are filtered out of query results (only the winner is returned), so the user never sees duplicate feats.

3. **Read-time merging** (built into the cache compose step in `server/cache/rulesetCache.ts`): `getOrFetchRulesetData` folds sibling contributions into the winner's buckets before services see them. Consumers read `rulesetData.featsById` / `rulesetData.powersById` / `rulesetData.modifiersBySource` / `rulesetData.requirementsByEntity` / `rulesetData.propertiesByEntity` and get pre-merged rows — no sibling helpers needed at call sites.
   - **Aptitudes**: sibling `feats_aptitudes` / `powers_aptitudes` are merged into the winner's inline array, deduped by resolved `aptitudeId` after FK remap.
   - **Requirements**: sibling leaf reqs (target-having, non-chaining) are appended to the winner's bucket with `entityId` remapped. When the winner has an OR chain, new leaves are renumbered under it; otherwise they keep their original level. Dedup on `target|operator|value`.
   - **Modifiers**: sibling modifiers are appended with `sourceId` remapped to the winner, deduped on `target|value|operator|valueType`. Dropped modifiers have their requirements dropped too.
   - **Properties**: sibling properties are appended with `entityId` remapped to the winner, deduped on `type|value`.
   - Consumers: `FeatsService`, `PowersService`, `ModifiersService`, `RequirementsService`, and `DetailedCharacter` all just read from `rulesetData.*` without any sibling-specific code.

4. **COW merging** (`cowEntity`): When a user COWs the winner entity, `mergeSiblingData()` copies unique requirements, modifiers, and aptitude links from all siblings into the new local copy. The child's copy contains the full merged result. See below.

**Key rule**: A local (child fork) COW always wins completely — no sibling merging. The sibling map only applies to extension-vs-extension COW conflicts. If the user's own fork has COW'd a base entity, that fork's copy is authoritative and extension copies are ignored.

`cowEntity` accepts an optional `extensionRulesetIds` parameter to enable sibling detection. All callers in `cowEntityForCustomization` pass `ruleset.extensionRulesetIds`.

### Aptitudes and the Sibling Map

Aptitudes are named pools — they have `name` but no per-ruleset content — so the seed only creates a row in the ruleset that *introduces* the name (see `docs/packages.md:COW-ing base entities into extensions → Aptitude ownership rules`). Two cases matter here:

- **Base-inherited names** (`General`, `Cleric Domain`, `Fighter Bonus Feat`, etc.): exactly one row exists, in base. Extensions and forks adding new feats/spells just link to base's id via `aptMap`. No sibling rows, no dedup needed.
- **Sibling-shared names** (e.g. `Assassin Spells`, `Blackguard Spells`, `Hexblade Spells`): multiple extensions each create their own copy because siblings can't FK to each other. The sibling mechanism (`cow.ts`'s aptitude-name grouping) picks a winner per name across the source chain, maps losers into `overrideMap`, and the compose step drops losers + FK-remaps references. The user never sees duplicates.

### COW-ing a Merged Entity (Sibling Bake-in)

When a user modifies an entity that is the merged result of multiple extension COWs, the local copy must contain the **combined** data from all siblings — not just the winner's data. Otherwise the user's fork would lose customizations from the non-winning extensions.

```
Before COW (runtime view):
  User sees "Evasion" with merged OR chain from DMG (winner) + CD (sibling)

User edits Evasion → cowEntity triggers:
  1. Copies the winner (DMG's Evasion) + all its customizations
  2. Detects siblings via siblingMap → finds CD's Evasion
  3. Calls mergeSiblingData() to bake sibling data into the new local copy
  4. User's local copy now contains the full merged result

After COW:
  User's fork has its own "Evasion" with ALL requirements/modifiers from both extensions
  The siblingMap no longer applies — local fork wins completely
```

`mergeSiblingData()` merges three types of customizations:

| Type | Merge strategy | Deduplication key |
|---|---|---|
| **Requirements** | Appends sibling OR-chain leaf nodes to the winner's OR chain | `target + operator + value` |
| **Modifiers** | Inserts sibling modifiers (with their own requirements) | `target + value + operator + valueType` |
| **Aptitude links** | Inserts sibling `feats_aptitudes` / `powers_aptitudes` rows | `aptitudeId` |

This ensures the user's local copy is self-contained. If they later uninstall one of the extensions, their fork retains the full merged data since it's baked into their own copy.

## Extensions

Extensions add supplemental entities to a base ruleset. They come in two flavors that share the same data model — installation is by reference, never copy:

Eligibility is determined by `kind = 'extension'` on the ruleset row, set explicitly by the author (or seeded for system extensions). Both flavors share the same row shape:

- **System extensions**: `userId IS NULL`, `kind = 'extension'` (e.g., Complete Warrior).
- **User extensions**: user-owned forks with `kind = 'extension'`, `private = false`, `status = 'Published'`. The `extensions` listing scope returns both flavors merged.

The validators that set `kind = 'extension'` enforce: must be a fork, must not subscribe to other extensions. That keeps the dependency graph one level deep — subscribers never need to walk a transitive chain. The same invariant is enforced on the subscribe path: a host whose own `kind = 'extension'` cannot subscribe to anything (`canSubscribeExtension` policy).

### Install

1. Validates: ruleset is a fork, not archived, user is owner, extension is `kind = 'extension'` + published + shares the same base + (if user-owned) public + the host's own `kind` is `'ruleset'`
2. Checks not already installed (`extensionRulesetIds.includes`)
3. Appends `extensionId` to `extensionRulesetIds` array
4. Creates tracking row in `ruleset_extensions` (UI metadata: name, `updateAvailable` flag)

No entities are copied. They become visible immediately via the source chain.

### Uninstall

1. Validates: user is owner, extension is installed, ruleset not archived
2. **In-use check** (`isExtensionInUseByHost`) — blocks with `ConflictError` if any character on the host has picked an extension-owned entity, either directly or via a host-side COW shadow of one. The shadow case matters because step 3 below hard-deletes those shadows; without this guard the character pick would silently dangle. (Scoped to the host only; fork-of-fork is blocked at policy time so descendant forks aren't a concern. If that ever changes, `existsBy*PickFromExtension` would need to widen the join.)
3. Finds snapshots whose `sourceEntityId` belongs to the extension (COW copies of extension entities)
4. Deletes those COW copies and their snapshots
5. Removes `extensionId` from the array
6. Soft-deletes the tracking row

### Fork Inheritance

When a ruleset with extensions is forked, the child inherits:
- `extensionRulesetIds` — copied as-is
- `ruleset_extensions` metadata rows — duplicated for the child

The child can independently install/uninstall extensions without affecting the parent.

## Authorization

See [docs/access.md](./access.md) for the full policy matrix across rulesets, characters, campaigns, and customizations, plus the listing-scope reference for the create-character wizard. Quick summary for ruleset writes: `canUpdate` (metadata) requires owner or **Admin** contributor; `canUpdateEntity` (content) also accepts **Editor** contributors; `canPublish` / `canSubscribeExtension` / `canUnarchive` / `canManageAdminContributors` are owner-only.

### What `inUse` means in entity-delete services

`inUse` is about one thing: would deletion orphan a character pick on the
**current ruleset or any descendant fork**? Nothing else.

- **Scoping is current + descendants.** The Character* repos' `existsBy*`
  methods take `{ id, rulesetId }` and internally join on `rulesetsInRules`
  with `id = $rulesetId OR $rulesetId = ANY(ancestor_ruleset_ids)` — single
  SQL roundtrip. With forks of forks blocked, descendants of a base ruleset
  are at most one level deep, but the query shape stays the same so the
  guard is robust if depth ever changes. A parent author deleting a feat
  that a downstream fork's character picked is blocked; a fork deleting an
  inherited entity that only the parent's character uses is not (parent's
  characters are unrelated to the fork).

- **Don't include class-side references** (`klass_level_feats`,
  `klass_level_powers`, `klass_skills`, etc.). Class definitions are
  author-owned content: if the author deletes a feat their class grants, the FK
  cascade wipes the grant and the author can fix it. Class-granted feats that a
  character actually picked are recorded on the character
  (`level_feats_in_character.feat_id`), so the character-side check already
  covers that case.

The principle: only protect what the user *invested* in (their character
picks). Author-owned data that breaks via cascade is recoverable by the author.

The shared check lives in `cow.ts` as `entityHasCharacterPicks(tx, entityType,
entityId, rulesetId)` and is reused by every entity-delete service and
`revertOverride`. One helper, one scoping rule, one source of truth.

## Entity Services Pattern

All entity services follow the same COW-aware pattern:

```ts
// Read (list)
const sourceChain = buildSourceChain(ruleset);
const result = await Feats.findManyByRulesetId(db, {
  rulesetId,
  ancestorRulesetIds: sourceChain,
  ...where,
}, pagination);
if (sourceChain.length > 0) {
  const overrideMap = await buildOverrideMap(db, rulesetId, sourceChain);
  result.items = resolveOverrides(result.items, overrideMap);
}

// Write (update/delete) — COW if inherited
const isInherited = sourceChain.includes(entity.rulesetId);
if (isInherited) {
  const cowResult = await cowEntity(tx, "feats", entityId, rulesetId, sourceChain);
  targetId = cowResult.id; // operate on the local copy
}
```

## Legal

Original application code is licensed under [GPL version 3 only](../LICENSE). Third-party game
content is separate: material actually released as Open Game Content retains
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

```
server/
├── rulesets/
│   ├── AbstractDetailedCharacter.ts       ← universal base class
│   ├── RulesetFactory.ts                  ← ruleset module loader
│   ├── types.ts                           ← universal types (ProjectedCharacterData, LevelUpProjector, …)
│   ├── hooks/                             ← universal hook interfaces
│   │   ├── LevelsHooks.ts                 (isAbilityIncreaseLevel, maxSpellLevel, …)
│   │   ├── ClassesHooks.ts
│   │   └── …
│   ├── universal/                         ← ruleset-agnostic sub-components
│   │   ├── DetailedCharacterAbilities.ts
│   │   ├── DetailedCharacterAptitudes.ts
│   │   ├── DetailedCharacterClasses.ts
│   │   ├── DetailedCharacterFeats.ts
│   │   ├── DetailedCharacterModifiers.ts
│   │   ├── DetailedCharacterPowers.ts
│   │   ├── DetailedCharacterRequirements.ts
│   │   ├── DetailedCharacterSavingThrows.ts
│   │   └── DetailedCharacterIdentity.ts
│   └── dnd3.5/                            ← 3.5-specific implementation
│       ├── index.ts                       (RulesetModule impl)
│       ├── types.ts                       (Dnd35ProjectedCharacterData, Dnd35LevelUpProjector)
│       ├── DetailedCharacter.ts           (extends AbstractDetailedCharacter)
│       ├── DetailedCharacterDataLoader.ts
│       ├── DetailedCharacterSkills.ts     (3.5 rank system)
│       ├── DetailedCharacterCombat.ts     (BAB, attacks)
│       ├── DetailedCharacterSpellcasting.ts
│       ├── LevelUpProjector.ts            (3.5 projector impl)
│       ├── TargetPaths.ts
│       ├── buildCharacterResponse.ts      (3.5 API response shape)
│       ├── properties/                    (SPELL_SCHOOL, KLASS_LEVEL_BAB, …)
│       └── hooks/                         (Dnd35LevelsHooks, …)
├── services/
│   ├── characters/
│   │   ├── CharacterLevelsService.ts      ← thin dispatcher; forwards to the ruleset impl
│   │   ├── CharacterInventoryService.ts   ← universal
│   │   ├── CharacterModifiersService.ts   ← universal
│   │   └── levels/
│   │       └── dnd3.5/                    ← 3.5-only level-up flows
│   │           ├── pickQueries.ts
│   │           ├── slotQueries.ts
│   │           ├── preview.ts
│   │           ├── finalize.ts
│   │           ├── helpers.ts
│   │           ├── validation.ts
│   │           └── distribution.ts
│   └── rulesets/                          ← entity CRUD for feats/powers/aptitudes/…
└── routers/
    └── api/
        └── characters/
            └── levels/
                └── dnd3.5/                ← 3.5-shaped HTTP routes
                    └── index.ts
```

### What goes in `universal/` vs `dnd3.5/`

#### Universal (anything of these is a sign the file belongs in `universal/` or is a generic type)

- Takes a level-based character (abilities/class/levels/feats/powers in the abstract) and operates on it.
- No hardcoded game values (spell level = 9, class names, save names, skill rank bounds).
- No `SPELL_SCHOOL` / `WIZARD_PROHIBITED_SCHOOL` / 3.5-specific property constants.
- Doesn't cast to `Dnd35DetailedCharacter` or narrow to 3.5 types.
- Reads per-ruleset values through hooks (`module.hooks.levels.maxSpellLevel`, `module.hooks.levels.isAbilityIncreaseLevel`) instead of hardcoding.

#### Ruleset-specific (signs the file belongs in `dnd3.5/` or a sibling ruleset dir)

- Uses 3.5 concepts in types/signatures: `rank`, `powerLevel` as spell level 0–9, `saveName` as Fortitude/Reflex/Will, class-skill distinctions, wizard prohibited schools, BAB progression.
- References named classes/spells/feats/mechanics: "Wizard Spells", "Fighter Bonus Feat", "Power Attack", "specialization school".
- Computes a 3.5-shaped result: `{ total, available, spent, perlevel }` skill budget, a `computeSkillPointsPerLevel` on the projector, etc.
- Imports from `@/server/rulesets/dnd3.5/*` or casts to a `Dnd35*` type.

### The type split pattern

Universal types keep the narrowest surface that any level-based system could implement. Ruleset-specific types extend the universal ones with ruleset-flavored fields and methods.

```ts
// server/rulesets/types.ts  (universal)
export interface ProjectedCharacterData {
  excludeCharacterLevelIds?: string[];
  characterLevels?: CharacterLevel[];
  feats?: ProjectedFeat[];
  givenFeats?: ProjectedFeat[];
}

export interface LevelUpProjector {
  evaluateClassAvailability(...): Promise<Map<string, boolean>>;
}
```

```ts
// server/rulesets/dnd3.5/types.ts  (extends the universal shape)
export interface Dnd35ProjectedCharacterData extends ProjectedCharacterData {
  skills?: Dnd35ProjectedSkill[];   // adds `rank: number`
  powers?: Dnd35ProjectedPower[];   // adds `powerLevel`, `saveName`
}

export interface Dnd35LevelUpProjector extends LevelUpProjector {
  computeSkillPointsPerLevel(…): Promise<…>;
  getExcludedPowerIds(…): Promise<…>;          // wizard schools
  getSkillBudget(): { total; available; spent; perlevel };
  getCharacterEnrichedSkills(…): (…& { isClassSkill; currentRank })[];
}
```

Services inside `dnd3.5/` annotate locals with the `Dnd35*` variants and cast the projector factory's return type once at the entry point:

```ts
// inside server/services/characters/levels/dnd3.5/…
const projectedData: Dnd35ProjectedCharacterData = { /* skills, powers */ };
const levelUpProjector = rulesetModule.createLevelUpProjector(dc) as Dnd35LevelUpProjector;
```

The cast is local to 3.5 code — generic consumers never see 3.5 vocabulary.

### The hooks pattern

Short per-ruleset predicates / constants live in `server/rulesets/hooks/*` as interfaces, and each ruleset provides an implementation in `dnd3.5/hooks/`:

```ts
// server/rulesets/hooks/LevelsHooks.ts  (universal interface)
export interface LevelsHooks {
  isAbilityIncreaseLevel(totalLevel: number): boolean;
  readonly maxSpellLevel: number;
}

// server/rulesets/dnd3.5/hooks/LevelsHooks.ts  (3.5 impl)
export class Dnd35LevelsHooks implements LevelsHooks {
  readonly maxSpellLevel = 9;
  isAbilityIncreaseLevel(totalLevel: number): boolean {
    return totalLevel > 0 && totalLevel % 4 === 0;
  }
}
```

Universal code that needs a per-ruleset value threads it in rather than hardcoding. `DetailedCharacterAptitudes` takes `maxSpellLevel` as a constructor param; `Dnd35DetailedCharacter` passes `new Dnd35LevelsHooks().maxSpellLevel` when it instantiates the aptitudes sub-component.

Hooks are for **small predicates and constants**. More complex operations (bound to the detailed character, returning rich data, potentially mutating internal state) belong on the ruleset-specific projector or `DetailedCharacter` subclass instead.

### The service split pattern

Services that orchestrate 3.5-shaped flows (level-up, spell selection, wizard school exclusion, skill-point budgeting) live under `server/services/characters/levels/dnd3.5/`. The parent service class (`CharacterLevelsService`) imports the 3.5 impls and exposes them by name. When a second ruleset is added, dispatch moves up to `CharacterLevelsService`:

```ts
// Today
import { getAvailableKlasses } from "./levels/dnd3.5/pickQueries.ts";
// …
export const CharacterLevelsMethods = { getAvailableKlasses, … };

// With multiple rulesets (sketch)
import * as dnd35 from "./levels/dnd3.5/index.ts";
import * as pf2e from "./levels/pf2e/index.ts";

export const CharacterLevelsMethods = {
  getAvailableKlasses: async (session, characterId, where, pagination) => {
    const ruleset = await getCharacterRuleset(characterId);
    if (ruleset.name === "Dungeons & Dragons: 3.5") return dnd35.getAvailableKlasses(session, characterId, where, pagination);
    if (ruleset.name === "Pathfinder 2e")           return pf2e.getAvailableKlasses(session, characterId, where, pagination);
    throw new BadRequestError(`Unsupported ruleset: ${ruleset.name}`);
  },
  …
};
```

Entity CRUD services (`FeatsService`, `PowersService`, `AptitudesService`, `RulesetsService`) are ruleset-agnostic — they operate on rows of the generic schema. These stay in `server/services/rulesets/` and don't get split.

### Routes

Routes that accept 3.5-shaped request bodies (`powerLevel`, `excludeSchools`, wizard-specific aptitude IDs) live under `server/routers/api/characters/levels/dnd3.5/`. The parent `characters/index.tsx` imports the 3.5 variant for now and adds a dispatch layer when a second ruleset lands.

Routes that operate on generic entities (ruleset CRUD, character profile, inventory) are unchanged — they stay at the generic path.

### What's intentionally generic schema, not ruleset-specific

The DB schema includes some concepts that read as D&D-family but are actually **generic primitives**:

- **Aptitudes** (`aptitudesInRules`, `feats_aptitudes`, `powers_aptitudes`) — "named pools of grantable abilities with slot counts." Works for 5e (ASI/feat pools, spells known), PF2e (feat types, spells), etc. 3.5 just happens to use this for "Wizard Spells", "Fighter Bonus Feat", etc.
- **Saves** (`savesInRules`, `klass_level_saves`) — "defense categories with per-class-level progression." Every level-based RPG with a resistance mechanic fits this.
- **Requirements / Modifiers / Properties** — fully generic customization system. Target paths are data, not code. See `docs/customization.md` and `docs/target-paths.md`.

The 3.5-ness in these tables lives in the **seeded values**, not the schema shape. Don't split them.

### How to add a new ruleset

1. **Define the module**: `server/rulesets/<ruleset>/index.ts` implementing `RulesetModule`. Provide `hooks` (levels, classes, skills, …), `createDetailedCharacter`, `createLevelUpProjector`, `seedRuleset`, etc.
2. **Subclass `AbstractDetailedCharacter`** in `server/rulesets/<ruleset>/DetailedCharacter.ts`. Instantiate the universal sub-components (`DetailedCharacterAbilities`, `DetailedCharacterClasses`, …) and any ruleset-specific ones (`<Ruleset>DetailedCharacterSkills`, etc.).
3. **Extend the types** in `server/rulesets/<ruleset>/types.ts`:
   - `<Ruleset>ProjectedCharacterData extends ProjectedCharacterData` (add skill/power shapes if your ruleset has ranked skills or leveled spells).
   - `<Ruleset>LevelUpProjector extends LevelUpProjector` (add any per-level-up operations your ruleset needs beyond `evaluateClassAvailability`).
4. **Mirror the service + router layout** at `server/services/characters/levels/<ruleset>/` and `server/routers/api/characters/levels/<ruleset>/` if your ruleset's level-up flow differs in shape.
5. **Add dispatch at `CharacterLevelsService.ts`** and at `server/routers/api/characters/index.tsx` (the `levels` import). Route by ruleset name or ID.
6. **Register the factory**: add your module to `RulesetFactory.fromRulesetId` so the generic layer can load it.

### How to extend `universal/` without leaking a ruleset

If you need a per-ruleset value in a universal file:
- Add a method or `readonly` field to an existing hook interface (`LevelsHooks`, `ClassesHooks`, …).
- Accept that value as a **constructor param** on the universal class. Default it to the least-surprising value for back-compat. Each ruleset passes its own.
- Do **not** import from `@/server/rulesets/<ruleset>/*` inside `universal/`. If you feel you have to, the file probably doesn't belong in `universal/`.

If you need a per-ruleset behavior too complex for a small hook (takes the detailed character, returns rich data, touches multiple sub-systems), don't bend the hook pattern — make it a method on the ruleset's `LevelUpProjector` / `DetailedCharacter` subclass and let consumers narrow the type at the call site.

### Grey areas and audit findings

An audit on 2026-04-16 identified real leaks and some false alarms:

**Fixed:**
- `MAX_SPELL_LEVEL = 9` was hardcoded in `universal/DetailedCharacterAptitudes.ts` — now an injected param.
- `buildCharacterResponse.ts` lived in `routers/api/` with a cast to `Dnd35DetailedCharacter` — moved to `server/rulesets/dnd3.5/buildCharacterResponse.ts`.
- `server/routers/api/characters/levels/` had 3.5-shaped query params (`powerLevel`, `excludeSchools`) — moved under `dnd3.5/`.

**Not leaks (confirmed generic):**
- `SkillWithRank.rank: number`, `PowerWithPMR.powerLevel: number | null`, `PowerWithPMR.saveName: string | null` — neutral primitive fields with 3.5-flavored seeded content but no schema constraint forcing 3.5 semantics.
- Aptitudes, saves, requirements/modifiers/properties tables — generic primitives; see "What's intentionally generic" above.
- `DetailedCharacterSavingThrows` in `universal/` — iterates generic save data, no 3.5 hardcoding.
- Alignment path in `DetailedCharacterIdentity` — "alignment" is a fantasy-RPG convention, string field value is content-level.

## Key Files

| File | Purpose |
|---|---|
| `server/services/rulesets/cow.ts` | `withRulesetScope` / `withRulesetScopes` (consumer entry points), `cowEntity`, `cowEntityForCustomization`, `buildOverrideMap` (+ `siblingMap`), `resolveOverrides`. The private `mergeSiblingData` helper runs on the COW write path to bake sibling data into newly COW'd local copies. Sibling read-time merging lives in the cache compose step (`server/cache/rulesetCache.ts`). |
| `server/services/RulesetsService.ts` | `forkRuleset`, `publishRuleset`, `archiveRuleset`, `installExtension`, `uninstallExtension` |
| `server/services/policies/RulesetsPolicy.ts` | Authorization checks for all ruleset operations |
| `server/services/rulesets/*.ts` | Entity services (feats, powers, classes, etc.) using the COW pattern |
| `server/repositories/*Repository.ts` | COW-aware SQL queries with snapshot exclusion |
| `server/rulesets/types.ts` | Universal types (`ProjectedCharacterData`, `LevelUpProjector`, `RulesetModule`, …) |
| `server/rulesets/dnd3.5/types.ts` | 3.5 type extensions (`Dnd35ProjectedCharacterData`, `Dnd35LevelUpProjector`) |
| `server/rulesets/AbstractDetailedCharacter.ts` | Universal base class; ruleset subclasses extend it |
| `server/rulesets/universal/*.ts` | Ruleset-agnostic sub-components (abilities, classes, feats, requirements, …) |
| `server/rulesets/hooks/*.ts` | Universal hook interfaces (`LevelsHooks`, `ClassesHooks`, …) |
| `server/rulesets/dnd3.5/*.ts` | 3.5 implementation (DetailedCharacter, LevelUpProjector, TargetPaths, hooks, properties, buildCharacterResponse) |
| `server/rulesets/dnd3.5/DetailedCharacter.ts` | Character builder — merges sibling requirements and modifiers at runtime via `siblingMap` |
| `database/packages/dnd35/seed-utils.ts` | `cowFeatIntoExtension` — reusable helper for COW-ing base feats into extension seeds |
| `tests/services/ExtensionsService.test.ts` | Extensions, COW, fork inheritance, merge, name conflicts, publish validation, sibling merge (feats + powers: aptitudes, requirements, modifiers across all endpoints) |
| `tests/services/RulesetsService.test.ts` | Includes `extension siblingMap` test block — sibling detection, filtering, requirement/modifier/aptitude merging |
