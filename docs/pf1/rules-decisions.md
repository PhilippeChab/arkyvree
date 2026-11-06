# Pathfinder 1: rules decisions

How the Pathfinder 1 ruleset ("Core PSD 1", the Core Rulebook) reads its rules where the book is ambiguous, and where it deliberately differs from it. Its engine started as a copy of 3.5's (`engine/rulesets/pf1/`), so every ruling of [3.5's](../dnd3.5/rules-decisions.md) holds here too unless this page says otherwise. Each ruling is settled: change it only on purpose, and update this page with it. A ruling the engine or the content holds names the code that holds it.

## Characters

- **Skills are ranks, one a point.** A rank costs one point, class skill or not, and a skill's ranks never pass the character's level (`SkillRules.maxRank`, `MAX_RANKS_OVER_HIT_DICE` 0). A class skill with at least one rank adds +3 (`SkillRules.classSkillBonus`, `CLASS_SKILL_BONUS`). A first level gives no more points than any other: the 3.5 ×4 is gone (`SkillRules.levelPoints`).
- **The skills are the Core Rulebook's 35** (`vocabulary/pf1/skills.ts`): Acrobatics, Perception, Stealth, Linguistics… 3.5's Hide, Spot, Listen, Jump, Tumble and Speak Language don't exist. A language past those a race and a class grant is picked one per Linguistics rank (`LANGUAGE_SKILL`).
- **Combat maneuvers** are the sheet's: CMB is the base attack bonus, Strength and the size modifier; CMD 10 plus the base attack bonus, Strength, Dexterity and the size modifier (`SIZE_CMB_MOD`, `DEFAULT_CMD_BASE`).
- **The favored class bonus isn't modelled.** A level's +1 hit point or +1 skill rank in a favored class is the table's to add (a modifier on the character), as the engine has no pick for it yet.

## Creating a character

- **Point buy is the Core Rulebook's 15 points,** each score from 7 to 18 at its cost (`vocabulary/pf1/creation.ts`).
- **A race's "+2 to one ability score" is a pick.** A human, a half-elf or a half-orc gives one pick in the Racial Ability Score pool (`aptitudes.racialabilityscore.allowed`, read off its trait by `RaceTraits`), whose six feats each add +2 to an ability (`content/pf1/data/feats/racialAbilityScore.ts`), taken at 1st level like a human's bonus feat. A race's fixed adjustments (a dwarf's +2 Constitution, +2 Wisdom, −2 Charisma) are its own modifiers.
- **A racial trait applies only when it always applies.** A bonus against some creatures or effects, on checks "made to" do something, or of the player's choice of skill is left to the table, its text kept on the race (`RaceTraits`): a dwarf's Defensive Training, a gnome's Obsessive.

## Classes

- **A prestige class's saves are its own.** The Core Rulebook's prestige classes give a good save +1 at their 1st level and +5 at their 10th, and a poor one +0 and +3, unlike a base class's +2 and +0. They're presets of their own (`prestigeGood`, `prestigePoor` in `SAVE_PROGRESSIONS`), which the codegen reads off each prestige class's table and refuses a column that follows none, or a table without the column (`ClassTable`).
- **A loremaster's two Knowledge skills are one.** Her "Knowledge (any two) 7 ranks in each" checks any one Knowledge skill at 7 ranks (`skills.knowledge.rank`), as no path counts the skills at a rank: the second is the table's to check (`ClassRequirements`). Her "any three metamagic or item creation feats" are counted together, the metamagic feats at least three less the item creation feats (`{{ 3 - [feats.itemcreation.count] }}` on `feats.metamagic.count`), as 3.5's loremaster's are.
- **A bard's and a sorcerer's cantrips are level-0 slots.** Their tables start at 1st level; the cantrips they know are seeded as level-0 slots, though the book casts them at will.
- **A bond is a pick between its creature and what it offers instead.** A wizard's Arcane Bond, a druid's Nature Bond, a ranger's Hunter's Bond and a paladin's Divine Bond each give a pick in a pool of the feature's name, between two feats: its creature ("Arcane Bond: Familiar", which gives the pick of a familiar and its level) and the other ("Arcane Bond: Bonded Object", "Nature Bond: Domain", "Hunter's Bond: Companions", "Divine Bond: Bonded Weapon"), whose rules its description gives and the table applies (`BOND_FEATURES`, `FeatureModifiers.bondChoices`). An adept's familiar is no choice.
- **A cleric picks two domains at 1st level** in the Cleric Domain pool (her Domains feature, `FeatureModifiers`), each a feat that makes its domain's spell list hers, and has a domain slot at each spell level she casts.
- **A monk's and a ranger's bonus feats are a pool a tier.** Their lists grow with their level, so each tier is a pool of its own ("Monk Bonus Feat (6th)", "Ranger Combat Style (10th)"), each listing the earlier tiers' feats too. A ranger's two styles share one pool: his choice of style isn't enforced, and a bonus feat's prerequisites aren't waived.

## Spells

- **An opposition school hides no spell.** A wizard learns an opposition school's spells as any other; preparing one takes two slots, which is the table's to count. The spell picker leaves none out (`SpellPicker`), unlike 3.5's prohibited schools.
- **A spell is filed at its lowest level** on the Core Rulebook's lists, its level on each list written where they differ (`SpellSeeds`). A later book's class (magus, witch, oracle…) on a spell's Level line is left out.

## Not modelled yet

What the Core Rulebook gives that the sheet doesn't compute: the table adds it, a modifier on the character where it's a number.

- A class feature with no number the sheet reads: a fighter's Armor Training and Weapon Training, a duelist's Canny Defense, sneak attack, bravery, trap sense; and the picks some features give: rogue talents, rage powers, mercies, a sorcerer's bloodline, a loremaster's secrets.
- A half-elf's Adaptability (Skill Focus as a bonus feat), and a 1st-level wizard's spellbook's spells past the three his table gives (one per point of his Intelligence modifier).
- A Small character's gear weighing half.
- An expert's class skills. She chooses any 10 skills as class skills, and the engine has no pick of class skills (3.5's content has no expert to follow): the Expert is seeded with none, and the ten she picks are the table's, their +3 a modifier on the character.

## Content

- **Only the rules are kept.** The Core Rulebook's game mechanics are open game content, its proper names and flavor text product identity: a feat's description is its Benefit, a domain's its granted powers, a spell's and an item's their own text; a class's and a race's description is written in our own words. The Pathfinder Chronicler is the Chronicler (`codegen/pf1/README.md`).
- **Artifacts, cursed items and weapon or armor special abilities aren't seeded,** nor ammunition, siege engines and armor extras as items of their own (`ItemSeeds`, `MagicItemSeeds`).
