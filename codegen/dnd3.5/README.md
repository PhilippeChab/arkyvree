# SRD Scraper & Seed Generator

Pipeline for scraping D&D 3.5 SRD HTML pages from dndtools.net into structured JSON reference files and generating TypeScript seed code.

## Usage

```bash
# Scrape all entities of a type for a book
bun run parser:dnd3.5:scrape -- class --book srd
bun run parser:dnd3.5:scrape -- feat --book srd
bun run parser:dnd3.5:scrape -- spell --book srd
bun run parser:dnd3.5:scrape -- domain --book complete-divine
bun run parser:dnd3.5:scrape -- race --book srd
bun run parser:dnd3.5:scrape -- item --book srd
bun run parser:dnd3.5:scrape -- magicItem --book dmg

# Scrape a single entity by URL
bun run parser:dnd3.5:scrape -- class --url https://dndtools.net/classes/.../barbarian/ --book srd

# Regenerate TypeScript from the references
bun run parser:dnd3.5:generate                      # every book
bun run parser:dnd3.5:generate srd                  # one book
bun run parser:dnd3.5:generate --type domain        # the books with domains
bun run parser:dnd3.5:generate -- <path-to-json>    # a reference's book
# A generation runs in a copy of content/dnd3.5/generated/, formatted (oxfmt) and swapped in only when every reference
# succeeds: a failed one leaves it as it was. One runs at a time (generated.lock)

# Re-scrape and regenerate all existing references
bun run parser:dnd3.5:sync
bun run parser:dnd3.5:sync srd                     # filter by book
bun run parser:dnd3.5:sync srd --type class         # filter by book + type

# Validate reference files: unresolved detections (a class feature's too), class overrides that change nothing, a class's
# bonus feat list entries that name no feat, and values the seed refuses
bun run parser:dnd3.5:validate
bun run parser:dnd3.5:validate --type class
bun run parser:dnd3.5:validate complete-warrior
bun run parser:dnd3.5:validate srd wizard          # one reference, by its file's name

# List the manual overrides across reference files, every type's, but those that only reword a description
bun run parser:dnd3.5:overrides
bun run parser:dnd3.5:overrides --type feat
bun run parser:dnd3.5:overrides --key requirements  # only the overrides that set a key (this command's option)
bun run parser:dnd3.5:overrides complete-warrior
```

### Global scraper options

- `--no-cache` — Disable disk cache for HTTP requests
- `--delay <ms>` — Delay between requests (default: 200)

## Architecture

```
HTML page → Scraper → JSON reference file (raw + overrides) → Generator → content/dnd3.5/generated/ TypeScript
                                          ↑
                                 Human corrections
```

Each reference JSON stores:
- **`raw`** — Scraped data, never manually edited. Replaced on re-scrape.
- **`overrides`** — Corrections made by hand. Kept on re-scrape.

Loading a reference (`References`, `tools/references/References.ts`: the reference files, each book's, found, read, written and loaded) derives the rest with its kind's detector (`tools/detect/`): **`detected`** (BAB, saves, requirements, modifiers… parsed from `raw`; a spell's properties and saving throw, normalized; wizard schools have none) and **`mapping`** (each entity as the seeds make it: what's detected and scraped, its overrides applied, which win over both). The seeds read the mapping, and the detected values no override changes, never the overrides. A correction takes effect at the next `parser:dnd3.5:generate`, without re-scraping. What the scraper reads of a page's structure (a class's table, its prerequisites' lines, which the stored text no longer splits) is in `raw`: a fix to how it reads them takes a re-scrape. See `reference/README.md`.

`content/dnd3.5/generated/` holds only what the generator writes: hand-written content goes in `content/dnd3.5/data/`, what content is written with (its types and builders) in `content/dnd3.5/builders/`, and the books' facts the codegen reads beside them (the weapon and armor tables, the abilities', saves', skills', races' and creature types' names, the core rules' book) in `vocabulary/dnd3.5/`. The codegen reads the books and writes content: it stores nothing, reads none of the generated books it writes nor the packages that gather them (`content/dnd3.5/packages/`), of the hand-written data only the core rules' feats (`coreFeats.ts`, whose aptitudes the SRD's gather), and enters the engine through its entry (`engine/index.ts`) like the server.

The generator (`tools/generator/`) is a `Generator`, which picks the books to regenerate (every book, those a filter picks, a reference's) and generates each whole, a `BookGenerator` each, into a `GeneratedFolder`: the folder it writes to, a copy of generated/ that replaces it only once every book succeeded and it's laid out as the repo is (`generateAtomically`), and the files a generation wrote there, each opening on the command that generates it (`Generator.COMMAND`, `parser:dnd3.5:generate`). A `BookGenerator` is built as the seeder is: a step that writes one kind of file is a concern (`concerns/`: `GeneratesClasses`, `GeneratesFeats`…, and `GeneratesIndexes`, the indexes that list what was written) on a `BaseBookGenerator` (the book, its seeds, what several kinds of files are written with). It writes the book's files from its references, then what they make together (its aptitudes, what an extension copies from the core rules, its indexes), then the files it no longer makes go. A filter or a reference picks which books regenerate, never part of one, so a book's files always agree. A file's code is a `CodeFile` (`code/`), built the same way: its core (`BaseCodeFile`) holds its lines and the names they use, which its imports are written from (one table, `IMPORT_TABLE`), how a value is written as code (a string literal, a list), and the customization values every seed writes alike (a check, a modifier, a property); each kind of seed is written by a concern (`concerns/`: `WritesClasses`, `WritesFeats`…), and so are a book's indexes (`WritesIndexes`). Each generated file's path and the list it exports are named once, in `BookLayout`. What's left to review in a class, which opens its file, is its seeds' (`ClassSeeds.reviewNotes`), and a class's files are composed once (`ClassFiles`), for the generator to write them and `parser:dnd3.5:validate` to check what an override changes in them.

What `parser:dnd3.5:validate` reports (`tools/validate/`) is each reference file's `ReferenceIssues`: a method per kind of reference, reporting what its review list (`ReviewList`, `overrides.reviewed`) doesn't cover (but a skipped entity's: a feat's, a race's, a magic item's, a class's or a class feature's), then the list's stale entries; a class's overrides are checked by a `ClassOverridesCheck` (why the generator refuses the class, the overrides that change nothing, those it ignores). What `parser:dnd3.5:overrides` lists is each reference file's `ReferenceOverrides` (`tools/references/`), whatever its type. The commands (`tools/cli/`) read their line one way, through `CommandLine`: an option is taken out wherever it stands, one the command doesn't take is refused, and each command's grammar is a static method (`filters`, the reference filters most commands take, which they hand on whole; `overrides`, those and the key `parser:dnd3.5:overrides` filters by; `scrape`).

The seeds (`tools/seeds/`) are a `BookSeeds` per book, which the `Library` gives (`Library.book(name)`). Each of its references' seeds is a class of its kind, on a `ReferenceSeeds` (the reference, the book's seeds, the check of a value against the options the seed accepts), which the book builds once per reference (`BaseBookSeeds`: `classes(ref)`, `feats(ref)`, `spells(ref)`…). Each gives its seeds through methods (`seeds()`, a class's `seed()` and `feats()`), built once, when first asked (`memo`), so `parser:dnd3.5:validate` reads what a seed checks (`seeded()`) without building what throws: `FeatSeeds` (its feats by feat type, its template families), `ItemSeeds`, `MagicItemSeeds`, `RaceSeeds`, `DomainSeeds` (its domains, its feat pools' feats, what its lists lack), `SpellSeeds`, `WizardSchoolSeeds`, and a class's `ClassSeeds` (`seeds/classes/`, whose concerns build its features, its own feats, its spellcasting, its level modifiers and its aptitude picks from what both decide alike: its picks split per level, a feature's feat name, the existing feat it grants). `BaseBookSeeds` also holds what several kinds look up: the feats the book already has, the families a prerequisite asks for, the domains its classes pick from, its base items' weights, its spells' names. What's made of several kinds is a concern of `BookSeeds` (`concerns/`): the aptitudes its seeds use (`CollectsAptitudes`), what it copies from the core rules (`Copies`). A feat's or a class feature's grants (a bonded creature, the feats it names, uncanny dodge) are read by a `GrantText`. The generator, `parser:dnd3.5:validate` and the code writers read a book's seeds from it.

The scraper (`tools/scraper/`) is a `Scraper`, built the same way: a concern per kind of reference (`concerns/`: `ScrapesClasses`, `ScrapesFeats`…) on a `BaseScraper` (the book it scrapes and its slug on dndtools.net, the `HttpClient` it fetches pages with, which asks again when a site is busy or fails but not when it refuses a page or has none (an `HttpError`, whose `status` a scraper reads: a class's page falls back to its page without the book on a 404), the listings it finds the book's entries in, `listing(kind)`, and the reference files it saves what it read to, `meta()` and `saveReference`, their overrides kept). What reads a page is a page (`pages/`), a class per kind of page holding its document, its reading public (`read()`, or a section's: `EquipmentPage.weapons()`), its steps private: a `Page` (how a section and its heading are found), a `DndToolsPage` (the site's frame, the page's title: `FeatPage`, `SpellPage`, `RacePage`, `ListingPage`), the SRD's `EquipmentPage` and `MagicItemPage`, the domains' `DomainIndexPage`, `DomainPage` and `SpellDomainsPage`, and a class's `ClassPage` (`pages/class/`: a concern per part it reads, `ReadsSummary`, `ReadsSkills`, `ReadsPrerequisites`, `ReadsProgression`, `ReadsFeatures`, with the `ClassFeatures` and `PrerequisiteText` readers). The tests read saved pages through them. What reads a reference's text is its kind's detector (`tools/detect/`: `ClassDetector`, `FeatDetector`, `SpellDetector`, `DomainDetector`, `RaceDetector`, `ItemDetector`, `MagicItemDetector`, on a `BaseDetector`; and `WizardSchoolDetector`, whose page gives nothing to detect), whose `resolve()` gives the reference with its `detected` and its `mapping` (`References` calls it): the base holds the reference as stored, resolves it (its detected section and its mapping, sanitized with its overrides; a spell's and a magic item's say how they differ) and maps a domain's or a race's modifiers alike. A class's (`detect/classes/`) reads its table with a `ClassTable` (its base attack bonus and saves, its spells per day and known, the features its Special column names), a feature's text with a `FeatureText` (a choice it offers, a pool's options, a list of feats to pick from), and each feature's modifiers as a feat's (`BenefitModifiers`; its proficiencies, `ProficiencyModifiers`), but a pool's, has concerns (`ReadsAptitudePicks`, `ReadsBonusFeatLists`, `ReadsFavoredEnemies`), and builds the entities it makes with a `ClassMapping`, its overrides applied, whose pools and their sub-options are a `ClassPools`. The detectors read their texts with readers (`detect/readers/`), a class each: a prerequisite's reading (`RequirementReading`: `FeatPrerequisites`, `ClassPrerequisites`, on a `BaseRequirementReading` and a concern per reading both share, an alignment, any feat of a family or of a feat's options, spellcasting ("Ability to cast summon monster III": any) and a caster level ("Caster level 5th": the highest, `spellcasting.casterlevel`; "Arcane caster level 5th": an arcane class's), a class feature (any class's of its family: "Ability to turn or rebuke undead" any feat of Turn or Rebuke Undead), a feat's options and a weapon's proficiency (an exotic one's as its item requires it), a size, a skill's ranks (any of a family's, or of the options or skills it lists)), a text's modifiers (`ModifierReading`: `BenefitModifiers`, `RaceModifiers`, `DomainModifiers`, `MagicItemModifiers`, reading their text's bonuses with a `BonusText`, which leaves out those that apply only sometimes), a magic item's text and metadata (`MagicItemText`: its base item, an armor's stats, a weapon's enhancement; `MagicItemMetadata`), and the target paths a modifier or a requirement read must be one of (`TargetPaths`, the paths the engine lists for a book: `listBookTargetPaths`). The books' facts every stage reads alike (the abilities', saves', skills' and races' names, the core rules' book) are the ruleset's vocabulary (`vocabulary/dnd3.5/`); how the parser reads the books' words (numbers written as words, each ability's, save's and skill's slug, a race's spellings and the paths its prerequisite checks, the options a family of feats is taken for, a class feature's family) is its own terms (`tools/terms/`, a module per subject).

## Supported entity types

### Classes

Scrapes class pages into `ClassReference` JSON with full progression tables.

**Auto-detected:**
- Class name, description, hit die, skill points
- Class skills (including Knowledge subspecialties)
- Progression table (BAB, saves, special features, spells per day)
- BAB type (good/medium/poor), save types (good/poor)
- Prerequisites: BAB, skills, feats, spellcasting (a spell level, and the caster level a Spells line asks: "Spells or Spell-Like Abilities: Arcane caster level 5th"), alignment, race, weapon proficiency
- Special prerequisites: a race, read on its whole entry, else each prerequisite the entry lists ("Flurry of blows ability; evasion ability": both), a class feature as any class's of its family ("Evasion class feature", "Either sneak attack +1d6 or skirmish +1d6"). One naming a class feature nothing reads is reported, to be reviewed ("Spell secret class ability")
- Compound feat requirements (e.g. "Weapon Focus (longbow or shortbow)" → `or()`), lists included ("Weapon Focus (dagger, kukri, or punch dagger)", which the scraper splits): each option by its weapon's or school's name ("punch dagger" → Punching Dagger, "Necro." → Necromancy), "composite version of either" as the composite of each. "Negotiator (or), Persuasive" is either feat, "Improved Unarmed Strike (or monk's unarmed strike ability)" the feat, and an exotic proficiency with a martial weapon ("Exotic Weapon Proficiency (kukri)") the martial one. A feat with a choice ("Energy Substitution (cold)") is the feat. Languages read into the feats ("Spell Focus (conjuration) Languages: Celestial") are left out
- Caster level advancement from "+1 level of existing" text
- Spell tables (per day + known), with footnote stripping
- Bonus spell ability from class feature text
- Feature name normalization (+Nd6, +N, N/day, N ft., etc.)
- `knowAll: true` inferred when spells per day exists but no spells known table
- Free feat auto-detection by cross-referencing features against known feat names

**Needs manual annotation in `overrides`:**
- `modifiers` — Structured stat modifiers from prose descriptions (e.g. Dragon Disciple ability boosts)
- `aptitudePicks` — Links "choose an ability" features to aptitude pool slugs
- `features` — Per-feature corrections (name, level, aptitude, modifiers…); a `null` field removes the detected one
- Any other detected value to correct (`bab`, `saves`, `requirements`, `classSkills`, `spells`…)
- `skip` — Leave the class out of the seed: one the rules can't support (the Shadowmind needs psionics). Generation removes its files

### Feats

Scrapes feat listing and detail pages into `FeatReference` JSON.

**Auto-detected:**
- Feat name, type (General, Fighter, Metamagic, etc.), description, benefit
- Prerequisite text parsing into structured requirements (ability scores, BAB, feats, skills, caster level), with the same option lists as classes. A class feature named as a prerequisite ("Ability to acquire a new familiar", "Sneak attack +2d6", "Wild shape class feature", one in lower case or alone: "smite evil", "Wild shape") is a check of its family, as a class's; "Ki strike (magic)" is monk level 4 and "(lawful)" monk level 10. "Relevant alignment" is the alignment the feat's name holds (Spell Focus (Chaos): any chaotic), another alignment any of its kind ("nonevil alignment": any nonevil). A proficiency with all martial weapons is the feat, with a weapon its proficiency ("proficiency with the whip"). What no path can read ("Ability to fly"), and a class feature nothing reads ("Spell secret class ability"), is reported, to be reviewed
- Template feat detection (e.g. "Weapon Focus" expands into per-weapon variants)
- Stackable feat detection
- Modifier detection from benefit text

**Needs manual annotation in `overrides`:**
- Requirement corrections when auto-parsing fails
- Modifier definitions for complex mechanical effects
- `stackable` / `template` overrides

### Spells

Scrapes spell listing and detail pages into `SpellReference` JSON.

**Auto-detected:**
- Spell name, school, subschool, descriptor
- Level entries per class (e.g. "Cleric 3, Druid 4")
- Description text
- The stat block's fields (casting time, range, target, effect, area, duration, components, saving throw, spell resistance)
- A field its stat block leaves out, from the spell its text says it's written as ("functions like X", "As X, except…", "the same as X", "works as the X spell"), its book's or the core rules': what its own stat block states stays, and a personal spell takes no saving throw or spell resistance

**Needs manual annotation in `overrides`:**
- Description rewording, as for every entity
- `levelEntries`: the class/level entries its page leaves out
- A stat block's field its page leaves out or garbles (`duration`, `savingThrow`, `target`…): Tortoise Shell's and Grasping Wall's last lines, leaked into their description

### Domains

Scrapes a book's domains into `reference/<book>/domains.json` (`DomainReference`), from dnd.arkalseif.info, a copy of dndtools' database that keeps each book's version of a domain apart ("Weather (CD)"): dndtools.net has since merged them, without their books. A version is the book's its page names, or, when it names none, the one its label's code ("CD") stands for in the versions that do.

**Auto-detected:**
- Domain name, page, granted power description
- Spell list with levels: each 3.5 spell of the domain's versions whose page gives this version a level
- Modifier detection from granted power text

**Needs manual annotation in `overrides`:**
- Description rewording, as for every entity
- The spells a version's pages miss or misplace: `parser:dnd3.5:validate` reports a spell no parsed book has, a level from 1st to 9th without a spell, and a spell of the book whose level line puts it on one of its domains at a level the list doesn't
- Modifier definitions for complex granted powers

### Races

Scrapes race pages into `RaceReference` JSON.

**Auto-detected:**
- Race name, size, speed, description
- Ability score modifiers (e.g. +2 DEX, -2 CON)
- Save bonuses, skill bonuses
- Modifier validation against known target paths

### Items

Scrapes equipment tables into `ItemReference` JSON. Covers weapons, armor, shields, and adventuring gear.

**Auto-detected:**
- Weapon stats (damage, critical, range, weight, cost, proficiency category)
- Armor/shield stats (AC bonus, max DEX, check penalty, spell failure, weight, cost)
- SRD name normalization (e.g. "Dagger, punching" → "Punching Dagger")
- Goods/adventuring gear (weight, cost)

### Magic Items

Scrapes magic item pages into `MagicItemReference` JSON. Covers specific armor, shields and weapons, wondrous items, rings, rods, and staffs.

**Auto-detected:**
- Item name, description, cost, weight, category
- Base item template detection (e.g. "+1 Longsword" → sourceItem "Longsword"). An item made from a base one weighs what its base does, unless its text gives its weight
- A specific armor's or shield's stats (`MagicItemText.armorStats`, `tools/detect/readers/items/MagicItemText.ts`): the spell failure, maximum Dexterity bonus and check penalty its text gives, its category ("considered light armor"), its weight, and its enhancement bonus to AC ("this +3 banded mail"). Magic, adamantine or masterwork armor is masterwork, unless its text gives its check penalty
- Slot assignment (head, neck, hands, etc.)
- Modifier detection from item descriptions (save bonuses, skill bonuses, ability bonuses)

**Overrides:** `baseItem` (the item it's made from), `template` (a specific armor others are made from, whose proficiency is its own: elven chain, light though it's chainmail), `properties`, `modifiers`, `slot`, `aura`, `casterLevel`, `costGp`, `weight`.

### Bonus detection

Feats (with class features), races and magic items read their bonuses as a `BonusText` (`tools/detect/readers/modifiers/BonusText.ts`), the text and the two readings it reads it with:

- **Its skill bonuses** (`skillBonuses()`): "+N [type] bonus on/to [all] [the wearer's/your…] X, Y and Z check(s)", capitalized skill names joined by commas and "and" (never split inside parentheses). A size bonus is left out: the character sheet applies size itself. A name that isn't a skill is reported, for review.
- **Whether a bonus applies only sometimes** (`isConditional(match)`, which `every()`, `first()` and `skillBonuses()` leave out): a bonus isn't a permanent modifier when its part of the sentence (the sentence's opening, its own text up to the next bonus, and what joins it to the previous one) names a condition (against, while, when, if, only, as long as…), an effect used (expend, per day, as a swift action, for 1 hour…), or someone else it goes to (allies, a companion, a mount…); or when what follows it narrows it ("made to…", "to find…", "related to…"). What's worn, held or carried isn't a condition, nor is the level a class feature comes at ("When she attains 6th level, a dervish gains…").

## What needs manual annotation in `overrides`

- **`modifiers`** — Structured stat modifiers from prose descriptions (e.g. Dragon Disciple ability boosts, natural armor)
- **`aptitudePicks`** — Links "choose an ability" features to app-specific aptitude pool slugs
- **`freeFeats` vs `classFeatures`** — Distinguishing existing feats granted for free (e.g. Augment Summoning) from class-specific features (auto-detected by cross-referencing against scraped feat names)
- **`features`** and any other field — Corrections to what's detected

> Corrections go in `overrides`: it's the only part of a reference file besides the scraped `raw`.
