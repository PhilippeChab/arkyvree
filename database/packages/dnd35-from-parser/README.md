# SRD Scraper & Seed Generator

Pipeline for scraping D&D 3.5 SRD HTML pages from dndtools.net into structured JSON reference files and generating TypeScript seed code.

## Usage

```bash
# Scrape all entities of a type for a book
bun run parser:scrape -- class --book srd
bun run parser:scrape -- feat --book srd
bun run parser:scrape -- spell --book srd
bun run parser:scrape -- domain --book complete-divine
bun run parser:scrape -- race --book srd
bun run parser:scrape -- item --book srd
bun run parser:scrape -- magicItem --book dmg

# Scrape a single entity by URL
bun run parser:scrape -- class --url https://dndtools.net/classes/.../barbarian/ --book srd

# Regenerate TypeScript from the references
bun run parser:generate                      # everything, domains included
bun run parser:generate srd                  # one book
bun run parser:generate srd --type class     # one book's classes
bun run parser:generate -- <path-to-json>    # one reference
# A generation runs in a copy of generated/, formatted (oxfmt) and swapped in only when every reference succeeds:
# a failed one leaves generated/ as it was. One runs at a time (generated.lock)

# Re-scrape and regenerate all existing references
bun run parser:sync
bun run parser:sync srd                     # filter by book
bun run parser:sync srd --type class         # filter by book + type

# Validate reference files: unresolved detections, class overrides that change nothing, and values the seed refuses
bun run parser:validate
bun run parser:validate --type class
bun run parser:validate complete-warrior

# List all manual overrides across reference files
bun run parser:overrides
bun run parser:overrides --type feat
bun run parser:overrides complete-warrior
```

### Global scraper options

- `--no-cache` — Disable disk cache for HTTP requests
- `--delay <ms>` — Delay between requests (default: 200)

## Architecture

```
HTML page → Scraper → JSON reference file (raw + overrides) → Generator → generated/ TypeScript
                                          ↑
                                 Human corrections
```

Each reference JSON stores:
- **`raw`** — Scraped data, never manually edited. Replaced on re-scrape.
- **`overrides`** — Corrections made by hand. Kept on re-scrape.

Loading a reference (`ReferenceLoader`, `tools/references/ReferenceLoader.ts`) derives the rest (`resolveReference`, `tools/references/resolve.ts`, with the detectors in `tools/detect/`): **`detected`** (BAB, saves, requirements, modifiers… parsed from `raw`; a spell's properties and saving throw, normalized; wizard schools have none) and **`mapping`** (each entity as the seeds make it: what's detected and scraped, its overrides applied, which win over both). The seeds read the mapping, and the detected values no override changes, never the overrides. A correction takes effect at the next `parser:generate`, without re-scraping. What the scraper reads of a page's structure (a class's table, its prerequisites' lines, which the stored text no longer splits) is in `raw`: a fix to how it reads them takes a re-scrape. See `reference/README.md`.

`generated/` holds only what the generator writes: hand-written content goes in `database/packages/dnd35/data/`, and what content is written with (its types and builders) in `database/packages/dnd35/content/`.

The generator (`tools/generator/`) is a `Generator`, built as the seeder is: a step that writes one kind of file is a concern (`concerns/`: `GeneratesClasses`, `GeneratesFeats`…) on a `BaseGenerator` (the folder it writes to, what several kinds of files are written with), and the steps a reference takes, which rewrite the files the kinds share (the aptitudes, the indexes, what an extension copies from the core rules), are its own. A file's code is a `CodeFile` (`code/`): its lines, and the names they use, which its imports are written from.

The seeds (`tools/seeds/`) are a `BookSeeds` per book, which the `Library` gives (`Library.book(name)`), built as the generator is: a kind of seeds is a concern (`concerns/`: `Classes`, `Feats`, `Spells`…), each built once from its reference's builder (`buildSpellSeeds`, `buildRaceSeeds`…; a class's seed and its feats are a `ClassSeeds`, `seeds/classes/`, whose concerns build its features, its own feats, its spellcasting, its level modifiers and its aptitude picks from what both decide alike: its picks split per level, a feature's feat name, the existing feat it grants), on a `BaseBookSeeds` (the book, its references, and what several kinds look up: the feats it already has, the families a prerequisite asks for, the domains its classes pick from, its base items' weights, its spells' names); what's made of several kinds is its own (its aptitudes, what it copies from the core rules). The generator, `parser:validate` and the code writers read a book's seeds from it.

The scraper (`tools/scraper/`) is a `Scraper`, built the same way: a concern per kind of reference (`concerns/`: `ScrapesClasses`, `ScrapesFeats`…) on a `BaseScraper` (the book it scrapes, the `HttpClient` it fetches pages with, the listings it finds the book's entries in, and the reference files it saves what it read to, their overrides kept). What reads a page is a parser (`parsers/`): pure functions, which the tests run on saved pages. What reads a reference's text is its kind's detector (`tools/detect/`: `ClassDetector`, `FeatDetector`, `SpellDetector`, `DomainDetector`, `RaceDetector`, `ItemDetector`, `MagicItemDetector`), whose `resolve()` gives the reference with its `detected` and its `mapping` (`resolve.ts` calls it). A class's (`detect/classes/`) has concerns, which read the features where its player picks and the existing feats it lets them pick, and a `ClassMapping`, which builds the entities it makes, its overrides applied. The detectors share readers (`detect/readers/`): a prerequisite's reading (`RequirementReading`: `FeatPrerequisites`, `ClassPrerequisites`), a text's modifiers (`ModifierReading`: `BenefitModifiers`, `RaceModifiers`, `DomainModifiers`, `MagicItemModifiers`), an item's cost, weight and stats; and the names the books give abilities, saves, skills and races (`detect/vocabulary.ts`).

## Supported entity types

### Classes

Scrapes class pages into `ClassReference` JSON with full progression tables.

**Auto-detected:**
- Class name, description, hit die, skill points
- Class skills (including Knowledge subspecialties)
- Progression table (BAB, saves, special features, spells per day)
- BAB type (good/medium/poor), save types (good/poor)
- Prerequisites: BAB, skills, feats, caster level, alignment, race, weapon proficiency
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
- Prerequisite text parsing into structured requirements (ability scores, BAB, feats, skills, caster level), with the same option lists as classes. A class feature named as a prerequisite ("Ability to acquire a new familiar", "Sneak attack +2d6") is a check of its family; "Ki strike (lawful)" is monk level 10, and "Relevant alignment" the alignment the feat's name holds (Spell Focus (Chaos): any chaotic). What no path can read ("Ability to fly") is reported, to be reviewed
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

### Domains

Scrapes a book's domains into `reference/<book>/domains.json` (`DomainReference`), from dnd.arkalseif.info, a copy of dndtools' database that keeps each book's version of a domain apart ("Weather (CD)"): dndtools.net has since merged them, without their books. A version is the book's its page names, or, when it names none, the one its label's code ("CD") stands for in the versions that do.

**Auto-detected:**
- Domain name, page, granted power description
- Spell list with levels: each 3.5 spell of the domain's versions whose page gives this version a level
- Modifier detection from granted power text

**Needs manual annotation in `overrides`:**
- Description rewording, as for every entity
- The spells a version's pages miss or misplace: `parser:validate` reports a spell no parsed book has, a level from 1st to 9th without a spell, and a spell of the book whose level line puts it on one of its domains at a level the list doesn't
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
- A specific armor's or shield's stats (`readArmorStats`, `armorStats.ts`): the spell failure, maximum Dexterity bonus and check penalty its text gives, its category ("considered light armor"), its weight, and its enhancement bonus to AC ("this +3 banded mail"). Magic, adamantine or masterwork armor is masterwork, unless its text gives its check penalty
- Slot assignment (head, neck, hands, etc.)
- Modifier detection from item descriptions (save bonuses, skill bonuses, ability bonuses)

**Overrides:** `baseItem` (the item it's made from), `template` (a specific armor others are made from, whose proficiency is its own: elven chain, light though it's chainmail), `properties`, `modifiers`, `slot`, `aura`, `casterLevel`, `costGp`, `weight`.

### Bonus detection

Feats (with class features), races and magic items read their bonuses as a `BonusText` (`tools/detect/readers/modifiers/`), the text and the two pieces it reads it with:

- **`readSkillBonuses`** (`skillBonuses.ts`): "+N [type] bonus on/to [all] [the wearer's/your…] X, Y and Z check(s)", capitalized skill names joined by commas and "and" (never split inside parentheses). A size bonus is left out: the character sheet applies size itself. A name that isn't a skill is reported, for review.
- **`isConditional`** (`conditional.ts`): a bonus isn't a permanent modifier when its part of the sentence (the sentence's opening, its own text up to the next bonus, and what joins it to the previous one) names a condition (against, while, when, if, only, as long as…), an effect used (expend, per day, as a swift action, for 1 hour…), or someone else it goes to (allies, a companion, a mount…); or when what follows it narrows it ("made to…", "to find…", "related to…"). What's worn, held or carried isn't a condition.

## What needs manual annotation in `overrides`

- **`modifiers`** — Structured stat modifiers from prose descriptions (e.g. Dragon Disciple ability boosts, natural armor)
- **`aptitudePicks`** — Links "choose an ability" features to app-specific aptitude pool slugs
- **`freeFeats` vs `classFeatures`** — Distinguishing existing feats granted for free (e.g. Augment Summoning) from class-specific features (auto-detected by cross-referencing against scraped feat names)
- **`features`** and any other field — Corrections to what's detected

> Corrections go in `overrides`: it's the only part of a reference file besides the scraped `raw`.
