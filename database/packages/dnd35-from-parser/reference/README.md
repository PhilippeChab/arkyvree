# Reference JSON Schema

A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else. Loading it (`tools/references.ts`) derives what the generator reads: `detected`, parsed from `raw`, and `mapping`, the entities to generate with the overrides applied. So a correction takes effect at the next `parser:generate`, and re-scraping (which replaces `raw`) keeps it.

A class reference, as stored (see `tools/types.ts` for the definitive types):

```
_meta                               # Bookkeeping (type, book, url, timestamp)

raw                                 # Verbatim scrape from the HTML page
├── name, description               #   Class name & flavor text
├── hitDie, skillPointsPerLevel     #   Strings as they appear on page
├── classSkills[]                   #   Skill names from page
├── prerequisites                   #   Raw prereq text + parsed struct
│   └── parsed                      #     bab, skills, feats, spells, alignment, special,
│                                   #     saves, casterLevel, classLevels
├── progression[]                   #   Level table (BAB, saves, special, spellsPerDay)
├── classFeatures[]                 #   Feature name + type + description blocks
├── spellsKnown[]                   #   Separate "spells known" table if any
├── hasCantrips?                    #   Does spell table start at 0th?
└── bonusSpellAbility?              #   Detected from feature text

overrides                           # MANUAL — the only hand-edited part
├── description                     #   Override class description
├── requirements[]                  #   Override detected.requirements
├── classSkills[]                   #   Override raw.classSkills
├── bab, saves                      #   Override detected values
├── alignment                       #   Manual alignment constraint
├── proficiencies[]                 #   Weapon/armor proficiency strings
├── freeFeats[]                     #   [level, featName, aptitude]
├── modifiers[]                     #   Class-level modifiers (passive bonuses)
├── aptitudePicks[]                 #   Override detected.aptitudePicks
├── bonusFeatLists[]                #   Override detected.bonusFeatLists
├── casterType                      #   Override detected.casterType
├── bonusSpellAbility               #   Override mapping.bonusSpellAbility
├── spells{}                        #   Override mapping.spells fields
├── noSpells                        #   Suppress spell generation entirely
├── features{}                      #   Per-feature overrides (win over mapping.features)
└── reviewed[]                      #   Unresolved items already reviewed
```

And what loading it derives:

```
detected                            # Parsed from raw
├── hd, levels, skillPoints         #   Parsed numbers from raw strings
├── bab, saves                      #   Derived from progression table
├── requirements[]                  #   Parsed from prerequisites
├── featNameMap                     #   Slug → display name for prereq feats
├── featureOccurrences[]            #   Features from progression table (name → levels[])
├── spellsPerDay[][]                #   Parsed numeric spell table
├── spellsKnown[][]                 #   Parsed numeric spells known
├── hasOwnSpells?                   #   Whether class has own spell list (not advancement)
├── casterType?                     #   Arcane/Divine from feature text
├── casterLevelAdvancement?         #   { type, levels[] } — advances existing spellcasting
├── aptitudePicks[]                 #   Choice-granting features (levels + target)
├── bonusFeatLists[]                #   "Pick from these feats" lists (aptitude + feats)
├── unresolvedAptitudePicks[]       #   Couldn't map to valid target
├── unresolvedPrereqs[]             #   Recognized but couldn't map
└── errors[]                        #   Invalid paths

mapping                             # Built from detected, with the overrides applied
├── classFeatureAptitude            #   Main aptitude name (e.g. "Fighter Class Feature")
├── features{}                      #   Feature name → seed config
│   └── [name]
│       ├── seedName                #     Output feat name (e.g. "Evasion (Rogue)")
│       ├── description             #     From classFeatures text
│       ├── level                   #     Min level (from occurrences)
│       ├── stackable               #     Multiple levels = stackable
│       ├── selectable              #     Player picks vs auto-granted
│       ├── skip                    #     Exclude from generation
│       ├── aptitude                #     Custom aptitude (pool sub-options)
│       ├── modifiers[]             #     Auto-detected from description
│       └── aliases[]               #     Alt occurrence names
├── occurrenceMap{}                 #   Occurrence name → features{} key
├── bonusSpellAbility               #   Ability for bonus spells
├── spells{}                        #   Spell slot config (slug, perDay, known, knowAll,
│                                   #     noCantrips, inheritsFrom)
└── overrides                       #   The stored overrides
```

## How the generator reads it

1. Start with `detected` values (bab, saves, requirements, aptitudePicks, etc.)
2. Layer on `mapping` (features, spells, classFeatureAptitude)
3. `overrides` win over both — any field set there replaces the detected or mapped value
4. For features specifically: `overrides.features[name]` fields are merged on top of the detected feature (set a field to `null` to delete it)

`bun run parser:validate` reports an override that equals what's derived without it: it changes nothing, so remove it.
