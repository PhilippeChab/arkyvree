# Target Paths

All available paths for modifiers and requirements. Dynamic segments are shown as `<name>`.

Paths marked "req only" are available as requirement targets but not modifier targets.

## abilities

| Path | Type | Description |
|------|------|-------------|
| `abilities.<name>.base` | number | Base score before modifiers (req only) |
| `abilities.<name>.misc` | number | From feats, items, and spells |
| `abilities.<name>.total` | number | Final score after all bonuses (req only) |
| `abilities.<name>.modifier` | number | Derived from total score (req only) |
| `abilities.*.misc` | number | Misc modifier for all abilities |

## skills

| Path | Type | Description |
|------|------|-------------|
| `skills.<name>.rank` | number | Total ranks invested |
| `skills.<name>.ability` | number | From key ability modifier |
| `skills.<name>.weight` | number | Armor check penalty (ACP) |
| `skills.<name>.misc` | number | From feats, items, and spells |
| `skills.<name>.total` | number | Final skill check bonus (req only) |
| `skills.<name>.trained` | boolean | Whether at least 1 rank is invested |
| `skills.<name>.innate` | boolean | Whether skill is a class skill |
| `skills.*.misc` | number | Misc modifier for all skills |

## saves

| Path | Type | Description |
|------|------|-------------|
| `saves.<name>.base` | number | Base save bonus from class levels |
| `saves.<name>.ability` | number | From key ability modifier |
| `saves.<name>.misc` | number | From feats, items, and spells |
| `saves.<name>.total` | number | Final saving throw bonus (req only) |
| `saves.*.misc` | number | Misc modifier for all saving throws |

## combat

| Path | Type | Description |
|------|------|-------------|
| `combat.ac.base` | number | Default 10 |
| `combat.ac.armor` | number | Armor bonus to AC |
| `combat.ac.shield` | number | Shield bonus to AC |
| `combat.ac.dexterity` | number | Dexterity bonus to AC |
| `combat.ac.natural` | number | Natural armor bonus |
| `combat.ac.deflection` | number | Deflection bonus to AC |
| `combat.ac.misc` | number | Other bonuses to AC |
| `combat.ac.total` | number | All AC bonuses combined (req only) |
| `combat.ac.touch` | number | Ignores armor, shield, natural |
| `combat.ac.flatfooted` | number | Ignores Dex bonus |
| `combat.hp.base` | number | From hit dice rolls |
| `combat.hp.constitution` | number | Con modifier per level |
| `combat.hp.misc` | number | Other bonuses to HP |
| `combat.hp.total` | number | All HP sources combined (req only) |
| `combat.initiative.dexterity` | number | Dex modifier |
| `combat.initiative.misc` | number | Other bonuses to initiative |
| `combat.initiative.total` | number | All initiative bonuses combined (req only) |
| `combat.bab` | number | From class progression |
| `combat.grapple.bab` | number | BAB contribution |
| `combat.grapple.strength` | number | Str modifier |
| `combat.grapple.size` | number | From race size |
| `combat.grapple.misc` | number | Other bonuses to grapple |
| `combat.grapple.total` | number | All grapple bonuses combined (req only) |
| `combat.speed.base` | number | From race (ft) |
| `combat.speed.misc` | number | Other bonuses to speed (ft) |
| `combat.speed.total` | number | Final movement speed (ft) (req only) |
| `combat.encumbrance.carriedweight` | number | Total weight of items (lbs) |
| `combat.encumbrance.heavyload` | number | Max carry capacity (lbs) |

## items.weapons

Grouped by weapon type, family, complexity, and item name.

| Path | Type | Description |
|------|------|-------------|
| `items.weapons.<group>.tohit.strength` | number | Str/Dex bonus to attack |
| `items.weapons.<group>.tohit.magic` | number | Enhancement bonus to attack |
| `items.weapons.<group>.tohit.misc` | number | Other bonuses to attack |
| `items.weapons.<group>.damage.base` | string | Base damage dice |
| `items.weapons.<group>.damage.strength` | number | Str bonus to damage |
| `items.weapons.<group>.damage.magic` | number | Enhancement bonus to damage |
| `items.weapons.<group>.damage.misc` | number | Other bonuses to damage |
| `items.weapons.<group>.damage.strmultiplier` | number | Str-to-damage ratio (1x/0.5x/1.5x) |
| `items.weapons.<group>.damage.critical.range` | number | Critical threat range |
| `items.weapons.<group>.damage.critical.multiplier` | number | Critical hit multiplier |
| `items.weapons.<group>.slot` | string | Hand position (main/off/two-handed) |

## items.armors

Grouped by armor type and item name.

| Path | Type | Description |
|------|------|-------------|
| `items.armors.<group>.ac.bonus` | number | Base AC bonus from armor |
| `items.armors.<group>.ac.misc` | number | Other bonuses to armor AC |
| `items.armors.<group>.ac.total` | number | Total AC from this armor (req only) |
| `items.armors.<group>.checkpenalty` | number | Penalty to Str/Dex skill checks |
| `items.armors.<group>.spellfailure` | number | Arcane spell failure chance |
| `items.armors.<group>.maxdex` | number | Maximum Dexterity bonus to AC |

## items.shields

Grouped by shield type and item name.

| Path | Type | Description |
|------|------|-------------|
| `items.shields.<group>.ac.bonus` | number | Base AC bonus from shield |
| `items.shields.<group>.ac.misc` | number | Other bonuses to shield AC |
| `items.shields.<group>.ac.total` | number | Total AC from this shield (req only) |
| `items.shields.<group>.checkpenalty` | number | Penalty to Str/Dex skill checks |
| `items.shields.<group>.spellfailure` | number | Arcane spell failure chance |

## classes

| Path | Type | Description |
|------|------|-------------|
| `classes.<name>.level` | number | Class level |
| `classes.<name>.bonuscasterlevel` | number | Bonus caster levels from prestige class advancement |

## feats

| Path | Type | Description |
|------|------|-------------|
| `feats.<name>.possessed` | boolean | Whether feat is possessed |
| `feats.<name>.count` | number | Times taken — stackable feats only (req only) |

### Proficiency feat paths (auto-generated as item requirements)

Weapon items, armor items, and shield items auto-generate proficiency requirements targeting these feat paths:

| Path                                               | Used by                        |
|----------------------------------------------------|--------------------------------|
| `feats.simpleweaponproficiency.possessed`          | Simple weapon items            |
| `feats.martialweaponproficiency.possessed`         | Martial weapon items (OR chain) |
| `feats.martialweaponproficiency<weapon>.possessed`  | Martial weapon items (OR chain) |
| `feats.exoticweaponproficiency<weapon>.possessed`   | Exotic weapon items            |
| `feats.armorproficiencylight.possessed`            | Light armor items              |
| `feats.armorproficiencymedium.possessed`           | Medium armor items             |
| `feats.armorproficiencyheavy.possessed`            | Heavy armor items              |
| `feats.shieldproficiency.possessed`                | Light/Heavy shield items       |
| `feats.towershieldproficiency.possessed`           | Tower shield items             |

## powers

| Path | Type | Description |
|------|------|-------------|
| `powers.<name>.properties.<type>` | string | Power property value |
| `powers.<spell>.<aptitude>.known` | boolean | Whether spell is known via this aptitude |

Domain and specialist aptitudes are excluded from known paths (those spells are auto-granted).

### powers (DC groupings)

Grouped by spell school, spell descriptor, and individual power name. Same DC object is shared across all groupings for a given power — modifying via school or name affects the same DC.

DC formula: `base (10) + spell level + ability modifier + misc`

| Path | Type | Description |
|------|------|-------------|
| `powers.<group>.dc.misc` | number | DC misc modifier |
| `powers.<group>.dc.total` | number | DC total (read-only, recomputed) |

`<group>` can be a spell school (e.g., `evocation`), spell descriptor (e.g., `fire`), or individual power name (e.g., `fireball`). Only powers with a spell level and ability DC get DC entries.

## identity

### identity.physiology

| Path | Type | Description |
|------|------|-------------|
| `identity.physiology.name` | string | Character name |
| `identity.physiology.description` | string | Physical description |
| `identity.physiology.age` | number | Character age |
| `identity.physiology.gender` | string | Character gender |
| `identity.physiology.height` | string | Character height |
| `identity.physiology.weight` | string | Body weight |
| `identity.physiology.race.name` | string | Race name |
| `identity.physiology.race.size` | string | Size (e.g., Medium, Small) |

### identity.beliefs

| Path | Type | Description |
|------|------|-------------|
| `identity.beliefs.deity` | string | Character deity |
| `identity.beliefs.alignment` | string | Character alignment |

### identity.background

| Path | Type | Description |
|------|------|-------------|
| `identity.background.notes` | string | Public notes |
| `identity.background.privateNotes` | string | Private notes (GM only) |

### identity.meta

| Path | Type | Description |
|------|------|-------------|
| `identity.meta.level` | number | Total character level (all classes combined) |
| `identity.meta.xp` | number | Current experience points |

Note: D&D 3.5 skill budget data (total, available, spent, perlevel) lives on `skills.budget.*` — e.g. `skills.budget.perlevel` for Human racial bonus.

## aptitudes

| Path | Type | Description |
|------|------|-------------|
| `aptitudes.<name>.uses` | number | Uses per day (casts, charges, etc.) |
| `aptitudes.<name>.allowed` | number | Slots for known spells or feats |
| `aptitudes.<name>.<level>.uses` | number | Uses per day at spell level (leveled aptitudes only) |
| `aptitudes.<name>.<level>.allowed` | number | Slots at spell level (leveled aptitudes only) |
