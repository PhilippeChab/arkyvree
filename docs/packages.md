# Content Packages

Content packages deliver seed data (base rulesets, extensions) with version tracking. A package is data, in its ruleset's content (`content/<ruleset>/packages/`): its name, its type, the version its seeds install, the ruleset it creates and the content it seeds. The runner (`database/packages/runner.ts`) installs the packages a database lacks and brings the others up to date, each written by its ruleset's seeder. `rules.content_packages` records each database's version of each package.

## Pipeline overview

```
dndtools.net HTML → Scraper → reference JSON (raw + overrides) → Generator → generated TypeScript → package seeds
                                                   ↑
                                         Human corrections
```

Most content is generated from scraped SRD pages. A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else. See [Reference files](#reference-files) and `codegen/dnd3.5/README.md` for the scraper and generator.

## Package types

| Type | `type` | Purpose |
|------|--------|---------|
| Base ruleset | `"base_ruleset"` | Full game system (abilities, skills, classes, feats, spells) |
| Extension | `"extension"` | Supplement that adds content to the base ruleset |

## Structure

```
database/
├── packages/             # The runner and the registry: which packages a database gets, and the seeds that write them
│   ├── types.ts          # ContentPackage: a package as the runner applies it (its seeds, its updates)
│   ├── runner.ts         # applyPackages: installs and updates the registered packages
│   ├── registry.ts       # The packages, in the order they're applied: each its definition (content/), with its seeder's seed
│   └── contentPackages.ts  # toContentPackage: a definition and the seed that writes it, as the runner applies them
├── seeders/              # What writes content to the database
│   ├── core/
│   │   └── ContentSeeder.ts  # What every ruleset's seeder runs on: its database and context, the customizations' rows and inserts, an extension's copies, a system ruleset
│   └── dnd3.5/
│       ├── BaseSeeder.ts     # The 3.5 seeder's core, on ContentSeeder: its context (SeedContext), what its spell lists write
│       ├── RulesetSeeder.ts  # createCore, createExtension; seedCore, seedBook: the steps made of steps
│       ├── concerns/         # A step per kind of row: SeedsFeats, SeedsClasses, CopiesOnWrite…
│       ├── packages.ts       # seedDnd35Package: a 3.5 package's ruleset created, and its content seeded in it
│       └── spellTable.ts     # A spellcaster's table: the class level each of its spell levels opens at
└── seeds/                # The dev and test databases' seed scripts: the users, the characters (seedCharacter, seedContext)

content/core/
└── builders/
    ├── customization/    # What every ruleset's content writes its customizations with: eq(), gte(), or(), bonus(), setFlag()…, their types
    └── packages/         # PackageDefinition: a package as data (its name, type, seedsVersion, ruleset and content)

content/dnd3.5/
├── baseRules.ts          # DND35_BASE_RULES: the base rules the content is written for, which the seeders ask the engine by
├── rulesetNames.ts       # The system rulesets' display names
├── builders/             # What the content is written with: a type per kind of seed, and the functions that write a seed's parts
│   ├── items/            # ItemSeed; an item's properties (weaponProperties()…) and proficiencies (simple(), martial()…)
│   ├── classes/          # ClassSeed
│   ├── feats/, spells/, domains/   # FeatSeed, a feat's path and grant (feat(), grantFeat()); PowerSeed, SpellSeed; DomainSeed
│   ├── races/            # RaceSeed; a race's properties (QUADRUPED)
│   ├── aptitudes/        # How the content names its spell lists and picks (classSpells(), domainFeat(), CLERIC_DOMAIN…)
│   ├── wizardSchools/    # WizardSchoolSeed
│   ├── bonds/            # BondContent; "a Cat", "an Owl" for the bonds' descriptions
│   ├── abilities/, saves/, skills/, languages/   # The core rules' own: AbilitySeed, SaveSeed…
│   ├── characters/       # CharacterSeed: a seeded character
│   └── rulesets/         # CoreContent, BookContent: what a ruleset is seeded with; CorePackage, ExtensionPackage
├── data/                 # The hand-written rows, which no book's page gives
│   ├── coreRules.ts      # The core rules' abilities, saves, skills and languages
│   ├── bonds/            # Familiars, animal companions, special mounts
│   └── feats/            # The feats no reference lists: the core's (coreFeats.ts: the wizard's schools, the weapon feats, favored enemy), Complete Divine's deity's weapon
├── packages/             # Each package as data: its name, type, seedsVersion, ruleset and content
│   ├── core.ts           # DND35_CORE_PACKAGE, and CORE: the SRD's book joined to the hand-written core content
│   └── extensions/       # One file per extension package (DND35_DMG_PACKAGE…): its book, and its hand-written additions
├── testData/             # The dev and test databases' own data: the seed user's characters (CHARACTERS, a module each in characters/)
└── generated/            # Written by the generator only, one folder per book
    ├── srd/              #   The core rules
    └── dmg/, complete-warrior/, …   # Each extension book; every book has an index.ts exporting BOOK

codegen/core/             # What every ruleset's codegen runs on
├── GeneratedFolder.ts    # The folder a generation writes: a run in a copy that replaces it whole (generateAtomically), the files it wrote
├── code/GeneratedCode.ts # A generated file's code: its lines, its imports, how a value is written, the customization values (its content types' and names' modules are the ruleset's)
├── scraper/              # HttpClient (a site's pages, cached, paced, retried; a site's clean-up its own), Page (a page's document, sections, headings)
└── text/                 # Stable JSON, whitespace

codegen/dnd3.5/
├── reference/            # Scraped JSON (raw + overrides)
└── tools/                # Scraper, generator, validate, overrides
    ├── cli/              # The commands (parser:scrape, generate, sync, overrides, validate), each reading its line through CommandLine
    ├── types/            # A reference's types, a module per kind of reference
    ├── references/       # The reference files (References): finding, reading, writing and loading them, what's derived resolved by each kind's detector
    ├── scraper/          # Pages → reference/
    │   ├── BaseScraper.ts    # A scraper's core: its book and its slug, its HttpClient (codegen/core), the listings, a reference's meta, saving it
    │   ├── Scraper.ts        # A concern per kind of reference (concerns/): ScrapesClasses, ScrapesFeats…
    │   └── pages/            # A page's HTML → what its reference stores: a class per kind of page on core's Page (DndToolsPage, FeatPage…; class/ClassPage with its concerns)
    ├── detect/           # A reference's raw → its detected and mapping: a detector per kind on a BaseDetector (ClassDetector in classes/, with its concerns, its ClassTable and FeatureText readers, its ClassMapping and ClassPools; FeatDetector, SpellDetector…)
    │   └── readers/          # What a text says, a reader class each: requirements/ (RequirementReading and its concerns; FeatPrerequisites, ClassPrerequisites), modifiers/ (BonusText, a reading per kind of text), items/ (MagicItemText, MagicItemMetadata); the target paths a reading's must be (TargetPaths)
    ├── text/             # The scraped text: sanitized (the site's HTML and the books' references), normalized, entry names, amounts (cost, weight)
    ├── vocabulary/       # The names the books give abilities, saves, skills, races and numbers, their slugs and paths, a feat family's options, and the core rules' book: a module per subject
    ├── seeds/            # A book's seeds (BookSeeds, one per book on the Library), a class per kind built once per reference (FeatSeeds, SpellSeeds…; a class's: classes/ClassSeeds.ts); what a book copies and the aptitudes it uses, its concerns
    ├── validate/         # What parser:validate reports: a reference's issues (ReferenceIssues, its ReviewList), what a class's overrides change (ClassOverridesCheck)
    └── generator/        # The seeds → content/dnd3.5/generated/
        ├── Generator.ts      # Picks the books (generateAll, generateReference) and generates each whole, a BookGenerator each
        ├── BookGenerator.ts  # A book's files, from its seeds (BaseBookGenerator: the book, its seeds, the writes kinds of files share)
        ├── concerns/         # A kind of file per concern: GeneratesClasses, GeneratesFeats…, GeneratesIndexes
        ├── ClassFiles.ts     # A class's files, composed once: the generator writes them, parser:validate checks an override against them
        ├── BookLayout.ts     # A book's generated tree: each file's path and the list it exports, which the writers and the indexes name
        └── code/             # A file's code, written from its seeds: CodeFile (BaseCodeFile, on core's GeneratedCode: where the 3.5 content types and names come from), a concern per kind of seed (WritesClasses, WritesFeats…) and WritesIndexes
```

`content/dnd3.5/` is data: it never touches the database, and imports none of what reads or writes it (`arkyvree/layers`). Each ruleset's folders are its own, and what every ruleset's content, codegen and seeders share is the core's (`content/core/`, `codegen/core/`, `database/seeders/core/`), which names no ruleset (`arkyvree/ruleset-folders`). The seeders and the codegen import it; the engine and the server read none of it, and the content reaches the server through the database, which the packages seed.

Each of its folders has one role, which `arkyvree/layers` holds:

- `builders/` is what the content is written with, and imports nothing written in it (`data/`, `generated/`, `packages/`, `testData/`).
- `data/` holds the hand-written rows. It reads nothing the codegen writes (`generated/`, `packages/`), so the codegen can read it: the SRD's generated aptitudes cover the core's hand-written feats' (`buildCoreFeats`).
- `generated/` holds only what the generator writes, and wraps no hand-written content (it imports nothing of `data/` or `packages/`).
- `packages/` gathers them: a package's content is its book (`BOOK`, `generated/<book>/index.ts`) and the hand-written rows it adds (the core rules' `CORE`, Complete Divine's deity's weapon feats).
- The books' facts the builders and the data read (the weapon, armor and shield tables, the skills' and the creature types' names, a feat family's name) are the ruleset's vocabulary (`vocabulary/dnd3.5/`), as the engine's are.

The codegen reads `builders/`, `data/` and the vocabulary, never the generated books it writes nor the packages that gather them. A seeder (`database/`) reads what a package seeds from its definition (`packages/`), never a module of `data/` or `generated/`.

## How seeds work

A package is data (`content/dnd3.5/packages/`): the core rules' creates the core ruleset and seeds it with `CORE` (`packages/core.ts`), the SRD's book joined to the hand-written core content:

```ts
export const DND35_CORE_PACKAGE: CorePackage = {
  name: "dnd35",
  type: "base_ruleset",
  seedsVersion: 49,
  ruleset: { name: DND35_RULESET_NAME, description: "…" },
  content: CORE,
};
```

The registry (`database/packages/registry.ts`) gives the runner each package's definition with the seed that writes it, its ruleset's seeder's (`toContentPackage(DND35_CORE_PACKAGE, seedDnd35Package)`). A ruleset's seeder extends `ContentSeeder` (`database/seeders/core/`), what every ruleset's seeding writes with: the customizations' rows and their inserts, the copies an extension makes of the entities it changes, and the system rulesets a package creates, of the base rules it names. 3.5's `seedDnd35Package` (`database/seeders/dnd3.5/packages.ts`) creates a package's ruleset and seeds its content with `RulesetSeeder`, which seeds a ruleset step by step: a step that writes one kind of row is a concern (`concerns/`), and the steps made of others (`seedCore`, `seedBook`, `seedBond`, `seedDomains`) are the class's own. It holds a `SeedContext`: the ruleset it writes to and the ids, by name, of the rows its content names (abilities, saves, skills, aptitudes, feats, powers). Seeding aptitudes, feats or powers adds them to it, so the steps after can name them. It holds no content: a package gives it.

The dev seeds (`database/seeds`, which seed the characters of `content/dnd3.5/testData/`) and the tests load the same context for the seeded ruleset (`RulesetSeeder.loadContext`).

The fields the rules keep in an entity's properties (a class's, a level's, a skill's, the ruleset's own) are seeded as the engine keeps them (`Engine.forRules(DND35_BASE_RULES).toEntityProperties`), from the fields the content gives.

An extension is a package file that seeds its book:

```ts
export const DND35_DMG_PACKAGE: ExtensionPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  ruleset: { name: DND35_DMG_NAME, description: "…" },
  content: BOOK,
};
```

`BOOK` (`content/dnd3.5/generated/<book>/index.ts`) is the book's content as the generator wrote it. `RulesetSeeder.createExtension` creates the extension ruleset with the core's context; `seedBook` adds the aptitudes the core lacks, seeds the feats, spells, domains (whose spell levels open at the core cleric's, of `CORE`) and classes, and copies the core feats and spells the book changes (see [COW](#cow-ing-core-entities-into-extensions)). A book's hand-written additions are joined to its `BOOK` in its package file (Complete Divine's `content` adds `DEITYS_WEAPON_FEATS`), as the core rules' are to the SRD's `BOOK` in `packages/core.ts` (its hand-written feats, `buildCoreFeats`, its rules and its bonded creatures): no generated file wraps hand-written content.

### Adding an extension

1. Add the book to the scraper (its slug in `codegen/dnd3.5/tools/scraper/BaseScraper.ts`), scrape it, and generate it (`bun run parser:generate <book>`).
2. Add its display name to `content/dnd3.5/rulesetNames.ts` and a package file under `content/dnd3.5/packages/extensions/` with `seedsVersion: 1`.
3. Register it in `database/packages/registry.ts`, after the core rules (`toContentPackage(DND35_X_PACKAGE, seedDnd35Package)`).

## Versioning & updates

A package's seeds install it at its definition's `seedsVersion` (`content/<ruleset>/packages/`). A change after that goes in `updates`, keyed by the version it brings the package to (`seedsVersion + 1`, `+ 2`…), and the package's version becomes its last update's. An update writes, so it's the database's: its registry entry gives it, beside the definition's seed:

- A new database runs the seeds, then every update.
- An existing database runs the updates past its version.
- A database older than `seedsVersion` is refused: the updates it lacks are now part of the seeds, so none can bring it up to date. The runner checks every package first and applies none if one is refused. Reset a development database; any other needs those updates back (from git history) until it has them. `bun run prod:diff` (`scripts/ops/diff/diff-prod.ts`) shows whether production's versions would be refused before a deploy. With `REFERENCE_DATABASE_URL` set to a freshly seeded database, it also compares every row the seeds write (`scripts/ops/diff/content.ts`); `tests/scripts/ops/diff/content.test.ts` fails when a table or a column isn't compared.

```ts
export const registry: ContentPackage[] = [
  // …
  { ...toContentPackage(DND35_DMG_PACKAGE, seedDnd35Package), updates: { 17: addTheMissingFeat } },
];
```

Once every database has an update (production, staging and any other shared database: the runner refuses one below the new `seedsVersion`), fold it: change the content so a new database gets the same rows, drop the update, and raise the definition's `seedsVersion` to its version. The seeds alone then describe the package. Check a fold by seeding a new database both ways and comparing their content.

## Reference files

A reference file (`codegen/dnd3.5/reference/<book>/…json`) has three parts:

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

When an extension changes a core entity (a feat its classes take in more aptitudes, a spell it adds to its spell lists), it copies it (copy on write) rather than recreating it: `database/seeders/dnd3.5/concerns/CopiesOnWrite.ts` copies the entity and its customizations and records the copy in `entity_snapshots`, the same way a fork does. Each extension book's generated `cowFeats.ts` and `cowSpells.ts` list what it changes (`codegen/dnd3.5/tools/seeds/concerns/Copies.ts`, a concern of `BookSeeds`).

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

All packages are registered in `database/packages/registry.ts`, each its definition (`content/<ruleset>/packages/`) with the seed that writes it. The runner applies them in order: the core rules first, then its extensions.

```bash
bun db:packages    # Apply all registered packages
```

## Rules

### Do

- Use the scraper and generator for new content; hand-write only what no page provides, in `content/dnd3.5/data/`
- Correct scraped content in `overrides`, the only hand-edited part of a reference file
- Make update functions idempotent (upserts, guard clauses) so retries are safe
- Use display name constants from `content/dnd3.5/rulesetNames.ts` to query rulesets
- Always add modifiers and requirements when the source material defines them

### Do not

- Never delete seed data — characters reference rows by ID
- Never fix deployed data by changing the seeds alone. A data fix changes the seeds (or the parser's output) for new databases, and its PR carries the SQL that brings existing ones in line, run in production once it merges; `bun run prod:diff` with a freshly seeded `REFERENCE_DATABASE_URL` then finds no drift. Add an `updates` entry instead only when that SQL would be too large or risky to run by hand
- Never add requirements to existing feats/class features without careful consideration — it can retroactively invalidate characters
- Never remove or reorder an update some database doesn't have yet, and never skip a version in `updates`
- Never hardcode entity IDs — always look them up by name
- Never edit `content/dnd3.5/generated/` by hand — regenerate it
