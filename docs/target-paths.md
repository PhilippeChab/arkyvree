# Target Paths

All available paths for modifiers and requirements. Dynamic segments are shown as `<name>`.

Paths marked "req only" are available as requirement targets but not modifier targets.

A part the sheet computes when read (the totals, an ability's modifier, a skill's or a save's `ability`, a skill's `weight`, `combat.ac.dexterity`, `size`, `touch` and `flatfooted`, `combat.hp.constitution`, `combat.initiative.dexterity`, the grapple's `bab`, `strength` and `size`, the encumbrance's `heavyload`, a weapon's `tohit.strength`, `tohit.size`, `tohit.gear`, `tohit.throwing`, `tohit.secondary` and `damage.strength`) follows what it's computed from, a modifier that raises an ability included: it's "req only", and a flat bonus belongs in the `misc` beside it. See [How a sheet is built](customization.md#how-a-sheet-is-built).

## abilities

| Path                        | Type   | Description                              |
| --------------------------- | ------ | ---------------------------------------- |
| `abilities.<name>.base`     | number | Base score before modifiers (req only)   |
| `abilities.<name>.misc`     | number | From feats, items, and spells            |
| `abilities.<name>.total`    | number | Final score after all bonuses (req only) |
| `abilities.<name>.modifier` | number | Derived from total score (req only)      |
| `abilities.*.misc`          | number | Misc modifier for all abilities          |

## skills

| Path                                          | Type    | Description                                                                                                                                   |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills.<name>.rank`                          | number  | Total ranks invested                                                                                                                          |
| `skills.<name>.ability`                       | number  | From key ability modifier (req only)                                                                                                          |
| `skills.<name>.weight`                        | number  | Armor check penalty (ACP) (req only)                                                                                                          |
| `skills.<name>.misc`                          | number  | From feats, items, and spells                                                                                                                 |
| `skills.<name>.total`                         | number  | Final skill check bonus (req only)                                                                                                            |
| `skills.<name>.trained`                       | boolean | Whether at least 1 rank is invested                                                                                                           |
| `skills.<name>.innate`                        | boolean | Whether skill is a class skill                                                                                                                |
| `skills.*.misc`                               | number  | Misc modifier for all skills                                                                                                                  |
| `skills.<family>.<field>`                     | number  | Each skill of a family no skill of its own names (`skills.knowledge.rank`: any Knowledge skill for a requirement, all of them for a modifier) |
| `skills.budget.perlevel`                      | number  | Bonus skill points per level (a human's)                                                                                                      |
| `skills.budget.total`, `.spent`, `.available` | number  | The skill points from every level, spent, and left (req only)                                                                                 |

## saves

| Path                   | Type   | Description                          |
| ---------------------- | ------ | ------------------------------------ |
| `saves.<name>.base`    | number | Base save bonus from class levels    |
| `saves.<name>.ability` | number | From key ability modifier (req only) |
| `saves.<name>.misc`    | number | From feats, items, and spells        |
| `saves.<name>.total`   | number | Final saving throw bonus (req only)  |
| `saves.*.misc`         | number | Misc modifier for all saving throws  |

## combat

| Path                                 | Type    | Description                                                                                                       |
| ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `combat.ac.base`                     | number  | Default 10                                                                                                        |
| `combat.ac.armor`                    | number  | Armor bonus to AC: armor, bracers, an armor's enhancement (not in touch AC)                                       |
| `combat.ac.shield`                   | number  | Shield bonus to AC: a shield, its enhancement (not in touch AC)                                                   |
| `combat.ac.dexterity`                | number  | Dexterity bonus to AC (req only)                                                                                  |
| `combat.ac.natural`                  | number  | Natural armor bonus (not in touch AC)                                                                             |
| `combat.ac.deflection`               | number  | Deflection bonus to AC                                                                                            |
| `combat.ac.dodge`                    | number  | Dodge bonus to AC, and any other lost when flat-footed (not in flat-footed AC)                                    |
| `combat.ac.misc`                     | number  | Other bonuses to AC, kept in touch and flat-footed AC (a monk's Wisdom)                                           |
| `combat.ac.uncannydodge`             | boolean | Keeps the Dexterity and dodge bonuses when flat-footed (uncanny dodge)                                            |
| `combat.ac.total`                    | number  | All AC bonuses combined (req only)                                                                                |
| `combat.ac.touch`                    | number  | Ignores armor, shield, natural (req only)                                                                         |
| `combat.ac.flatfooted`               | number  | Ignores the Dexterity and dodge bonuses, unless uncanny dodge (req only)                                          |
| `combat.armorworn`                   | string  | The heaviest armor worn: none, light, medium or heavy (req only)                                                  |
| `combat.shieldheld`                  | boolean | Whether a shield is carried (req only)                                                                            |
| `combat.hp.base`                     | number  | From hit dice rolls                                                                                               |
| `combat.hp.constitution`             | number  | Con modifier per level (req only)                                                                                 |
| `combat.hp.misc`                     | number  | Other bonuses to HP                                                                                               |
| `combat.hp.total`                    | number  | All HP sources combined (req only)                                                                                |
| `combat.initiative.dexterity`        | number  | Dex modifier (req only)                                                                                           |
| `combat.initiative.misc`             | number  | Other bonuses to initiative                                                                                       |
| `combat.initiative.total`            | number  | All initiative bonuses combined (req only)                                                                        |
| `combat.bab`                         | number  | From class progression                                                                                            |
| `combat.throwing.misc`               | number  | Other bonuses to attack with thrown weapons and slings, a melee weapon's thrown attack included (a halfling's +1) |
| `combat.naturalattacks.secondary`    | number  | Penalty on secondary natural attacks (−5; −2 with Multiattack)                                                    |
| `combat.naturalattacks.extraprimary` | number  | Extra attacks with the primary natural weapon, each at −5 (a companion's Multiattack, under 3 attacks)            |
| `combat.naturalattacks.count`        | number  | Natural attacks made in a round, two claws being two (req only)                                                   |
| `combat.grapple.bab`                 | number  | BAB contribution (req only)                                                                                       |
| `combat.grapple.strength`            | number  | Str modifier (req only)                                                                                           |
| `combat.grapple.size`                | number  | From race size (req only)                                                                                         |
| `combat.grapple.misc`                | number  | Other bonuses to grapple                                                                                          |
| `combat.grapple.total`               | number  | All grapple bonuses combined (req only)                                                                           |
| `combat.twoweapon.mainhand`          | number  | Penalty on main-hand attacks with two weapons (−6)                                                                |
| `combat.twoweapon.offhand`           | number  | Penalty on off-hand attacks with two weapons (−10)                                                                |
| `combat.twoweapon.offhandattacks`    | number  | Attacks the off hand makes with two weapons (1)                                                                   |
| `combat.speed.base`                  | number  | From race, and fast movement: what armor and load slow (ft)                                                       |
| `combat.speed.misc`                  | number  | Other bonuses to speed, after armor and load (ft)                                                                 |
| `combat.speed.total`                 | number  | Final movement speed (ft) (req only)                                                                              |
| `combat.encumbrance.carriedweight`   | number  | Total weight of items (lbs)                                                                                       |
| `combat.encumbrance.heavyload`       | number  | Max carry capacity (lbs) (req only)                                                                               |
| `combat.encumbrance.load`            | string  | The load carried: light, medium, heavy or overloaded (req only)                                                   |

## items.weapons

Grouped by weapon type, family, complexity, and item name. `items.weapons.unarmedstrike` is always there: every character strikes unarmed, and a gauntlet's strike is unarmed too.

| Path                                               | Type   | Description                                                                                                                                        |
| -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items.weapons.<group>.tohit.strength`             | number | Str/Dex bonus to attack (a finessed one less a shield's check penalty, a composite bow's −2 below its rating) (req only)                           |
| `items.weapons.<group>.tohit.magic`                | number | Enhancement bonus to attack                                                                                                                        |
| `items.weapons.<group>.tohit.misc`                 | number | Other bonuses to attack                                                                                                                            |
| `items.weapons.<group>.tohit.gear`                 | number | Penalties from the gear: the check penalty of armor or a shield worn without proficiency, a tower shield's −2, a crossbow's in one hand (req only) |
| `items.weapons.<group>.tohit.throwing`             | number | A thrown weapon's or a sling's bonus: `combat.throwing.misc` (req only)                                                                            |
| `items.weapons.<group>.tohit.secondary`            | number | A secondary natural attack's penalty: `combat.naturalattacks.secondary` (req only)                                                                 |
| `items.weapons.<group>.damage.base`                | string | Base damage dice                                                                                                                                   |
| `items.weapons.<group>.damage.strength`            | number | Str bonus to damage (req only)                                                                                                                     |
| `items.weapons.<group>.damage.magic`               | number | Enhancement bonus to damage                                                                                                                        |
| `items.weapons.<group>.damage.misc`                | number | Other bonuses to damage                                                                                                                            |
| `items.weapons.<group>.damage.strmultiplier`       | number | Str-to-damage ratio (1x/0.5x/1.5x)                                                                                                                 |
| `items.weapons.<group>.damage.critical.range`      | number | Critical threat range                                                                                                                              |
| `items.weapons.<group>.damage.critical.multiplier` | number | Critical hit multiplier                                                                                                                            |
| `items.weapons.<group>.slot`                       | string | Hand position (main/off/two-handed)                                                                                                                |

## items.armors

Grouped by armor type and item name.

| Path                                | Type   | Description                         |
| ----------------------------------- | ------ | ----------------------------------- |
| `items.armors.<group>.ac.bonus`     | number | Base AC bonus from armor            |
| `items.armors.<group>.ac.misc`      | number | Other bonuses to armor AC           |
| `items.armors.<group>.ac.total`     | number | Total AC from this armor (req only) |
| `items.armors.<group>.checkpenalty` | number | Penalty to Str/Dex skill checks     |
| `items.armors.<group>.spellfailure` | number | Arcane spell failure chance         |
| `items.armors.<group>.maxdex`       | number | Maximum Dexterity bonus to AC       |

## items.shields

Grouped by shield type and item name.

| Path                                 | Type   | Description                          |
| ------------------------------------ | ------ | ------------------------------------ |
| `items.shields.<group>.ac.bonus`     | number | Base AC bonus from shield            |
| `items.shields.<group>.ac.misc`      | number | Other bonuses to shield AC           |
| `items.shields.<group>.ac.total`     | number | Total AC from this shield (req only) |
| `items.shields.<group>.checkpenalty` | number | Penalty to Str/Dex skill checks      |
| `items.shields.<group>.spellfailure` | number | Arcane spell failure chance          |

## classes

| Path                              | Type   | Description                                         |
| --------------------------------- | ------ | --------------------------------------------------- |
| `classes.<name>.level`            | number | Class level                                         |
| `classes.<name>.bonuscasterlevel` | number | Bonus caster levels from prestige class advancement |

## feats

| Path                         | Type    | Description                                                         |
| ---------------------------- | ------- | ------------------------------------------------------------------- |
| `feats.<name>.possessed`     | boolean | Whether feat is possessed                                           |
| `feats.<name>.count`         | number  | Times taken — stackable feats only (req only)                       |
| `feats.<family>.*.possessed` | boolean | Any feat of the family possessed (req), every feat of it (modifier) |
| `feats.<family>.*.count`     | number  | Times any one feat of the family was taken (req only)               |
| `feats.<family>.count`       | number  | Times the family's feats were taken, all together (req only)        |

A family is the feats sharing a `FEAT_FAMILY` property (_Feat family groupings_ in [customization.md](./customization.md)). `feats.<family>.possessed` names no feat, unless a feat has the family's name: Martial Weapon Proficiency (every martial weapon) and its family (the feats for one weapon) share `feats.martialweaponproficiency`, where `possessed` and `count` are the feat's and `*` reaches the family's feats. The family's count isn't listed there.

### Proficiency feat paths (auto-generated as item requirements)

Weapon items, armor items, and shield items auto-generate proficiency requirements targeting these feat paths. A simple or martial weapon accepts the proficiency with all of its group or with it alone, never another weapon's: `feats.simpleweaponproficiency.possessed` is that feat only, not every `simpleweaponproficiency<weapon>`. The gauntlet also accepts the unarmed strike's: a strike with it is unarmed.

| Path                                               | Used by                         |
| -------------------------------------------------- | ------------------------------- |
| `feats.simpleweaponproficiency.possessed`          | Simple weapon items (OR chain)  |
| `feats.simpleweaponproficiency<weapon>.possessed`  | Simple weapon items (OR chain)  |
| `feats.martialweaponproficiency.possessed`         | Martial weapon items (OR chain) |
| `feats.martialweaponproficiency<weapon>.possessed` | Martial weapon items (OR chain) |
| `feats.exoticweaponproficiency<weapon>.possessed`  | Exotic weapon items             |
| `feats.armorproficiencylight.possessed`            | Light armor items               |
| `feats.armorproficiencymedium.possessed`           | Medium armor items              |
| `feats.armorproficiencyheavy.possessed`            | Heavy armor items               |
| `feats.shieldproficiency.possessed`                | Light/Heavy shield items        |
| `feats.towershieldproficiency.possessed`           | Tower shield items              |

## powers

| Path                              | Type    | Description                              |
| --------------------------------- | ------- | ---------------------------------------- |
| `powers.<name>.properties.<type>` | string  | Power property value                     |
| `powers.<spell>.<aptitude>.known` | boolean | Whether spell is known via this aptitude |

Domain and specialist aptitudes are excluded from known paths (those spells are auto-granted).

### powers (DC groupings)

Grouped by spell school and spell descriptor, and reached by each spell's name. A spell has a DC for each class that casts it: its level on that class's list and that class's casting ability (a wizard/bard's Hold Person: 3rd level and Intelligence as a wizard's, 2nd and Charisma as a bard's). A DC object is shared by its spell's groupings and its entry, so modifying it via school or name affects the same DC.

DC formula: `base (10) + spell level + ability modifier + misc`

| Path                               | Type   | Description                      |
| ---------------------------------- | ------ | -------------------------------- |
| `powers.groups.<group>.*.dc.misc`  | number | DC misc modifier                 |
| `powers.groups.<group>.*.dc.total` | number | DC total (read-only, recomputed) |

`<group>` is a spell school (e.g., `evocation`) or descriptor (e.g., `fire`); its `*` reaches each spell, and each class's DC of it. Individual spells use `powers.<spell>.dc.*.misc` and `powers.<spell>.dc.*.total`, each class's DC of the spell (`powers.fireball.dc.*.misc`; `powers.fireball.dc.wizard.misc` is the wizard's alone), without the `groups` namespace. Only powers with a spell level and ability DC get DC entries.

## identity

### identity.physiology

| Path                              | Type   | Description                |
| --------------------------------- | ------ | -------------------------- |
| `identity.physiology.name`        | string | Character name             |
| `identity.physiology.description` | string | Physical description       |
| `identity.physiology.age`         | number | Character age              |
| `identity.physiology.gender`      | string | Character gender           |
| `identity.physiology.height`      | string | Character height           |
| `identity.physiology.weight`      | string | Body weight                |
| `identity.physiology.race.name`   | string | Race name                  |
| `identity.physiology.race.size`   | string | Size (e.g., Medium, Small) |

### identity.beliefs

| Path                         | Type   | Description         |
| ---------------------------- | ------ | ------------------- |
| `identity.beliefs.deity`     | string | Character deity     |
| `identity.beliefs.alignment` | string | Character alignment |

### identity.background

| Path                               | Type   | Description             |
| ---------------------------------- | ------ | ----------------------- |
| `identity.background.notes`        | string | Public notes            |
| `identity.background.privateNotes` | string | Private notes (GM only) |

### identity.meta

| Path                  | Type   | Description                                  |
| --------------------- | ------ | -------------------------------------------- |
| `identity.meta.level` | number | Total character level (all classes combined) |
| `identity.meta.xp`    | number | Current experience points                    |

Note: D&D 3.5 skill budget data (total, available, spent, perlevel) lives on `skills.budget.*` — e.g. `skills.budget.perlevel` for Human racial bonus.

## aptitudes

| Path                               | Type   | Description                                          |
| ---------------------------------- | ------ | ---------------------------------------------------- |
| `aptitudes.<name>.uses`            | number | Uses per day (casts, charges, etc.)                  |
| `aptitudes.<name>.allowed`         | number | Slots for known spells or feats                      |
| `aptitudes.<name>.<level>.uses`    | number | Uses per day at spell level (leveled aptitudes only) |
| `aptitudes.<name>.<level>.allowed` | number | Slots at spell level (leveled aptitudes only)        |

A modifier on a pool's slots grants more, with a number: `add` on `aptitudes.<name>.allowed` (a feat pool) and on a spell level's `uses` and `allowed`, or `set` -1 on a spell level's `allowed`, all of that level known. The level-up wizard and the class tables count these without a character, the sheet's way; another operator or a template would count differently there, so the editor doesn't offer them and the API refuses them (`TargetPath.setValues`, `literalOnly`). A pool's own `uses` (Turn Undead's) counts on the sheet alone and takes any modifier.
