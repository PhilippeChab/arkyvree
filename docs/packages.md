# Content Packages

Content packages deliver seed data (base rulesets, extensions) with version tracking. The runner installs new packages and applies incremental updates to existing ones.

## Pipeline overview

```
dndtools.net HTML → Scraper → JSON reference files → Generator → TypeScript seed files
                                     ↑
                               Human annotates
                               mapping section
```

Content is auto-generated from scraped SRD pages, not hand-written. The `mapping` section of each reference JSON is the only place for manual overrides — `raw` and `detected` are rebuilt on every re-scrape.

See `database/packages/dnd35-from-parser/README.md` for scraper/generator usage.

## Package types

| Type | `type` | `baseRuleset` | Purpose |
|------|--------|---------------|---------|
| Base ruleset | `"base_ruleset"` | — | Full game system (abilities, skills, classes, feats, spells) |
| Extension | `"extension"` | parent package name | Supplement that adds content to a base ruleset |

## Package structure

Base rulesets:

```
database/packages/<system>/
├── index.ts          # ContentPackage definition (default export)
├── names.ts          # Display name constants
├── seed-utils.ts     # Shared seed helpers (barrel export)
├── seed-utils/       # Helper implementations
└── v1/               # Initial seed data
```

Extensions:

```
database/packages/<system>/extensions/<name>/
├── index.ts          # ContentPackage definition
└── v1/
    └── seed.ts       # Imports generated data, calls seedExtension()
```

Generated data:

```
database/packages/dnd35-from-parser/
├── generated/        # Auto-generated TypeScript from reference JSON
│   ├── srd/          # Base SRD content
│   ├── dmg/          # DMG extension content
│   ├── complete-warrior/
│   └── ...
├── reference/        # Scraped JSON files (raw + detected + mapping)
└── tools/
    ├── scraper/      # HTML → JSON reference
    ├── generator/    # JSON reference → TypeScript seed files
    └── buildSeeds.ts # Reference JSON → seed object conversion
```

## How seeds work

Extension v1 seeds are thin wrappers that import generated data and call `seedExtension()`:

```ts
import { seedExtension } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/classes/index.ts";
import { ALL_STANDALONE_FEATS, ALL_CLASS_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/feats/index.ts";
// ... other generated imports

export default async function seed(db: Db) {
  await seedExtension(db, {
    name: DND35_COMPLETE_WARRIOR_NAME,
    description: "...",
    aptitudeNames: ALL_APTITUDES,
    standaloneFeats: ALL_STANDALONE_FEATS,
    classFeats: ALL_CLASS_FEATS,
    cowFeats: COW_FEATS,
    spells: ALL_SPELLS,
    cowSpells: COW_SPELLS,
    domains: ALL_DOMAINS,
    classes: ALL_CLASSES,
  });
}
```

`seedExtension()` handles: creating the extension ruleset, fetching base data maps, inserting aptitudes, seeding feats/spells/domains/classes, and COW-ing base entities.

## Versioning & updates

- `seeds` runs once on first install (establishes v1)
- `version` starts at 1 — bump it when data needs to change
- `updates` is keyed by target version number
- Fresh install: runs `seeds` then `updates[2]` → `updates[version]`
- Existing DB: runs `updates[appliedVersion + 1]` → `updates[version]`

### Adding an update

1. Bump `version`
2. Add a matching entry in `updates`
3. Write the update function in `v<N>/seed.ts`

```ts
const myExtension: ContentPackage = {
  name: "dnd35-complete-warrior",
  version: 3,        // bumped from 2
  seeds: [...],
  updates: {
    2: existingUpdate,
    3: newFixOrAddition,
  },
};
```

## Reference JSON & mapping

Each scraped entity produces a JSON reference file with three sections:

- **`raw`** — Scraped data from the HTML page. Never manually edited. Regenerated on re-scrape.
- **`detected`** — Auto-computed values (BAB type, save types, requirements, modifiers). Regenerated on re-scrape.
- **`mapping`** — Human-annotated overrides. Preserved across re-scrapes.

The generator uses `mapping` values when present, falling back to `detected`:
- `buildFeatSeeds` uses `mapping.requirements ?? detected.requirements`
- `buildClassSeeds` uses `mapping.overrides.requirements ?? detected.requirements`
- Set `mapping.modifiers = []` to explicitly suppress auto-detected modifiers

**Customizations MUST go in `mapping`, not `detected`** — `detected` is rebuilt from scratch on every re-scrape.

## COW-ing base entities into extensions

When an extension needs to modify a base entity (e.g., adding prestige class requirements to a base feat), it must COW it — not recreate it as a duplicate.

The generated `cowFeats.ts` and `cowSpells.ts` files define which base entities need COW-ing and what aptitude links to add. `seedExtension()` calls `cowFeatsIntoExtension()` and `cowSpellsIntoExtension()` automatically.

For manual COW in update seeds, use `cowFeatIntoExtension` from `seed-utils/cow-feat.ts`:

```ts
import { cowFeatIntoExtension } from "../../seed-utils.ts";
const copyId = await cowFeatIntoExtension(db, baseFeatId, extensionId);
```

### Aptitude ownership rules

Aptitudes are named pools with no per-ruleset content of their own — just a `name`. So the seed only creates an aptitude row in the ruleset that *introduces* the name. `seedExtension` splits `aptitudeNames` into:

- **Already in an ancestor** (e.g. `General`, `Fighter Bonus Feat`, `Cleric Domain`) — skipped; the extension references base's row via `aptMap`. Same pattern a user fork uses when adding a new feat tagged `General`.
- **Not in any ancestor** — inserted as a new row in the extension. Covers both extension-private names (e.g. `Ronin Bonus Feat`) and sibling-shared class spell lists (e.g. `Assassin Spells`, which multiple extensions independently create because siblings can't FK to each other).

Consequences for link rows (`feats_aptitudes`, `powers_aptitudes`, `klass_level_feats`, `klass_level_powers`):

- Links targeting a base-inherited name point at base's `aptitude_id`.
- Links targeting an extension-owned name point at the extension's own `aptitude_id`.
- Every raw row satisfies the invariant: *the aptitude's ruleset is on the entity's source chain.* No cross-sibling FKs in the raw data; the runtime sibling mechanism handles cross-extension visibility.

`cowFeatIntoExtension` / `cowFeatsIntoExtension` / `cowSpellsIntoExtension` respect this by copying base's `aptitude_id` unchanged for inherited links and adding new links only for aptitude names the extension owns.

## Seed helpers

The `seed-utils.ts` barrel provides:

- `seedExtension()` — full extension seeding pipeline
- `seedFeats()` — bulk feat insert with requirements, modifiers, aptitude links
- `seedClass()` — class insert with levels, saves, skills, features, spell tables
- `seedPowers()` — spell insert with aptitude links, levels, DC abilities, properties
- `seedDomains()` — domain insert with spell lists, granted power modifiers
- `cowFeatIntoExtension()` / `cowFeatsIntoExtension()` — COW single/batch feats
- `cowSpellsIntoExtension()` — COW spells from other books
- Requirement builders: `eq()`, `gte()`, `or()`, `and()`, `feat()`, `eqStr()`, `classReq()`

## Registry

All packages are registered in `database/packages/registry.ts`. The runner processes them in order, installing new packages and applying updates to existing ones.

```bash
bun db:packages    # Apply all registered packages
```

## Rules

### Do

- Use the scraper/generator pipeline for new content — don't hand-write seed arrays
- Annotate overrides in `mapping.overrides`, not `detected`
- Make update functions idempotent (upserts, guard clauses) so retries are safe
- Use display name constants from `names.ts` to query rulesets
- Always add modifiers and requirements when the source material defines them
- Strip `mapping.features` to `{}` and resync to verify changes end-to-end

### Do not

- Never delete seed data — characters reference rows by ID
- Never modify seed files to fix deployed data — bump the version and add an `updates` entry
- Never add requirements to existing feats/class features without careful consideration — it can retroactively invalidate characters
- Never remove or reorder entries in `updates`
- Never hardcode entity IDs — always query by name
- Never skip a version number in `updates`
- Never put customizations in `detected` — they'll be wiped on re-scrape
