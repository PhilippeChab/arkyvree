# Pathfinder 1 Parser

Pipeline for scraping Pathfinder 1 books' pages from the Archives of Nethys (aonprd.com) into reference JSON files, and
generating the content's books from them (`content/pf1/generated/<book>/`): the content's seed types, their modifiers'
and requirements' targets the Pathfinder engine's.

## Usage

```bash
# Scrape a book's entries of a type, the Core Rulebook's by default
bun run parser:pf1:scrape -- class
bun run parser:pf1:scrape -- feat --book advanced-players-guide
bun run parser:pf1:scrape -- spell
bun run parser:pf1:scrape -- race
bun run parser:pf1:scrape -- domain
bun run parser:pf1:scrape -- item
bun run parser:pf1:scrape -- magicItem

# Read one page, printed: no reference is written
bun run parser:pf1:scrape -- class --url "https://aonprd.com/PrestigeClassesDisplay.aspx?ItemName=Arcane%20Archer"
```

Options: `--no-cache` (fetch every page, past the disk cache, `tools/scraper/.cache/`, which git ignores), `--delay <ms>`
(between requests, 200 by default).

```bash
# Generate every book's content from its references, into content/pf1/generated/
bun run parser:pf1:generate
# The books a filter picks (a book, a type of reference, a name), or one reference file's book
bun run parser:pf1:generate core-rulebook --type race
bun run parser:pf1:generate codegen/pf1/reference/core-rulebook/items.json
```

A generation runs in a copy of `generated/` (core's `GeneratedFolder.generateAtomically`), laid out by the repo's
lint and formatter, which takes its place only when every book succeeded: `generated/` is never half-written. What the
readers leave to review (a race's traits no modifier is, a domain's spell no spell is, the items left out) is logged.

## The site

aonprd.com is Paizo's official rules archive. Each of its books has a page (`SourceDisplay.aspx?FixedSource=<book>`)
listing everything the book prints, under a heading per kind ("Feats [176]", "Prestige Classes [10]"), each entry a
link to its own page. An entry's page opens with its title and a Source line naming every book that prints it and the
page ("PRPG Core Rulebook pg. 131"), then its text: bold labels and their values ("<b>Benefit</b>: …",
"<b>Range</b> long (400 ft. + 40 ft./level)"), frames under h3 headings (a spell's Casting, Effect and Description),
sections under h2 headings (a class's Class Skills and Class Features). An entry's page also shows other books'
material about it past its own (a spell's mythic version, a race's subraces and alternate traits, a class's alternate
capstones and favored class options), each under a heading that opens with its own Source line: each page reads the
entry's own parts, up to the first such heading, and stops there.

A book's page lists what later books reprint: Ultimate Equipment lists the Core Rulebook's weapons, and an entry's
Source line names both books, in no fixed order (a dwarf's: Inner Sea Races, the Core Rulebook, the Advanced Race
Guide). An entry belongs to the earliest of the books the scraper reads that prints it (`BOOKS` in `vocabulary/pf1/books.ts`, in
publication order): a later book's scrape leaves it out, logging it as a reprint.

## Architecture

```
aonprd.com pages → Scraper → JSON reference file (raw + overrides)
JSON reference file → seeds (detection, as read) → code writers → content/pf1/generated/<book>/
```

Unlike 3.5's, a Pathfinder reference stores no `detected` or `mapping`: its seeds read it as they're built.

- `tools/cli/generate.ts`: `parser:pf1:generate`.
- `tools/seeds/`: a book's seeds (`BookSeeds`: its references, each kind's seeds of a reference, built once), a class
  per kind (`RaceSeeds`, `DomainSeeds`, `ItemSeeds`, `MagicItemSeeds`, `FeatSeeds`, `SpellSeeds`,
  `classes/ClassSeeds`), and the book's aptitudes (`BookAptitudes`: every aptitude its seeds and the core rules'
  hand-written feats name, a target's slug of none refused, a bonded creature's aside).
- `tools/detect/`: the readers a kind's seeds read its pages with: a race's traits (`RaceTraits`), a domain's lines
  (`DomainDetails`), an item's costs and weights (`amounts`), a specific magic item's base item, stats and
  enhancement (`MagicItemText`) and the bonuses it gives worn or held (`MagicItemBonuses`); the feats', spells' and
  classes' in their folders.
- `tools/generator/`: the `Generator` (a book at a time), a book's (`BookGenerator`, on `BaseBookGenerator`, a concern
  per kind of file, `concerns/Generates*`; what crosses kinds is its own: a class's bonus feat list's aptitude added to
  the feats it names, the book's aptitudes), the generated tree (`BookLayout`) and the generated code
  (`code/CodeFile`, a concern per kind of seed, `code/concerns/Writes*`). The Core Rulebook is the core rules: what a
  book copies from them (`cowFeats.ts`, `cowSpells.ts`) is empty.

A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else: a
re-scrape replaces `raw` and keeps `overrides`. Its `_meta` names its type, its book, the page it was read from and when.

What every ruleset's parser shares is the core's (`codegen/core/`): a command's line (`cli/CommandLine`), the scrape
command (`cli/ScrapeCommand`: its type, book and page, its usage, a table of the ruleset's types), the references'
store (`references/ReferenceStore`: a folder per book, a file per reference, written only when more than when it was
scraped changed, loaded once), a book's scraper (`scraper/BookScraper`: its book, its HTTP client, its references'
saving with their overrides kept), the HTTP client and the page. The Pathfinder 1 parser adds its own:

- `tools/cli/scrape.ts`: `parser:pf1:scrape`, its types on core's scrape command.
- `tools/references/References.ts`: its store, each type's file in a book's folder (`feats.json`…, a class's
  `classes/<name>.json`). Loading a reference derives nothing yet: that's the detection's to come.
- `tools/scraper/`: its `Scraper`, a concern per kind of reference (`concerns/`: `ScrapesClasses`, `ScrapesFeats`…) on
  its `BaseScraper` (core's `BookScraper`, with the books it reads and their names on the site, a book's listing of a
  kind's entries, `listing`, where a link of the site's that leads to no entry is followed to the page it means,
  `MISLINKED`, and the reading of each entry's page, `readEntries`, which leaves out a reprint and a page it can't read,
  and reads a page the book lists under several names once, with each name: an item's variants, a magic item's
  bonuses).
- `tools/scraper/pages/`: a class per kind of page, on `AonPage` (the entry's title, its sources, its parts by heading,
  and their readings: labelled paragraphs, a stat block's inline fields, tables): the book's `SourcePage`, `ClassPage`,
  `FeatPage`, `SpellPage`, `RacePage`, `DomainPage` (a domain, and a subdomain off its section of its domain's page),
  `ItemPage` (mundane and magic). The tests read saved pages through them (`tests/codegen/pf1/fixtures`).
- `tools/types/`: a reference's type per kind, and what every page gives (`pages.ts`: a `Printing`, a book and page an
  entry is printed on; a `LabeledText`; a `PageTable`).

The books' facts the parser reads are the ruleset's vocabulary (`vocabulary/pf1/`: the core rules' book).

## What a reference stores

Each kind stores its page's rules as the page gives them, its text whole: what they mean (a class's base attack bonus
progression, a feat's prerequisites, a spell's levels by class) is the detection's to read.

- **Classes** (a file each): name, whether its book lists it as a prestige class, sources, its labelled details (a base
  class's alignment, its hit die, starting wealth, skill points at each level), a prestige class's requirements, its
  class skills' sentence, its tables (its progression, each spells per day column after its group's name, "Spells Per
  Day 1st"; a spontaneous caster's spells known) and its features, each labelled ("Bravery (Ex)"), and what befalls an
  ex-member (an ex-cleric's), if any.
- **Feats**: name, types (off its title: "Power Attack (Combat)"), sources, labelled sections (Prerequisites, Benefit,
  Normal, Special…).
- **Spells**: name, sources, its stat block by label (School, Level, Casting Time, Components, Range, Area, Target,
  Effect, Duration, Saving Throw, Spell Resistance…), description.
- **Races**: name (its book's: "Dwarf", though its page's title is "Dwarves"), sources, racial traits, each labelled
  ("+2 Constitution, +2 Wisdom, –2 Charisma").
- **Domains**: name, whether it's a subdomain, sources, its labelled lines (granted powers and each power, domain
  spells; a subdomain's associated domains, replacement power and spells).
- **Items**: name, category (weapon, armor, goods), sources, statistics by label, description, its page's other
  sections under their headings, and the names its book lists its page under (`listedAs`: "Lock (average)", "Lock
  (good)"…, each a variant the book prints, its statistics pricing each, other books' variants among them; its name
  alone for most).
- **Magic items**: name, category (armor, weapon, ring, rod, staff, wondrous, artifact, cursed), sources, stat block by
  label (Aura, CL, Slot, Price, Weight; an artifact and a cursed item have no price), description, construction by
  label (Requirements, Cost), its page's other sections under their headings (an artifact's Destruction, a Ring of
  Elemental Command's Air, Earth, Fire and Water), and the names its book lists its page under (`listedAs`: one per
  bonus, "Cloak of Resistance (+1)"…).

## What's left out, and descriptions

Paizo declares only the game mechanics of its books open game content, and their proper names product identity (see
[OGL.md](../../OGL.md)). So the scraper keeps the rules alone, and leaves out:

- a class's description and its role, and a prestige class's alignment paragraph (who takes it: its alignment's rule
  is among its requirements; `ClassPage`);
- a race's description and its paragraphs, its physical description, society, relations… (`RacePage`);
- a feat's opening line (`FeatPage`);
- a domain's and a subdomain's deities (`DomainPage`);
- the sections later books add to an item, which the site prints without a Source line of their own: an ioun stone's
  Resonance, a good's Alchemical Recipe (`ItemPage`);
- the site's own notes, "From Nethys" (`AonPage`).

A name that carries Paizo's trademark, product identity too, is renamed in its reference's overrides: the Pathfinder
Chronicler is the Chronicler (`overrides.name`). The ruleset is shown as "Core PSD 1" (`content/pf1/rulesetNames.ts`).

The descriptions the content gives what's left without one are written by hand, as 3.5's are reworded: a class's and a
race's in its reference's overrides (a class's `overrides.description`, a race's `overrides.<race>.description`), in
the parser's own words, from its rules, kept across re-scrapes. A feat's description will be its Benefit and a domain's
its Granted Powers, which are rules; a spell's and an item's are their own text.
