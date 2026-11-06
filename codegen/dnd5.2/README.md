# D&D 5th Edition Parser

Pipeline for reading the D&D 5th Edition 2024 rules, as the System Reference Document 5.2.1 gives them, into
reference JSON files, and generating the content's book from them (`content/dnd5.2/generated/srd/`): the content's
seed types, their modifiers' and requirements' targets the D&D 5th Edition engine's.

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

```bash
# Generate the book's content from its references, into content/dnd5.2/generated/
bun run parser:dnd5.2:generate
# The same, named by one of its reference files
bun run parser:dnd5.2:generate codegen/dnd5.2/reference/srd/feats.json
```

A generation runs in a copy of `generated/` (core's `GeneratedFolder.generateAtomically`), laid out by the repo's
lint and formatter, which takes its place only when the book succeeded: `generated/` is never half-written. A reader
that meets what it doesn't know (a proficiency, a rarity, an ability, a choice neither of skills nor of tools) refuses
the book, and so does a target naming a pool or a feat the book has none of, or two feats of one name
(`BookAptitudes.check`): a change of the database can't slip a stray name into the content.

## The source

The SRD 5.2.1 is under the Creative Commons Attribution 4.0 license, attributed in [OGL.md](../../OGL.md); its text
is published as a PDF. The [5e-bits database](https://github.com/5e-bits/5e-srd-api) (MIT) transcribes it into JSON, a file per kind of
entry (`packages/5e-database/src/2024/en/5e-SRD-<Kind>.json`): its classes, their levels and features, subclasses,
feats, spells, species, their subspecies and traits, backgrounds, equipment and magic items. The parser reads those
files at one commit of the repository (`DATABASE` in `tools/scraper/BaseScraper.ts`), so a scrape reads the same data
until that commit is changed on purpose. The database's own links (an entry's `url`, its API's routes, an item's
`image`) mean nothing outside its API, and are left out.

What the files give was checked against the SRD 5.2.1's text: its 339 spells (27 cantrips and 312 of levels 1 to 9),
each class's features by level, its skill and tool choices and its table's prepared spells, a subclass's features at
its class's levels, and the Weapons and Armor tables, their costs and weights included. Where the database differs from
the SRD, its reference's overrides say what the SRD gives:
- items: a Sling's damage (bludgeoning), a Trident's (1d8, 1d10 in two hands; the database has the 2014 rules'), Hide
  Armor's category (medium), Half Plate Armor's name, and 27 costs and weights (a Longbow's 50 GP, a Pike's 18 lb.);
- species: a Human's size, Medium or Small, as its player chooses;
- backgrounds: the Sage's Magic Initiate, the Wizard's;
- feats: Two-Weapon Fighting's name, and the abilities the Boon of Irresistible Offense (Strength or Dexterity) and
  the Boon of Spell Recall (Intelligence, Wisdom or Charisma) increase, where the database has the 2014 rules' "one
  ability score of your choice";
- classes: a druid's cantrips at levels 7 and 16 (3 and 4: the database counts one more), a wizard's prepared spells at
  levels 14 to 20 (18, 19, 21, 22, 23, 24 and 25: the database copies the other full casters' column), a rogue's
  weapons (the 2014 rules' Longswords left out: the SRD's are its Martial weapons with the Finesse or Light property),
  the skills a class picks among (a fighter's Persuasion and a wizard's Nature, which the database lacks, and a rogue's
  Performance, which it adds, its multiclass's pick too), and a monk's tools (the Disguise Kit and the Forgery Kit left
  out of its Artisan's Tools: the SRD files them under Other Tools). A class's overrides are by entry's name, the
  class's (`Rogue`) or a level's (`Druid 7`), each field in place of the database's;
- spells: Protection from Evil and Good's Concentration, which its duration names, and its material's words.

A species' trait the database links from its own side alone (a dragonborn's Draconic Ancestry) is read with the
species it names.

## Architecture

```
5e-bits files → Scraper → JSON reference file (raw + overrides)
JSON reference file → seeds (read, its overrides applied) → code writers → content/dnd5.2/generated/srd/
```

What every ruleset's parser shares is the core's (`codegen/core/`): a command's line (`cli/CommandLine`), the scrape
command (`cli/ScrapeCommand`), the references' store (`references/ReferenceStore`), a book's scraper
(`scraper/BookScraper`, which saves a reference with the overrides its file had) and the HTTP client, with its disk
cache. The D&D 5th Edition parser adds its own:

- `tools/cli/scrape.ts`: `parser:dnd5.2:scrape`, its types on core's scrape command.
- `tools/references/References.ts`: its store, each type's file in the book's folder (`feats.json`…, a class's
  `classes/<name>.json`). Loading a reference derives nothing: its seeds read it, its overrides applied
  (`{ ...raw, ...overrides[name] }`).
- `tools/scraper/`: its `Scraper`, a concern per kind of reference (`concerns/`: `ScrapesClasses`, `ScrapesSpecies`…)
  on its `BaseScraper` (core's `BookScraper`, with the database's files read whole, `dataset`, and the files a reference
  was read from, `datasetMeta`), and the files' reading into references (`datasets.ts`: the links stripped, a class's
  levels, features and subclasses gathered under it, a species' traits and subspecies read whole).
- `tools/types/`: a reference's type per kind, in the database's own field names (`hit_die`, `prof_bonus`), and what
  every entry shares (`common.ts`: a reference to another entry, a choice, a cost).
- `tools/cli/generate.ts`: `parser:dnd5.2:generate`, on core's generated folder (`GeneratedFolder`).
- `tools/seeds/`: the book's seeds (`BookSeeds`: its references, each kind's seeds built once, and what crosses kinds:
  its tools, which its classes' and backgrounds' proficiencies name, the pools of tools they pick among, the feats a
  class feature is, which a feat's prerequisite names), a class per kind (`FeatSeeds`, `SpellSeeds`, `SpeciesSeeds`,
  `BackgroundSeeds`, `ItemSeeds`, `MagicItemSeeds`; a class's in `classes/`: its entries as corrected,
  `ClassEntries`, its features' feats, `ClassFeatureFeats`, its proficiencies' feats, `ClassProficiencies`, and its
  progression, `ClassProgression`, on `ClassSeeds`), and the book's aptitudes and checks (`BookAptitudes`).
- `tools/detect/`: the readers the seeds read the references' words with: a text as a description takes it
  (`text.ts`), a proficiency's feats, an ability's abbreviation and a choice's options (`proficiencies.ts`), an ability
  score increase (`abilityIncreases.ts`), the spell lists a feat offers (`spellLists.ts`), a feature's Expertise and
  Weapon Mastery counts (`classFeatures.ts`), a cost (`costs.ts`), a magic item's rarity and base items
  (`magicItems.ts`), a spell's components and saving throw (`spells.ts`).
- `tools/terms/`: what the generator knows past the references' words, by name: the modifiers of the class features,
  feats and species traits a sheet reads a number of, the pools a feature gives room in and the counts a class's levels
  grow (`classFeatures.ts`, `feats.ts`, `species.ts`), the items' types and slots (`items.ts`), the abilities'
  abbreviations and numbers in words (`words.ts`).
- `tools/generator/`: the `Generator` (a book at a time), the book's (`BookGenerator`, on `BaseBookGenerator`, a
  concern per kind of file, `concerns/Generates*`), the generated tree (`BookLayout`) and the generated code
  (`code/CodeFile`, a concern per kind of seed, `code/concerns/Writes*`).

The generator reads the content's builders (its seed types, the pools' and the proficiency feats' names,
`builders/aptitudes/` and `builders/feats/proficiencies.ts`, an item's fields, `builders/items/fields.ts`) and, of
its hand-written data, the core rules' feats (`content/dnd5.2/data/feats/coreFeats.ts`: the saving throws', armor
trainings' and weapons' proficiencies, each weapon's mastery, and a cleric's and a druid's sacred roles, which no
reference lists as feats): a target may name them, and their pools are the book's.

The books' facts the parser reads are the ruleset's vocabulary (`vocabulary/dnd5.2/`: the book it reads).

## What a reference stores

Each kind stores the database's entries as it gives them, its text whole, its links left out: what they mean (a
class's spell slots, a feat's prerequisites, a species' traits as modifiers) is its seeds' to read.

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

## What the generated book holds

Each kind's seeds read its reference as its overrides correct it, its text plain (`detect/text.ts`: the PDF's
hyphenated line breaks joined, the Markdown's emphasis left out). A feature, a feat or a trait a sheet reads a number
of has its modifiers (`terms/`); any other is its text alone.

- **Classes** (12, `classes/<class>.ts`): its hit die and caster type (Pact Magic's, a full caster's whose slots reach
  level 9, a half caster's, or none), its links (its spellcasting ability, its Starting and Multiclass Proficiencies'
  feats), its skills (`classSkills`: its skills' pool, "Fighter Skills", lists their Skill Proficiency feats), its
  features by level, each a feat through its features' pool ("Fighter Features"; its subclass's placeholder past its
  pick left out), its levels' modifiers (its subclass's room at its pick, a General feat's at each Ability Score
  Improvement, an Epic Boon's, a Fighting Style's, its Weapon Mastery's kinds, by its levels' counts or its text, its
  Expertise's skills, by its text, and a monk's Unarmored Movement), its multiclass's requirements (13 in its primary
  abilities, one of a fighter's two), and its spells (its list, "Wizard Spells", and the cantrips and prepared spells
  it has by each level, a level's new ones at the highest spell level its slots reach then; a warlock's Mystic
  Arcanum a room at each of its spell levels in a pool of its own, "Mystic Arcanum (Level 6)", which lists the
  warlock's spells of that level alone, its prepared spells capped at its Pact Magic's 5th level).
- **Class feats** (`feats/classes/<class>.ts`): each feature's feat, named after its class ("Rage (Barbarian)"),
  granted at each level that lists it (stackable when it's several); each subclass a feat of its class's subclass pool
  ("Fighter Subclass", family Subclass), whose modifiers grant its features' feats ("Improved Critical (Champion)"),
  each from its class level on; its Starting Proficiencies' feat (its saving throws, armor training, weapons and tools
  granted, a room in its skills' and its tools' pools) and its Multiclass Proficiencies' (what the Multiclassing rules
  keep, and its skill or tool pick). The modified features: Unarmored Defense, Extra Attack and its fighter's two
  more, Fast Movement, Jack of All Trades, Druidic and Thieves' Cant (their languages, Thieves' Cant's one more to
  pick), Deft Explorer (its languages), Aura of Protection, Disciplined Survivor and Slippery Mind (their saving
  throws), Primal Champion and Body and Mind, Primal Knowledge (a room in the barbarian's skills' pool), Divine Order
  and Primal Order (a room in their pools, whose sacred roles are hand-written feats), and the subclasses' Improved and
  Superior Critical, Additional Fighting Style, Bonus Proficiencies and Draconic Resilience.
- **Feats** (`feats/feats.ts`, a list per category): each in its category's pool, and in the General's and the Epic
  Boon's, which take any feat a character qualifies for; its prerequisites as requirements (a level, an ability score,
  a class feature's feats); a feat taken with a choice a family of a feat per option: the Ability Score Improvement's
  21 spreads ("Ability Score Improvement (Strength +1, Dexterity +1)"), an ability score increase's abilities
  ("Grappler (Strength)", the Epic Boons'), Magic Initiate's spell lists (two cantrips' and a level 1 spell's rooms in
  the list's pool). Alert's initiative, Archery's, Defense's and Two-Weapon Fighting's bonuses, and Skilled's three
  skill picks are modifiers.
- **Spells** (339, `spells/level<n>.ts`): its fields (school, casting time, range, components and material,
  duration, ritual, concentration), its classes' lists at its level, the saving throw its text calls for first (its
  `resistedBy` link), and its text with what a higher slot or a cantrip's upgrade adds.
- **Species** (9, `species.ts`) and their feats (`feats/species.ts`): its size (Medium of those its player chooses
  between) and speed; its traits each a feat it grants, in its traits' pool, one printed alike by several species once
  (Darkvision (60 ft.)); a trait's choice of skills a room in the pool of any skill's proficiency, or a pool of its
  own whose feats each grant one ("Keen Senses: Perception"); its subspecies each a feat of its lineage's pool ("Elf
  Lineage": "Elven Lineage: Drow"), which it gives room in. A dwarf's toughness, a human's Versatile and a wood elf's
  speed are modifiers.
- **Backgrounds** (4, `backgrounds.ts`) and their feats (`feats/backgrounds.ts`): its three abilities, its Origin feat
  granted (a family's variant: "Magic Initiate (Cleric)"), its skills and tool granted, or a room in its tools' pool
  ("Soldier Tools"), and a room in its ability scores' pool, whose feats are its seven ways to spread its increases
  ("Acolyte: Intelligence +2, Wisdom +1").
- **Items** (`items/`): its weapons, armor and the Shield as templates, their fields the vocabulary's tables'
  (`weaponFields`…, a reference's item the tables lack, or the reverse, refuses the book); its gear and tools, their
  cost, weight and text; and a tool's proficiency a feat (`feats/tools.ts`), in the pool of every tool's and each pool
  of tools that offers it. Its magic items, each its type, rarity, attunement, slot (a ring's, an armor's, a worn
  wondrous item's by a word of its name), the template it's made from when its first line names one; a family the
  database gives under one name is its variants, and a +1, +2 or +3 weapon, armor or Shield a variant of each template
  ("Longsword +1"), its bonus a modifier.

## License

The references hold the SRD 5.2.1's text, which its license requires attributing in the words it gives, and no other
way: see [OGL.md](../../OGL.md#system-reference-document-521).
