# D&D 5th Edition Parser

Pipeline for reading the D&D 5th Edition 2024 rules, as the System Reference Document 5.2.1 gives them, into
reference JSON files. Generating the content's book from them (`content/dnd5.2/generated/<book>/`) comes with the
ruleset's engine module and content.

## Usage

```bash
# Read the book's entries of a type into its references
bun run parser:dnd5.2:scrape -- class
bun run parser:dnd5.2:scrape -- feat
bun run parser:dnd5.2:scrape -- spell
bun run parser:dnd5.2:scrape -- species
bun run parser:dnd5.2:scrape -- background
bun run parser:dnd5.2:scrape -- item
bun run parser:dnd5.2:scrape -- magicItem
```

Options: `--no-cache` (fetch every file, past the disk cache, `tools/scraper/.cache/`, which git ignores). A type is
read whole, off the files it's gathered from: `--url` doesn't apply, and `--book` takes the SRD alone (`srd`).

## The source

The SRD 5.2.1 is Wizards of the Coast's, under the Creative Commons Attribution 4.0 license; its text is published as a
PDF. The [5e-bits database](https://github.com/5e-bits/5e-srd-api) (MIT) transcribes it into JSON, a file per kind of
entry (`packages/5e-database/src/2024/en/5e-SRD-<Kind>.json`): its classes, their levels and features, subclasses,
feats, spells, species, their subspecies and traits, backgrounds, equipment and magic items. The parser reads those
files at one commit of the repository (`DATABASE` in `tools/scraper/BaseScraper.ts`), so a scrape reads the same data
until that commit is changed on purpose. The database's own links (an entry's `url`, its API's routes, an item's
`image`) mean nothing outside its API, and are left out.

What the files give was checked against the SRD 5.2.1's text: its 339 spells (27 cantrips and 312 of levels 1 to 9),
each class's features by level, a subclass's features at its class's levels, and the Weapons and Armor tables. Where
the database differs from the SRD, its reference's overrides say what the SRD gives: the items' are a Sling's damage
(bludgeoning), a Trident's (1d8, 1d10 in two hands; the database has the 2014 rules'), Hide Armor's category (medium),
a Chain Shirt's weight (20 lb.) and Half Plate Armor's name.

## Architecture

```
5e-bits files → Scraper → JSON reference file (raw + overrides)
```

What every ruleset's parser shares is the core's (`codegen/core/`): a command's line (`cli/CommandLine`), the scrape
command (`cli/ScrapeCommand`), the references' store (`references/ReferenceStore`), a book's scraper
(`scraper/BookScraper`, which saves a reference with the overrides its file had) and the HTTP client, with its disk
cache. The D&D 5th Edition parser adds its own:

- `tools/cli/scrape.ts`: `parser:dnd5.2:scrape`, its types on core's scrape command.
- `tools/references/References.ts`: its store, each type's file in the book's folder (`feats.json`…, a class's
  `classes/<name>.json`). Loading a reference derives nothing yet: that's the detection's to come.
- `tools/scraper/`: its `Scraper`, a concern per kind of reference (`concerns/`: `ScrapesClasses`, `ScrapesSpecies`…)
  on its `BaseScraper` (core's `BookScraper`, with the database's files read whole, `dataset`, and the files a reference
  was read from, `datasetMeta`), and the files' reading into references (`datasets.ts`: the links stripped, a class's
  levels, features and subclasses gathered under it, a species' traits and subspecies read whole).
- `tools/types/`: a reference's type per kind, in the database's own field names (`hit_die`, `prof_bonus`), and what
  every entry shares (`common.ts`: a reference to another entry, a choice, a cost).

The books' facts the parser reads are the ruleset's vocabulary (`vocabulary/dnd5.2/`: the book it reads).

## What a reference stores

Each kind stores the database's entries as it gives them, its text whole, its links left out: what they mean (a
class's spell slots, a feat's prerequisites, a species' traits as modifiers) is the detection's to read.

- **Classes** (a file each, `classes/<name>.json`): the class (its hit die, primary abilities, saving throws,
  proficiencies and skill choices, spellcasting, starting equipment, what a multiclass gains), its levels in order (each
  its features, its proficiency bonus, its own counts, `class_specific`, and its spellcasting: cantrips, prepared spells,
  slots by spell level), its features by level, and each subclass with its levels and features, ordered by the class
  level that gives them.
- **Feats**: name, category (`origin`, `general`, `fighting-style`, `epic-boon`), prerequisites, whether it repeats,
  text.
- **Spells**: name, level (0 for a cantrip), school, the classes whose lists hold it, casting time, range, components,
  duration, ritual and concentration, damage, text and what a higher slot adds.
- **Species**: name, creature type, size (or the sizes it chooses between), speed, its traits whole, and its
  subspecies (an elf's lineages, a dragonborn's ancestries, a goliath's giant ancestries…), each with its traits.
- **Backgrounds**: name, its three abilities, its origin feat (and the choice it's taken with), its skill and tool
  proficiencies, its equipment.
- **Items**: the book's equipment: weapons (damage, properties, mastery, range), armor (its class, Strength, Stealth),
  adventuring gear, tools, packs, mounts and vehicles, each with its categories, cost and weight.
- **Magic items**: name, category, rarity, attunement and who it's limited to, text, and its variants.

A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else: a
re-scrape replaces `raw` and keeps `overrides`. Its `_meta` names its type, its book, the files it was read from and
when.

## License

The references hold the SRD 5.2.1's text, which its license requires attributing in Wizards' own words, and no other
way: see [OGL.md](../../OGL.md#system-reference-document-521).
