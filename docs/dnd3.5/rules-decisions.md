# D&D 3.5: rules decisions

How the D&D 3.5 ruleset reads its rules where the SRD is ambiguous, and where it deliberately differs from them. Each ruling is settled: change it only on purpose, and update this page with it. A ruling the engine holds names the code that holds it.

## Characters

- **An Intelligence increase grants skill points retroactively.** Every level counts its skill points with the character's current skill-point ability modifier (`SkillRules.levelPoints`, read by the skills component), so raising Intelligence adds points to the levels already taken. The PHB's non-retroactive reading was weighed and set aside.
- **A class's ability boosts are misc bonuses.** A class that raises an ability (the Dragon Disciple's) targets `abilities.<name>.misc`, like every class, feat and item bonus; `abilities.<name>.level` isn't a modifier path. The SRD's "as if gained from character level advancement" (which would count the boost toward skill points) was set aside.
- **No epic levels or spells.** A character stops at level 20 whatever its classes (`MAX_CHARACTER_LEVEL`), a class at level 20 (`MAX_CLASS_LEVEL`, `vocabulary/dnd3.5/classes.ts`), spell levels run 0 to 9 (`MAX_SPELL_LEVEL`), and bonus caster levels never take a class past 20 (`BonusCasterLevels`). Epic material in a source is left out.
- **A shield's maximum Dexterity is its slot's,** as an armor's is: the AC caps the Dexterity bonus by both, and a modifier reaches it (`ShieldsComponent`).
- **Encumbered speed is one rule:** two thirds of the speed, rounded up to the next 5 ft. (`EncumbranceComponent.getEncumberedSpeed`). It gives the SRD table's speeds exactly, and every other speed the same way (25 ft. → 20 ft.).

## Creating a character

- **The ability-score methods are the dialog's guide.** Point buy's budget, the standard array and the rolls set the scores in the form; the server checks each score against its bounds only (`describeCreation().scores`), since the request doesn't say which method made them.

## Levelling up

- **A 1st level's hit points are rolled (or entered) like any level's,** within 1 and the hit die. The SRD's maximum at 1st level isn't enforced: tables differ.
- **An overfull pool is refused, never trimmed.** A level-up's save or edit that picks more feats or spells than a pool has room for is refused with the pool and its room, forced or not (`PicksDistribution.refuseOverfull`, through core's `LevelsPlanning`). No pick is dropped silently; the wizard's steps answer each pool's room so it never sends too many.
- **The skills step's "Auto" is a convenience, not a rule.** It spreads the points at random within the caps the engine answers, class and cross-class skills alike; a player adjusts what it picks.

## Content

- **A school's Spell Focus stays.** The Spell Focus and Greater Spell Focus feats a school generates aren't removed with a spell (`SpellFocusFeats`), unlike a skill's Skill Focus, which goes with its skill (`SkillFocusFeats`).
- **A class level may give 0 skill points.** A familiar uses its master's skills, so its seeded levels hold 0, and the class level form accepts it.
