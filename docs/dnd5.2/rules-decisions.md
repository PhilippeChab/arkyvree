# D&D 5th Edition: rules decisions

How the D&D 5th Edition ruleset ("Core SRD 5.2", the 2024 rules as the System Reference Document 5.2.1 gives them)
reads its rules where the SRD is ambiguous, and where it deliberately differs from it. Its engine started as a copy of
Pathfinder's (`engine/rulesets/dnd5.2/`), but the 2024 rules share few of its numbers: a ruling of
[Pathfinder's](../pf1/rules-decisions.md) or [3.5's](../dnd3.5/rules-decisions.md) holds here only where this page says
so. Each ruling is settled: change it only on purpose, and update this page with it. A ruling the engine or the content
holds names the code that holds it.

## Characters

- **The Proficiency Bonus is the character's, by its level** (`PROFICIENCY_BONUS_BY_LEVEL`, `ClassesComponent.getProficiencyBonus`):
  +2 at level 1, +6 at level 17, whatever its classes. Its path is `combat.proficiency`, for requirements and templates.
- **A saving throw per ability**, named as its ability is ("Strength"): its ability's modifier, the Proficiency Bonus when
  the character is proficient in it, and misc (`SavesComponent`). Proficiency is `saves.<ability>.proficient`, which a
  feat sets.
- **Skills take no ranks or points.** A skill adds its ability's modifier, the Proficiency Bonus when proficient, twice
  with Expertise, half (rounded down) with Jack of All Trades on an unproficient one, and misc (`SkillsComponent`,
  `skills.<skill>.proficient`, `.expertise`, `.halfproficient`; Jack of All Trades sets `skills.*.halfproficient`, a
  skill a ruleset adds included). The level-up has no skills step.
- **Proficiencies are feats.** A skill, a saving throw, an armor category, a weapon category or kind, a tool, a weapon
  mastery: each is a feat whose modifier sets the path it gives. A skill's Skill Proficiency and Expertise are made with
  the skill, in the Skill Proficiencies and Expertise pools (`SkillProficiencyFeats`, `ExpertiseFeats`), a skill a
  ruleset adds included.
- **A class's starting proficiencies are one feat, a first class's or a multiclass's.** A class names the feat its first
  level grants when it's the character's first class (`startingProficiencies`: its saving throws, armor training,
  weapons, tools and skill picks) and the smaller one it grants a multiclass (`multiclassProficiencies`, the SRD's
  Multiclassing table); the character's first level reads the first, a later class's first level the second
  (`LoadsPicks.startingAt`).
- **A background is a creation pick, as a species is.** The new character's form picks both (`background`, `species`
  links). A background's Origin feat, its two skills and its tool are its modifiers' grants; its ability score
  increases are a pick at the first level in its pool ("Sage Ability Scores"), between its seven ways to spread them
  (+2 and +1, or +1 to each of its three).
- **An increase past 20 isn't refused.** A background's, an Ability Score Improvement's or a feat's +1 raises a score to
  20 at most by the SRD; the sheet adds them as they come, the table keeps the cap.
- **Armor without its training is an issue, not a refusal.** A character wearing armor of a category it has no training
  in has Disadvantage on Strength and Dexterity tests and can't cast spells (`Diagnoses.findArmorIssues`); a Shield
  without training adds nothing to its Armor Class (`ArmorClass`).

## Combat

- **Armor Class** is 10 and Dexterity unarmored; an armor's and its Dexterity, capped at 2 in medium armor, none in
  heavy armor, a penalty included (Chain Mail's 16 whatever the wearer's Dexterity); a trained Shield's +2; and misc
  (`ArmorClass`). An Unarmored Defense is a modifier on `combat.ac.misc`
  gated on `combat.armor.category` none (and, a monk's, no Shield held), which reads its ability's modifier.
- **An attack** adds its ability's modifier (the better of Strength and Dexterity with a Finesse weapon, as the sheet
  stands once its increases apply; Dexterity with any other ranged weapon; Strength in melee, a thrown weapon's too), the Proficiency Bonus when proficient with the weapon (a feat sets `items.weapons.<kind or category>.proficient`),
  and its magic and misc; its damage, its ability's modifier, an off-hand attack's only when negative without the
  Two-Weapon Fighting style (`combat.twoweapon.ability`). A Versatile weapon in two hands rolls its two-handed dice
  (`Attacks`). A weapon's mastery property shows once a feat sets `items.weapons.<kind>.mastered`.
- **Extra attacks** are `combat.attacks`, which Extra Attack and the fighter's later features set.
- **Speed** is the species', 10 feet lower in armor whose Strength the wearer lacks, and 5 feet at most past the carrying
  capacity, Strength × 15 lb. for a Small or Medium creature (`CarryingComponent`). The 2024 rules have no load
  categories.

## Hit points

- **A character's first level gives its hit die's highest**; each later level rolls it or takes the fixed value, half the
  die plus 1 (`FIXED_HIT_POINTS_BY_DIE`), and Constitution's modifier adds to each, a level giving 1 at least.

## Spells

- **Spell slots are the Multiclass Spellcaster table's**, by the levels a character's classes count: all its levels in
  full casters' classes, and half its levels in the Paladin and Ranger classes together, rounded up once (the SRD's
  "Half your levels (round up) in the Paladin and Ranger classes", read as their sum: a Paladin 1 / Ranger 1 counts 1,
  not 2) (`SpellcastingState.countCasterLevels`); a single class's table gives the same. A warlock's Pact Magic
  slots are apart, by its level (`PACT_MAGIC_SLOTS`). The SRD has no third caster.
- **Prepared spells mix levels freely.** A class's table gives its cantrips and its prepared spells by level, a level's
  new spells counted at the highest level it casts then; the room past cantrips is one count, which any spell of level 1
  up to that highest level fills (a level 3 Bard's six spells, of levels 1 and 2 in any combination). A spell above it
  is overspent; cantrips stay apart (`AptitudesComponent.highestRoomOf`, `PicksDistribution`, `SpellPicker`).
- **A spell save DC is 8, the Proficiency Bonus and the casting class's spellcasting ability** (`SpellGroupingsComponent`),
  whatever the spell's level.

## Not modelled

- Weapon Mastery's choices changing at a Long Rest: a mastered weapon is picked at a level, as a feat.
- Attunement's limit of three items, and a Small character's gear.
