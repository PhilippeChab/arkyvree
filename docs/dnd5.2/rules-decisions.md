# D&D 5th Edition: rules decisions

How the D&D 5th Edition ruleset ("Core SRD 5.2", the 2024 rules as the System Reference Document 5.2.1 gives them)
reads its rules where the SRD is ambiguous, and where it deliberately differs from it. Its engine started as a copy of
Pathfinder's (`engine/rulesets/dnd5.2/`), but the 2024 rules share few of its numbers: a ruling of
[Pathfinder's](../pf1/rules-decisions.md) or [3.5's](../dnd3.5/rules-decisions.md) holds here only where this page says
so. Each ruling is settled: change it only on purpose, and update this page with it. A ruling the engine or the content
holds names the code that holds it.

## Characters

- **The Proficiency Bonus is the character's, by its level** (`PROFICIENCY_BONUS_BY_LEVEL`, `ClassesComponent.getProficiencyBonus`):
  +2 at level 1, +6 at level 17, whatever its classes, and what modifiers add (`combat.proficiencymisc`: an Ioun Stone of
  Mastery's +1), which its saves, skills, attacks and spell DCs take. Its total is `combat.proficiency`, for requirements
  and templates.
- **A saving throw per ability**, named as its ability is ("Strength"): its ability's modifier, the Proficiency Bonus when
  the character is proficient in it, and misc (`SavesComponent`). Proficiency is `saves.<ability>.proficient`, which a
  feat sets.
- **Skills take no ranks or points.** A skill adds its ability's modifier, the Proficiency Bonus when proficient, twice
  with Expertise, half (rounded down) with Jack of All Trades on an unproficient one, and misc (`SkillsComponent`,
  `skills.<skill>.proficient`, `.expertise`, `.halfproficient`). Jack of All Trades sets `skills.*.halfproficient`, which
  reaches every skill, one a ruleset adds included. The level-up has no skills step.
- **Proficiencies are feats.** A skill, a saving throw, an armor category, a weapon category or kind, a tool, a weapon
  mastery: each is a feat whose modifier sets the path it gives. A skill's Skill Proficiency and Expertise are made with
  the skill, in the Skill Proficiencies and Expertise pools (`SkillProficiencyFeats`, `ExpertiseFeats`), a skill a
  ruleset adds included; its Expertise requires proficiency in it however the character has it
  (`skills.<skill>.proficient`, a homebrew feat's too). A class whose skill picks are any skill (a bard's) picks them in
  the Skill Proficiencies pool, which a new skill joins.
- **A class's starting proficiencies are one feat, a first class's or a multiclass's.** A class names the feat its first
  level grants when it's the character's first class (`startingProficiencies`: its saving throws, armor training,
  weapons, tools and skill picks) and the smaller one it grants a multiclass (`multiclassProficiencies`, the SRD's
  Multiclassing table); the character's first level reads the first, a later class's first level the second
  (`LoadsPicks.startingAt`).
- **A background is a creation pick, as a species is.** The new character's form picks both (`background`, `species`
  links). A background's Origin feat, its two skills and its tool are its modifiers' grants; its ability score
  increases are a pick at the first level in its pool ("Sage Ability Scores"), between its seven ways to spread them
  (+2 and +1, or +1 to each of its three), as a Pathfinder human's "+2 to one ability" is a pick its modifier opens. A
  background has no field naming its three abilities, which would only repeat its pool's feats: its description names
  them, and a fork's background raises what its pool's feats raise.
- **A character's languages are Common, which its species grants, and its picks.** Every SRD species grants Common
  (`languages.common.known`, a modifier, as a 3.5 race's automatic languages are), so a fork's species speaks it once
  its modifiers say so, and a fork that renames Common edits what names it, as any modifier naming a language. Past
  it, a new character picks two standard languages, and one more per extra pick a feature gives "from the language
  tables" (`languages.extrapicks`: a rogue's Thieves' Cant, a ranger's Deft Explorer): as many of its picks as its extra
  picks may be rare, so a Rogue 1 picks Abyssal beside two standard ones, and a fighter none (`SpokenLanguages`).
- **An increase past 20 isn't refused.** A background's, an Ability Score Improvement's or a feat's +1 raises a score to
  20 at most by the SRD; the sheet adds them as they come, the table keeps the cap.
- **Armor without its training is an issue, not a refusal.** A character wearing armor of a category it has no training
  in has Disadvantage on Strength and Dexterity tests and can't cast spells (`Diagnoses.findArmorIssues`); a Shield
  without training adds nothing to its Armor Class, its magic bonus neither (a Shield +1's, on `combat.ac.shield`, as
  3.5's are: `ArmorClass`).

## Combat

- **Armor Class** is 10 and Dexterity unarmored; an armor's and its Dexterity, capped at 2 in medium armor, none in
  heavy armor, a penalty included (Chain Mail's 16 whatever the wearer's Dexterity); a trained Shield's +2; and misc
  (`ArmorClass`). **An Unarmored Defense is another base AC calculation, of which one counts:** its modifier sets its
  ability's flag (`combat.ac.unarmored.<ability>`: a Barbarian's Constitution, a Draconic Sorcerer's Charisma, and a
  Monk's Wisdom, gated on no Shield held, so set in each weapon set without one), and without armor the base adds the
  best ability set, when above 0. A Barbarian 1 /
  Monk 1 adds the better of Constitution and Wisdom, not both; a Barbarian of Constitution 8 keeps 10 and Dexterity:
  the SRD's "you choose which calculation to use; you can't use more than one".
- **An attack** adds its ability's modifier (the better of Strength and Dexterity with a Finesse weapon, as the sheet
  stands once its increases apply; Dexterity with any other ranged weapon; Strength in melee, a thrown weapon's too), the Proficiency Bonus when proficient with the weapon (a feat sets `items.weapons.<kind or category>.proficient`),
  and its magic and misc; its damage, its ability's modifier, an off-hand attack's only when negative without the
  Two-Weapon Fighting style (`combat.twoweapon.ability`). A Versatile weapon in two hands rolls its two-handed dice
  (`Attacks`). A weapon's mastery property shows once a feat sets `items.weapons.<kind>.mastered`.
- **A monk's Martial Arts** lets its Unarmed Strike and its Monk weapons (Simple melee weapons, and Martial melee ones
  with Light, by name) attack with Dexterity as a Finesse weapon does (`items.weapons.<weapon>.finesse`), and its levels
  give each its die from the Monk table (`damage.die`: 6 sides, 8 from its 5th level, 10 from its 11th, 12 from its
  17th, as a 3.5 monk's levels give its unarmed damage), which a weapon rolls when better than its own dice (a
  Quarterstaff's d8 in two hands stays): a Monk 1 of Dexterity 16 strikes unarmed at +5 for 1d6+3. Both hold while it
  wears no armor, in each weapon set holding no Shield (a weapon modifier gated on the set reaches that set's weapons
  alone: `Builds.scopesOf`); that it wields only Monk weapons isn't checked.
- **Extra attacks** are `combat.attacks`, which Extra Attack sets to 2 and the fighter's Two and Three Extra Attacks to
  3 and 4: two classes' Extra Attacks don't stack (a Fighter 5 / Paladin 5 makes 2), and the sheet keeps the most any
  feature sets, whatever the order the classes were taken in (a Fighter 11 / Paladin 5 makes 3, the Paladin's level
  taken first or last). A modifier raises the count, never lowers it (`CombatState`).
- **Speed** is the species', 10 feet lower in armor whose Strength the wearer lacks, and 5 feet at most past the carrying
  capacity, Strength × 15 lb. for a Small or Medium creature (`CarryingComponent`), its size counted larger by what
  modifiers add (`combat.carrying.sizesteps`: a goliath's Powerful Build's one, so a Strength 15 goliath carries 450 lb.).
  The 2024 rules have no load categories.

## Hit points

- **A character's first level gives its hit die's highest**; each later level rolls it or takes the fixed value, half the
  die plus 1 (`FIXED_HIT_POINTS_BY_DIE`), and Constitution's modifier adds to each, a level giving 1 at least.

## Spells

- **A class's levels give its spell slots, as D&D 3.5's do.** Each level of a casting class adds its new slots to its
  spell list, as its table in the SRD gives them (`aptitudes.<list>.<level>.uses`; its page's Spell Slots table): a
  Wizard's 3rd level adds a 4th level 1 slot and two level 2 slots. A character casting from one class has that
  class's slots, the SRD's "follow the rules for that class" (`SpellcastingState.ownSlotsOf`). A class's first level's
  slots wait on its multiclass prerequisites, as its other modifiers do, a first class's too once the character
  multiclasses: a level forced past them gives none, and the class's later levels count up without them (a forced
  Fighter 1 / Wizard 5 of Intelligence 10 has 2 / 3 / 2; a forced warlock's Pact Magic stays a slot level behind),
  as a 3.5 druid's first level's slots go with his alignment. The sheet flags the prerequisite it misses.
- **Casting from more than one class, the Multiclass Spellcaster table's slots replace theirs**, at the levels the
  classes count. Each class says how its levels count (its Multiclass Spell Slots, `MULTICLASS_SLOTS`): all of a
  bard's, a cleric's, a druid's, a sorcerer's and a wizard's; half of a paladin's and a ranger's, together, rounded up
  once (the SRD's "Half your levels (round up) in the Paladin and Ranger classes", read as their sum: a Paladin 1 /
  Ranger 1 counts 1, not 2); none of a class without the Spellcasting feature (`SpellcastingState.countSlots`,
  `countCasterLevels`). A Ranger 4 / Sorcerer 3 counts 5, the SRD's example. A class casts when its levels give it
  slots, whatever its Multiclass Spell Slots says (`castingClasses`): a homebrew caster left at the field's default,
  "Its levels don't count", has its own slots, alone or beside the shared table's. A class's own table is the Multiclass
  Spellcaster table's at the levels it counts (a test holds it), so a class alone and its count never disagree. Slots a
  feat or an item adds to a class's list count for a character casting from that class alone: the shared table
  replaces them, as the SRD gives no other slots to a multiclass.
- **A warlock's Pact Magic is apart.** Its levels add its slots and raise their level (`spellcasting.pact.slots`,
  `spellcasting.pact.level`), by its table (`PACT_MAGIC_SLOTS`), and count toward no other slots: Pact Magic isn't the
  Spellcasting feature. A Warlock 3 / Wizard 2 has two level 2 Pact Magic slots and the wizard's own three level 1
  slots. The SRD has no third caster.
- **Prepared spells mix levels freely.** A class's table gives its cantrips and its prepared spells by level, a level's
  new spells counted at the highest level it casts then; the room past cantrips is one count, which any spell of level 1
  up to that highest level fills (a level 3 Bard's six spells, of levels 1 and 2 in any combination). A spell above it
  is overspent; cantrips stay apart (`AptitudesComponent.highestRoomOf`, `PicksDistribution`, `SpellPicker`).
- **A spell save DC is 8, the Proficiency Bonus and the casting class's spellcasting ability** (`SpellGroupingsComponent`),
  whatever the spell's level.

## Content

- **A subclass is a feat**, picked at its class's 3rd level in the class's subclass pool ("Fighter Subclass"), whose
  modifiers grant its features at their class levels (`classes.<class>.level`). The Add Level wizard lists a feature
  with the level that gives it, and opens a pick it gives there (a Champion's Additional Fighting Style at Fighter 7),
  as it lists what any modifier gives with a level: the saving throws a first class's starting proficiencies give
  (`LevelUpState.givenWith`).
- **An Ability Score Improvement takes any feat the character qualifies for.** Its pick is named for it (the Ability
  Score Improvement pool, where a General feat is picked too) and lists every feat, each behind its prerequisites (an
  Epic Boon's level 19 among them), and the Epic Boon pool every feat: the SRD's "or another feat of your choice for
  which you qualify". The Ability Score Improvement feat is 21 variants, a spread each (+2 to one ability, or +1 to
  two), a feat that raises a score of your choice a variant per ability ("Grappler (Strength)").
- **A species' lineage is a pick** in its lineage pool ("Elf Lineage"), at the first level, whose feats are its
  subspecies with their traits: an elf's lineage, a gnome's, a dragonborn's ancestry, a goliath's, a tiefling's legacy.
- **A species that chooses its size is Medium** (a human's, a tiefling's): a Small one's size is a modifier on its
  character.
- **A feat is taken once unless the SRD calls it Repeatable,** whichever version: each version of Grappler, or of an
  Epic Boon that raises an ability of your choice, requires the others unheld (`feats.grapplerdexterity.possessed`
  false), so a character with Grappler (Strength) is refused Grappler (Dexterity). The Ability Score Improvement,
  Magic Initiate (on another spell list) and Skilled repeat.
- **A feat that requires a class feature requires its family.** A Fighting Style feat's "Fighting Style Feature" and
  Boon of Spell Recall's "Spellcasting Feature" are families (`FEATURE_FAMILIES`), each class's feature a feat of its
  family ("Fighting Style (Paladin)"), which the prerequisite reads (`feats.fightingstyle.*.possessed`): a fork's class
  qualifies through its own feature once its family says so, whatever it's named.
- **A paladin's Blessed Warrior and a ranger's Druidic Warrior are feats** of the Fighting Style pool, each behind its
  class's own Fighting Style, that give two cantrips on the Cleric's or the Druid's list
  (`content/dnd5.2/data/feats/fightingStyleOptions.ts`): picked at the class's level, they're cast with its ability, a
  paladin's Charisma, a ranger's Wisdom.
- **Magic Initiate is a feat per spell list** (Cleric, Druid, Wizard), its two cantrips and its level 1 spell rooms on
  that list.

## Not modelled

- Weapon Mastery's choices changing at a Long Rest: a mastered weapon is picked at a level, as a feat. A barbarian's
  mastery isn't limited to melee weapons, and a mastery's pick doesn't require proficiency with its weapon.
- Attunement's limit of three items, and a Small character's gear.
- Skilled's tool proficiencies (it gives three skills), and a Scholar's or another feat's Expertise limited to some
  skills.
- A feature with no number the sheet reads: Rage, Sneak Attack, Bardic Inspiration, Channel Divinity, Wild Shape and the
  like keep their text.
- A bard's Magical Secrets: its prepared spells come from its own list alone, not the Cleric's, the Druid's or the
  Wizard's. Blessed and Druidic Warrior's cantrips aren't swapped at a later level.
- A weapon's own critical range: the range is the character's (`combat.critical.range`, a Champion's), so a homebrew
  keen weapon's modifier widens every weapon's.
- A warlock's Mystic Arcanum offers the spells its pools list ("Mystic Arcanum (Level 6)"): a fork's new level 6 warlock
  spell joins the pool as well as the list. Two classes with Pact Magic add their slot levels together (the SRD has
  one).
- Spells a feature or a trait always has prepared: a Life Domain's Aid at Cleric 3, a drow's Faerie Fire at 3rd level.
  Its description lists them; no modifier makes them known.
