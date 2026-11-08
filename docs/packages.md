# Content Packages

Content packages deliver seed data (base rulesets, extensions) with version tracking. A package is data, in its ruleset's content (`content/<ruleset>/packages/`): its name, its type, the version its seeds install, the ruleset it creates and the content it seeds. The registry (`database/packages/registry.ts`) gives each base rules' packages, the seeder that writes them and its test characters, and the runner (`database/packages/runner.ts`) installs the packages a database lacks and brings the others up to date. `rules.content_packages` records each database's version of each package.

## Pipeline overview

```text
dndtools.net HTML → Scraper → reference JSON (raw + overrides) → Generator → generated TypeScript → package seeds
                                                   ↑
                                         Human corrections
```

Most content is generated from a scraped source (3.5's dndtools.net pages, above; Pathfinder's aonprd.com; D&D 5th Edition's SRD 5.2.1, the 5e-bits database's JSON). A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else. See [Reference files](#reference-files) and `codegen/<ruleset>/README.md` for the scraper and generator.

## Package types

| Type | `type` | Purpose |
|------|--------|---------|
| Base ruleset | `"base_ruleset"` | Full game system (abilities, skills, classes, feats, spells) |
| Extension | `"extension"` | Supplement that adds content to the base ruleset |

## Structure

`content/dnd3.5/` is data: it never touches the database, and imports none of what reads or writes it (`arkyvree/root-folders`). Each ruleset's folders are its own, and what every ruleset's content, codegen and seeders share is the core's (`content/core/`, `codegen/core/`, `database/seeders/core/`), which names no ruleset (`arkyvree/ruleset-folders`). Neither do the runner and the scripts, the dev and test seeds among them (`database/packages/`, `scripts/`, `scripts/db/seeds/`): they reach a ruleset's packages, seeder and test characters through the registry alone (`database/packages/registry.ts`). The seeders and the codegen import it; the engine and the server read none of it, and the content reaches the server through the database, which the packages seed.

Each of its folders has one role, which `arkyvree/layers` holds:

- `builders/` is what the content is written with, and imports nothing written in it (`data/`, `generated/`, `packages/`, `testData/`).
- `data/` holds the hand-written rows. It reads nothing the codegen writes (`generated/`, `packages/`), so the codegen can read it: the SRD's generated aptitudes cover the core's hand-written feats' (`buildCoreFeats`).
- `generated/` holds only what the generator writes, and wraps no hand-written content (it imports nothing of `data/` or `packages/`).
- `packages/` gathers them: a package's content is its book (`BOOK`, `generated/<book>/index.ts`) and the hand-written rows it adds (the core rules' `CORE`, Complete Divine's deity's weapon feats).
- The books' facts the builders, the data and the codegen read (the weapon, armor and shield tables, the abilities', saves', skills', races' and creature types' names, a feat family's name, the core rules' book) are the ruleset's vocabulary (`vocabulary/dnd3.5/`), as the engine's are, and so are its base rules (`DND35_BASE_RULES`, `vocabulary/dnd3.5/baseRules.ts`), which the seeders and the codegen ask the engine by.

The codegen reads `builders/` (the code it writes is the content's), the vocabulary, and of `data/` the core rules' hand-written feats alone (`data/feats/coreFeats.ts`: the SRD's aptitudes gather theirs too), never the generated books it writes nor the packages that gather them: `arkyvree/root-folders` declares those edges. Its commands are `package.json` scripts named for its ruleset (`parser:dnd3.5:generate`, `parser:dnd3.5:validate`…), and each file it generates names the one that generates it, as its ruleset's generator hands it to core's `GeneratedFolder` (`Generator.COMMAND`). A seeder (`database/`) reads what a package seeds from its definition (`packages/`), never a module of `data/` or `generated/`.

## How seeds work

A package is data (`content/dnd3.5/packages/`): the core rules' creates the core ruleset and seeds it with `CORE` (`packages/core.ts`), the SRD's book joined to the hand-written core content.

The core rules' package is `DND35_CORE_PACKAGE`, in `content/dnd3.5/packages/core.ts`.

The registry (`database/packages/registry.ts`) has a row for each base rules (`RULESET_CONTENT`, which `satisfies Record<BaseRules, RulesetContent>`: a base rules `BaseRules` gains (`BASE_RULES_OPTIONS`, `shared/enums.ts`, a row of `rules.modules`) doesn't compile until it has its row): its core rules' package, its extensions', in the order they're applied, the seeder that writes them, and its test characters. The runner applies the packages in that order (`CONTENT_PACKAGES`, by `listContentPackages`), each base rules' core rules first:

- A core package creates the core ruleset of its base rules (`createCore`), and the seeder seeds the core rules' content there (`seedCore`).
- An extension's finds that core ruleset by its package (`findCoreRulesetId`, by the name the core package gives it), creates an extension of it with its context (`loadContext`, `createExtension`), and the seeder seeds the extension's book there, beside the core rules' content (`seedExtension`).

A ruleset's seeder extends `ContentSeeder` (`database/seeders/core/`), the contract: its abstract members (`seedCore`, `seedExtension`, over the content its packages give, `ContentSeeder<Core, Book>`) are what a ruleset's seeding implements, and the rest is what every ruleset's seeding writes with: the context it names rows by, the system rulesets its packages create, the customizations' rows and their inserts, and the copies an extension makes of the entities it changes. The steps that write rows any ruleset's content seeds alike (items) are `ContentSeeder`'s concerns (`database/seeders/core/concerns/`), so a ruleset's seeder has them; a module's seeder adds the context it names its rows in (3.5's `Dnd35ContentSeeder`: `emptyContext`, `extensionContext`, `loadContext`) and its own steps, from its seed types (3.5's `content/dnd3.5/builders/`: aptitudes, abilities, saves, languages, feats, races, the copies an extension makes of the feats and spells it changes, `BaseSeeder`'s concerns). 3.5's `RulesetSeeder` seeds a ruleset step by step: a step that writes one kind of row is a concern, the core's or its own (`concerns/`: classes, skills, spells, wizard schools, a book's changes to the core), and the steps made of others (`seedCore`, `seedExtension`, `seedBond`, `seedDomains`) are the class's own. It holds a `Dnd35SeedContext`: the ruleset it writes to and the ids, by name, of the rows its content names (abilities, saves, skills, aptitudes, feats, spells). Seeding aptitudes, feats or spells adds them to it, so the steps after can name them. It holds no content: a package gives it.

The dev seeds (`scripts/db/seeds/`, which seed each base rules' test characters on its core rules: its registry row's `seedTestCharacters`, `content/dnd3.5/testData/`'s characters for 3.5, `database/seeders/dnd3.5/characters/`) and the tests load the same context for the seeded ruleset (its seeder's `loadContext`).

A seed says what it stores. Its fields are the entity's fields as stored (`fields`, `StoredFieldValues` of `ENTITY_FIELDS.<kind>`, `shared/customization/fields.ts`): some of them, each by the stored field that keeps it, written by its vocabulary's constant (`{ [ITEM_COST_GP]: 15, [ITEM_WEIGHT]: 4, [WEAPON_MIGHTY]: 2 }`), each value of its kind (a number, a flag, a text, a list's values). Its single links are by role, each the name of the entity it names (an item's template, `links: { madeFrom: "Longsword" }`; a skill's or a save's ability, a class's bonus spell ability, a spell's save, a test character's race), and its partition, where its kind has one, is its own (`partition: "familiar"`: a bonded creature's races and class must say theirs, `BondContent`). The seeders write them as they are, with the entity's row, through the one write path the server writes a form's save by (`Entities.createIds`), which stores the same values as the same rows whoever writes them (`Engine.forRules(baseRules).storage().writtenFields`: a set's values once, no false flag, default number or empty text, none whose condition doesn't hold, none of a spell's stat block without its school), a field a new entity always holds its default where the seed gives none (a feat's `FEAT_SELECTABLE`, an item's `ITEM_SLOT`), each checked against its declaration (`toFieldRows`); the ruleset's own fields, its Settings, go through `RulesetSettings` (`SeederState.writeSettings`). A name a seed gives is refused unless the seed's ruleset has it: a link's (an item's template, an ability, a save, a class's ability, a character's race), an aptitude, a class's skill or granted feat, a character's class, feats, skills, spells, abilities, languages and items, each refusal naming the seed and what it names. An item's fields and links are its ruleset's: the core's `ItemSeed` is generic in them, and its step (`SeedsItems.seedItems`) draws every item's id before it writes any, so a link names an item of the same seed wherever it stands among them. As an item's form's save does, it refuses a link to an item that isn't a template (its kind's template flag), a template's link to any, and one its ruleset's rules refuse (`checkMadeFrom`: 3.5's, a template of another type, or of a type no template is of).

An extension is a package file that seeds its book.

The DMG SRD's is `DND35_DMG_PACKAGE`, in `content/dnd3.5/packages/extensions/dmg.ts`.

`BOOK` (`content/dnd3.5/generated/<book>/index.ts`) is the book's content as the generator wrote it. The runner creates the extension ruleset with the core's context (`createExtension`); `seedExtension` adds the aptitudes the core lacks, seeds the feats, spells, domains (whose spell levels open at the core cleric's, of the core rules' content it's given) and classes, and copies the core feats and spells the book changes (see [COW](#cow-ing-core-entities-into-extensions)). A book's hand-written additions are joined to its `BOOK` in its package file (Complete Divine's `content` adds `DEITYS_WEAPON_FEATS`), as the core rules' are to the SRD's `BOOK` in `packages/core.ts` (its hand-written feats, `buildCoreFeats`, its rules and its bonded creatures): no generated file wraps hand-written content.

### Adding an extension

1. Add the book to the scraper (its slug in `codegen/dnd3.5/tools/scraper/BaseScraper.ts`), scrape it, and generate it (`bun run parser:dnd3.5:generate <book>`).
2. Add its display name to `content/dnd3.5/rulesetNames.ts` and a package file under `content/dnd3.5/packages/extensions/` with `seedsVersion: 1`.
3. Register it in `database/packages/registry.ts`: last of its base rules' `extensions` (`RULESET_CONTENT`).

## Versioning & updates

A package's seeds install it at its definition's `seedsVersion` (`content/<ruleset>/packages/`). A change after that reaches an existing database by the SQL its pull request carries, run just before its deploy (see the Rules: never fix deployed data by changing the seeds alone), or, when that SQL would be too large or risky to run by hand, by an update in `updates`, keyed by the version it brings the package to (`seedsVersion + 1`, `+ 2`…), and the package's version becomes its last update's. An update writes, so it's the database's: its base rules' row of the registry gives it, by package name (`updates`):

- A new database runs the seeds, then every update.
- An existing database runs the updates past its version.
- A database older than `seedsVersion` is refused: the updates it lacks are now part of the seeds, so none can bring it up to date. The runner checks every package first and applies none if one is refused. Reset a development database; any other needs those updates back (from git history) until it has them. `bun run prod:diff` (`scripts/ops/diff/diff-prod.ts`) shows whether production's versions would be refused before a deploy. With `REFERENCE_DATABASE_URL` set to a freshly seeded database, it also compares every row the seeds write (`scripts/ops/diff/content.ts`); `tests/scripts/ops/diff/dnd3.5/content.test.ts` fails when a table or a column isn't compared.

A base rules' updates are its `RULESET_CONTENT` row's `updates`, in `database/packages/registry.ts`.

Once every database has an update (production, staging and any other shared database: the runner refuses one below the new `seedsVersion`), fold it: change the content so a new database gets the same rows, drop the update, and raise the definition's `seedsVersion` to its version. The seeds alone then describe the package. Check a fold by seeding a new database both ways and comparing their content.

## Reference files

`bun run parser:dnd3.5:validate` lists:
- unresolved detections, and items without a definition (the generator leaves them out), not yet listed in `overrides.reviewed`; and entries of `overrides.reviewed` that cover none of them, or repeat one;
- a class's bonus feat list entries that name no feat (the seeds leave them out), not yet listed in its `overrides.reviewed`;
- classes the generator refuses;
- class overrides that change nothing (they hold what's derived without them) or that the generator ignores;
- values the seed refuses, such as a race's size or a magic item's slot. These can't be marked reviewed: correct the value with an override, or skip the entry;
- references of a type the tools don't read (a misspelled `_meta.type`).

## COW-ing core entities into extensions

When an extension changes a core entity (a feat its classes take in more aptitudes, a spell it adds to its spell lists), it copies it (copy on write) rather than recreating it: `database/seeders/dnd3.5/concerns/CopiesOnWrite.ts` copies the entity and its customizations and records the copy in `entity_snapshots`, the same way a fork does, a spell's copy keeping its spell lists (`keptSpellLinks`); 3.5's `CopiesIntoExtensions` changes the copies as the book says. Each extension book's generated `cowFeats.ts` and `cowSpells.ts` list what it changes (`codegen/dnd3.5/tools/seeds/concerns/Copies.ts`, a concern of `BookSeeds`): each core feat a class's bonus feat list names, by its letters, and a core family's feat for each of its options when the list names the family ("Skill Focus"). A feat of the book's own needs no copy: the feat generator gives it the list (a list's "Hear the Unseen" is the book's Hear The Unseen).

### Aptitude ownership rules

Aptitudes are named pools with no per-ruleset content of their own — just a `name`. So the seed only creates an aptitude row in the ruleset that *introduces* the name. `seedExtension` splits the book's aptitudes into:

- **Already in the core** (e.g. `General`, `Fighter Bonus Feat`, `Cleric Domain`) — skipped; the extension references the core's row. Same pattern a user fork uses when adding a new feat tagged `General`.
- **Not in the core** — inserted as a new row in the extension. Covers both extension-private names (e.g. `Ronin Bonus Feat`) and sibling-shared class spell lists (e.g. `Assassin Spells`, which multiple extensions independently create because siblings can't FK to each other: a book copies each list of another book its spells are on, a class's by their level line or one drawing on others' lists, `Sublime Chord Spells`).

Consequences for links (a feat's or a spell's `listedIn` link, whose `to_id` is the aptitude, and a class level's `grants` link, whose `via_id` is):

- Links targeting a core name point at the core's aptitude.
- Links targeting an extension-owned name point at the extension's own aptitude.
- Every raw row satisfies the invariant: *the aptitude's ruleset is on the entity's source chain.* No cross-sibling FKs in the raw data; the runtime sibling mechanism handles cross-extension visibility.

A copy keeps the original's aptitude links, to the core's aptitude.

## Registry

All packages are registered in `database/packages/registry.ts`, in their base rules' row (`RULESET_CONTENT`): its core package and its extensions (`content/<ruleset>/packages/`), the seeder that writes them, and its test characters. The runner applies them in order: each base rules' core rules first, then its extensions.

```bash
bun db:packages    # Apply all registered packages
```

## Rules

### Do

- Use the scraper and generator for new content; hand-write only what no page provides, in `content/<ruleset>/data/`
- Correct scraped content in `overrides`, the only hand-edited part of a reference file
- Make update functions idempotent (upserts, guard clauses) so retries are safe
- Use display name constants from `content/<ruleset>/rulesetNames.ts` to query rulesets
- Always add modifiers and requirements when the source material defines them

### Do not

- Never delete seed data — characters reference rows by ID
- Never fix deployed data by changing the seeds alone. A data fix changes the seeds (or the parser's output) for new databases, and its PR carries the SQL that brings existing ones in line, run in production just before the deploy that ships it; `bun run prod:diff` with a freshly seeded `REFERENCE_DATABASE_URL` then finds no drift. The servers keep each ruleset's rows in memory: a write trusts what its server keeps while the ruleset's `content_version` is unchanged ([caching.md](./caching.md#a-writes-fresh-view)), and a read never checks it. Only `Locks` and the runner bump that version (`runner.ts`), so the SQL takes the rulesets' locks and bumps their versions as the runner does, in one transaction: first it locks the rulesets it changes, in the order every write locks them (`RULESET_LOCK_ORDER`: `SELECT id FROM rules.rulesets WHERE id IN (…) ORDER BY CASE WHEN ruleset_id IS NULL THEN 2 WHEN kind = 'extension' THEN 1 ELSE 0 END, id FOR NO KEY UPDATE`), so it waits for the writes already running on them, as another write would, rather than deadlock with one; then it changes their rows; then it bumps them (`UPDATE rules.rulesets SET content_version = content_version + 1 WHERE id IN (…)`). The bump makes each server's next write to those rulesets read their rows again. Their reads can still show the old rows until the servers restart, which that deploy does. Add an `updates` entry instead only when that SQL would be too large or risky to run by hand
- Never add requirements to existing feats/class features without careful consideration — it can retroactively invalidate characters
- Never remove or reorder an update some database doesn't have yet, and never skip a version in `updates`
- Never hardcode entity IDs — always look them up by name
- Never edit `content/<ruleset>/generated/` by hand — regenerate it
