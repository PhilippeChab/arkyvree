# SRD Scraper & Seed Generator

Pipeline for scraping D&D 3.5 SRD HTML pages from dndtools.net into structured JSON reference files and generating TypeScript seed code.

## Usage

```bash
# Scrape all entities of a type for a book
bun run parser:scrape -- class --book srd
bun run parser:scrape -- feat --book srd
bun run parser:scrape -- spell --book srd
bun run parser:scrape -- domain --book srd --filter core
bun run parser:scrape -- race --book srd
bun run parser:scrape -- item --book srd
bun run parser:scrape -- magicItem --book dmg

# Scrape a single entity by URL
bun run parser:scrape -- class --url https://dndtools.net/classes/.../barbarian/ --book srd

# Generate TypeScript from a reference JSON
bun run parser:generate -- <path-to-json>

# Re-scrape and regenerate all existing references
bun run parser:sync
bun run parser:sync srd                     # filter by book
bun run parser:sync srd --type class         # filter by book + type

# Validate reference files for unresolved issues
bun run parser:validate
bun run parser:validate --type class
bun run parser:validate complete-warrior

# List all manual overrides across reference files
bun run parser:overrides
bun run parser:overrides --type feat
bun run parser:overrides complete-warrior

# Remove redundant mapping.overrides entries from class references
bun database/packages/dnd35-from-parser/tools/cleanupOverrides.ts
```

### Global scraper options

- `--no-cache` — Disable disk cache for HTTP requests
- `--delay <ms>` — Delay between requests (default: 200)

## Architecture

```
HTML page → Scraper → JSON reference file → Generator → TypeScript seed files
                            ↑
                      Human annotates
                      mapping section
```

Each reference JSON has three sections:
- **`raw`** — Scraped data, never manually edited. Regenerated on re-scrape.
- **`detected`** — Auto-computed values (BAB, saves, requirements, modifiers). Regenerated.
- **`mapping`** — Human-annotated section. Overrides, feature mappings, modifiers. Preserved on re-scrape.

## Supported entity types

### Classes

Scrapes class pages into `ClassReference` JSON with full progression tables.

**Auto-detected:**
- Class name, description, hit die, skill points
- Class skills (including Knowledge subspecialties)
- Progression table (BAB, saves, special features, spells per day)
- BAB type (good/medium/poor), save types (good/poor)
- Prerequisites: BAB, skills, feats, caster level, alignment, race, weapon proficiency
- Compound feat requirements (e.g. "Weapon Focus (longbow or shortbow)" → `or()`)
- Caster level advancement from "+1 level of existing" text
- Spell tables (per day + known), with footnote stripping
- Bonus spell ability from class feature text
- Feature name normalization (+Nd6, +N, N/day, N ft., etc.)
- `knowAll: true` inferred when spells per day exists but no spells known table
- Free feat auto-detection by cross-referencing features against known feat names

**Needs manual annotation in `mapping`:**
- `modifiers` — Structured stat modifiers from prose descriptions (e.g. Dragon Disciple ability boosts)
- `aptitudePicks` — Links "choose an ability" features to aptitude pool slugs
- `overrides` — Any corrections to auto-detected values

### Feats

Scrapes feat listing and detail pages into `FeatReference` JSON.

**Auto-detected:**
- Feat name, type (General, Fighter, Metamagic, etc.), description, benefit
- Prerequisite text parsing into structured requirements (ability scores, BAB, feats, skills, caster level)
- Template feat detection (e.g. "Weapon Focus" expands into per-weapon variants)
- Stackable feat detection
- Modifier detection from benefit text

**Needs manual annotation in `mapping.overrides`:**
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

Scrapes domain pages into `DomainReference` JSON.

**Auto-detected:**
- Domain name, granted power description
- Spell list with levels
- Modifier detection from granted power text

**Needs manual annotation in `mapping.overrides`:**
- Description corrections (many dndtools.net pages lack granted power text)
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

Scrapes magic item pages into `MagicItemReference` JSON. Covers wondrous items, rings, rods, and staffs.

**Auto-detected:**
- Item name, description, cost, weight, category
- Base item template detection (e.g. "+1 Longsword" → sourceItem "Longsword")
- Slot assignment (head, neck, hands, etc.)
- Modifier detection from item descriptions (save bonuses, skill bonuses, ability bonuses)

## What needs manual annotation in `mapping`

- **`modifiers`** — Structured stat modifiers from prose descriptions (e.g. Dragon Disciple ability boosts, natural armor)
- **`aptitudePicks`** — Links "choose an ability" features to app-specific aptitude pool slugs
- **`freeFeats` vs `classFeatures`** — Distinguishing existing feats granted for free (e.g. Augment Summoning) from class-specific features (auto-detected by cross-referencing against scraped feat names)
- **`overrides`** — Any corrections to auto-detected values

> Customizations MUST go in `mapping`, not `detected` — `detected` is rebuilt from scratch on every re-scrape, `mapping` is preserved.
