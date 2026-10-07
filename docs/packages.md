# Content Packages

Content packages deliver seed data (base rulesets, extensions) with version tracking. The runner (`database/packages/runner.ts`) installs the packages a database lacks and brings the others up to date. `rules.content_packages` records each database's version of each package.

## Pipeline overview

```
dndtools.net HTML → Scraper → reference JSON (raw + overrides) → Generator → generated TypeScript → package seeds
                                                   ↑
                                         Human corrections
```

Most content is generated from scraped SRD pages. A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else. See [Reference files](#reference-files) and `database/packages/dnd35-from-parser/README.md` for the scraper and generator.

## Package types

| Type | `type` | Purpose |
|------|--------|---------|
| Base ruleset | `"base_ruleset"` | Full game system (abilities, skills, classes, feats, spells) |
| Extension | `"extension"` | Supplement that adds content to the base ruleset |

## Structure

```
database/packages/
├── types.ts              # ContentPackage
├── runner.ts             # applyPackages: installs and updates the registered packages
├── registry.ts           # The packages, in the order they're applied
└── dnd35/
    ├── index.ts          # The core rules package
    ├── names.ts          # Ruleset display names
    ├── extensions/       # One file per extension package
    ├── content/          # What the data is written with: a folder per kind of content, its types, its builders and the tables they read
    │   ├── customization/    # Requirement, modifier and property types; eq(), gte(), or(), feat(), bonus()…
    │   ├── items/            # ItemSeed; the weapon, armor and shield tables, their properties and proficiencies (simple(), martial()…)
    │   ├── classes/          # ClassSeed
    │   ├── feats/, spells/, races/, domains/   # FeatSeed; PowerSeed, SpellSeed; RaceSeed; DomainSeed
    │   ├── wizardSchools/    # WizardSchoolSeed
    │   ├── bonds/            # BondContent; "a Cat", "an Owl" for the bonds' descriptions
    │   ├── abilities/, saves/, skills/, languages/   # The core rules' own: AbilitySeed, SaveSeed…
    │   └── rulesets/         # CoreContent, BookContent: what a ruleset is seeded with
    ├── data/             # The hand-written data
    │   ├── core.ts           # The core ruleset, its abilities, saves, skills, languages, and CORE: all it's seeded with
    │   ├── skills.ts, creatureTypes.ts, templateItems.ts
    │   ├── bonds/            # Familiars, animal companions, special mounts
    │   └── feats/            # The feats no reference lists: the core's (coreFeats.ts: the wizard's schools, the weapon feats, favored enemy), Complete Divine's deity's weapon
    └── seed/             # What writes it to the database
        ├── BaseSeeder.ts     # A seeder's core: its database, its context (SeedContext), the rows and inserts every step shares
        ├── RulesetSeeder.ts  # createCore, createExtension; seedCore, seedBook: the steps made of steps
        ├── concerns/         # A step per kind of row: SeedsFeats, SeedsClasses, CopiesOnWrite…
        └── spellTable.ts     # A spellcaster's table: the class level each of its spell levels opens at

database/packages/dnd35-from-parser/
├── reference/            # Scraped JSON (raw + overrides)
├── generated/            # Written by the generator only, one folder per book
│   ├── srd/              #   The core rules
│   └── dmg/, complete-warrior/, …   # Each extension book; every book has an index.ts exporting BOOK
└── tools/                # Scraper, generator, validate, overrides
    ├── cli/              # The commands (parser:scrape, generate, sync, overrides, validate) and their arguments
    ├── types/            # A reference's types, a module per kind of reference
    ├── references/       # The reference files (References): finding, reading, writing and loading them, what's derived resolved by each kind's detector
    ├── scraper/          # Pages → reference/
    │   ├── BaseScraper.ts    # A scraper's core: its book and its slug, its HttpClient, the listings, a reference's meta, saving it
    │   ├── Scraper.ts        # A concern per kind of reference (concerns/): ScrapesClasses, ScrapesFeats…
    │   └── pages/            # A page's HTML → what its reference stores: a class per kind of page (Page, DndToolsPage, FeatPage…; class/ClassPage with its concerns)
    ├── detect/           # A reference's raw → its detected and mapping: a detector per kind on a BaseDetector (ClassDetector in classes/, with its concerns, its ClassTable and FeatureText readers, its ClassMapping and ClassPools; FeatDetector, SpellDetector…)
    │   └── readers/          # What a text says, a reader class each: requirements/ (RequirementReading and its concerns; FeatPrerequisites, ClassPrerequisites), modifiers/ (BonusText, a reading per kind of text), items/ (MagicItemText, MagicItemMetadata); the target paths a reading's must be (TargetPaths)
    ├── text/             # The scraped text: sanitized, normalized, entry names, amounts (cost, weight), stable JSON
    ├── vocabulary/       # The names the books give abilities, saves, skills, races and numbers, their slugs and paths, a feat family's options, and the core rules' book: a module per subject
    ├── seeds/            # A book's seeds (BookSeeds, one per book on the Library), a class per kind built once per reference (FeatSeeds, SpellSeeds…; a class's: classes/ClassSeeds.ts); what a book copies and the aptitudes it uses, its concerns
    ├── validate/         # What parser:validate reports, and the overrides that change nothing
    └── generator/        # The seeds → generated/
        ├── BaseGenerator.ts  # A generator's core: the folder it writes to, the files it wrote, the writes kinds of files share
        ├── Generator.ts      # generateBook: a book's files, whole; generateAll, generateReference pick the books
        ├── concerns/         # A kind of file per concern: GeneratesClasses, GeneratesFeats…
        ├── bookLayout.ts     # A book's generated tree: each file's path and the list it exports, which the writers and the indexes name
        └── code/             # A file's code, written from its seeds: CodeFile (BaseCodeFile: its lines, its imports, the customization values), a concern per kind of seed (WritesClasses, WritesFeats…)
```

`content/` and `data/` never touch the database: the generated data, the parser and the seeds import them. `generated/` holds only what the generator writes; hand-written content goes in `data/`, what content is written with in `content/`, which imports none of them (`arkyvree/layers`): a table a builder reads (the weapons, the armor) is content.

## How seeds work

A `RulesetSeeder` seeds a ruleset step by step: a step that writes one kind of row is a concern (`seed/concerns/`), and the steps made of others (`seedCore`, `seedBook`, `seedBond`, `seedDomains`) are the class's own. It holds a `SeedContext`: the ruleset it writes to and the ids, by name, of the rows its content names (abilities, saves, skills, aptitudes, feats, powers). Seeding aptitudes, feats or powers adds them to it, so the steps after can name them. It holds no content: the core rules' package creates the core ruleset and seeds it with `CORE` (`data/core.ts`):

```ts
seeds: [
  async (db) => {
    const seeder = await RulesetSeeder.createCore(db, CORE_RULESET);
    await seeder.seedCore(CORE);
  },
],
```

The dev seeds (`database/seeds`) and the tests load the same context for the seeded ruleset (`RulesetSeeder.loadContext`).

An extension is a package file that seeds its book:

```ts
const dnd35Dmg: ContentPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, { name: DND35_DMG_NAME, description: "…" });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
};
```

`BOOK` (`generated/<book>/index.ts`) is the book's content as the generator wrote it. `RulesetSeeder.createExtension` creates the extension ruleset with the core's context; `seedBook` adds the aptitudes the core lacks, seeds the feats, spells, domains (whose spell levels open at the core cleric's) and classes, and copies the core feats and spells the book changes (see [COW](#cow-ing-core-entities-into-extensions)). A book's hand-written additions are added to `BOOK` in its package file (Complete Divine adds `DEITYS_WEAPON_FEATS`), and so are the core rules' to the SRD's `BOOK` in `data/core.ts` (its hand-written feats, `buildCoreFeats`, its rules and its bonded creatures): no generated file wraps hand-written content.

### Adding an extension

1. Add the book to the scraper (its slug in `tools/scraper/BaseScraper.ts`), scrape it, and generate it (`bun run parser:generate <book>`).
2. Add its display name to `names.ts` and a package file under `extensions/` with `seedsVersion: 1`.
3. Register it in `registry.ts`, after the core rules.

## Versioning & updates

A package's `seeds` install it at `seedsVersion`. A change after that goes in `updates`, keyed by the version it brings the package to (`seedsVersion + 1`, `+ 2`…), and the package's version becomes its last update's:

- A new database runs the seeds, then every update.
- An existing database runs the updates past its version.
- A database older than `seedsVersion` is refused: the updates it lacks are now part of the seeds, so none can bring it up to date. The runner checks every package first and applies none if one is refused. Reset a development database; any other needs those updates back (from git history) until it has them. `bun run prod:diff` (`scripts/ops/diff/diff-prod.ts`) shows whether production's versions would be refused before a deploy. With `REFERENCE_DATABASE_URL` set to a freshly seeded database, it also compares every row the seeds write (`scripts/ops/diff/content.ts`); `tests/scripts/ops/diff/content.test.ts` fails when a table or a column isn't compared.

```ts
const dnd35Dmg: ContentPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, { name: DND35_DMG_NAME, description: "…" });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
  updates: {
    17: addTheMissingFeat,
  },
};
```

Once every database has an update (production, staging and any other shared database: the runner refuses one below the new `seedsVersion`), fold it: change the seeds so a new database gets the same rows, drop the update, and raise `seedsVersion` to its version. The seeds alone then describe the package. Check a fold by seeding a new database both ways and comparing their content.

## Reference files

A reference file (`reference/<book>/…json`) has three parts:

- **`_meta`** — its type, book and source.
- **`raw`** — what the scraper read. Re-scraping replaces it.
- **`overrides`** — corrections made by hand. Re-scraping keeps them. Nothing else in the file is hand-edited.

What the generator reads is derived from the two each time a reference is loaded (`References`, which derives them with the detectors in `tools/detect/`): `detected` (BAB, saves, requirements, modifiers… parsed from `raw`; wizard schools have none) and `mapping` (each entity as the seeds make it, its overrides applied, which win over both). The seeds read the mapping, never the overrides. So a correction takes effect at the next `parser:generate`, and can't be lost to a re-scrape. See `reference/README.md` for a class reference's shape.

`bun run parser:validate` lists:
- unresolved detections, and items without a definition (the generator leaves them out), not yet listed in `overrides.reviewed`; and entries of `overrides.reviewed` that cover none of them, or repeat one;
- classes the generator refuses;
- class overrides that change nothing (they hold what's derived without them) or that the generator ignores;
- values the seed refuses, such as a race's size or a magic item's slot. These can't be marked reviewed: correct the value with an override, or skip the entry;
- references of a type the tools don't read (a misspelled `_meta.type`).

## COW-ing core entities into extensions

When an extension changes a core entity (a feat its classes take in more aptitudes, a spell it adds to its spell lists), it copies it (copy on write) rather than recreating it: `seed/concerns/CopiesOnWrite.ts` copies the entity and its customizations and records the copy in `entity_snapshots`, the same way a fork does. Each extension book's generated `cowFeats.ts` and `cowSpells.ts` list what it changes (`tools/seeds/copies.ts`).

### Aptitude ownership rules

Aptitudes are named pools with no per-ruleset content of their own — just a `name`. So the seed only creates an aptitude row in the ruleset that *introduces* the name. `seedBook` splits the book's aptitudes into:

- **Already in the core** (e.g. `General`, `Fighter Bonus Feat`, `Cleric Domain`) — skipped; the extension references the core's row. Same pattern a user fork uses when adding a new feat tagged `General`.
- **Not in the core** — inserted as a new row in the extension. Covers both extension-private names (e.g. `Ronin Bonus Feat`) and sibling-shared class spell lists (e.g. `Assassin Spells`, which multiple extensions independently create because siblings can't FK to each other: a book copies each list of another book its spells are on, a class's by their level line or one drawing on others' lists, `Sublime Chord Spells`).

Consequences for link rows (`feats_aptitudes`, `powers_aptitudes`, `klass_level_feats`, `klass_level_powers`):

- Links targeting a core name point at the core's `aptitude_id`.
- Links targeting an extension-owned name point at the extension's own `aptitude_id`.
- Every raw row satisfies the invariant: *the aptitude's ruleset is on the entity's source chain.* No cross-sibling FKs in the raw data; the runtime sibling mechanism handles cross-extension visibility.

A copy keeps the original's aptitude links, with the core's `aptitude_id`.

## Registry

All packages are registered in `database/packages/registry.ts`. The runner applies them in order: the core rules first, then its extensions.

```bash
bun db:packages    # Apply all registered packages
```

## Rules

### Do

- Use the scraper and generator for new content; hand-write only what no page provides, in `data/`
- Correct scraped content in `overrides`, the only hand-edited part of a reference file
- Make update functions idempotent (upserts, guard clauses) so retries are safe
- Use display name constants from `names.ts` to query rulesets
- Always add modifiers and requirements when the source material defines them

### Do not

- Never delete seed data — characters reference rows by ID
- Never fix deployed data by changing the seeds alone. A data fix changes the seeds (or the parser's output) for new databases, and its PR carries the SQL that brings existing ones in line, run in production once it merges; `bun run prod:diff` with a freshly seeded `REFERENCE_DATABASE_URL` then finds no drift. Add an `updates` entry instead only when that SQL would be too large or risky to run by hand
- Never add requirements to existing feats/class features without careful consideration — it can retroactively invalidate characters
- Never remove or reorder an update some database doesn't have yet, and never skip a version in `updates`
- Never hardcode entity IDs — always look them up by name
- Never edit `generated/` by hand — regenerate it
