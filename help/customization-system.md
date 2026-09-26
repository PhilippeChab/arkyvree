# Customization System

[← Help home](README.md)

## What are Properties?

**Properties** are typed key-value tags attached to an entity. They're data the engine reads to compute the sheet, and metadata the customization layer references in [requirements](#what-are-requirements) and [modifiers](#what-are-modifiers).

In the editor: **Property type** + **value**. Example properties on the Longsword item:

- `WEAPON_PROFICIENCY = Martial`
- `WEAPON_FAMILY = Sword`
- `WEAPON_BASE_DAMAGE = 1d8`
- `WEAPON_CRITICAL_RANGE = 1`
- `WEAPON_CRITICAL_MULTIPLIER = 2`
- `WEAPON_SIZE = Medium`
- `DAMAGE_TYPE = Slashing`

Most weapon, armor, shield, and spell properties are auto-generated when the entity is added — the entity form already asks for the same information. Adding a spell with `School: Evocation` auto-creates `SPELL_SCHOOL = Evocation` plus a Spell Focus: Evocation feat. Adding a martial weapon auto-generates `WEAPON_PROFICIENCY = Martial` plus the proficiency requirement on the item.

Add or override properties manually for:

- **Tagging for grouping.** A homebrew Weapon Focus variant tagged `FEAT_FAMILY = weaponfocus` is matched by the `feats.weaponfocus.*.possessed` wildcard. See [How do wildcard patterns work?](#how-do-wildcard-patterns-work)

Properties don't change numbers. To add a `+1`, use a [modifier](#what-are-modifiers).

## What are Requirements?

A **requirement** is a condition the character must meet for an entity to be usable. The level-up wizard evaluates them automatically and greys out feats, classes, or spells that don't qualify.

Each requirement leaf has three parts: **target** (a path into the character sheet), **operator**, and **value**. Examples:

- `abilities.strength.total >= 13` — Strength of 13 or more (Power Attack's prerequisite).
- `combat.bab >= 1` — base attack bonus of +1 or more.
- `feats.powerattack.possessed == true` — has the Power Attack feat.
- `classes.fighter.level >= 4` — Fighter level 4 or higher.
- `skills.tumble.rank >= 2` — at least 2 ranks in Tumble.

The path is built using the **target path browser** in the requirement editor.

Multiple requirements on the same entity are AND'd together by default. To express OR, add a chain (group) node and place leaves under it.

**Cleave** needs Strength 13 AND Power Attack — two leaves, both must hold:

- `abilities.strength.total >= 13`
- `feats.powerattack.possessed == true`

A feat that accepts either Martial Weapon Proficiency OR a per-weapon variant uses an OR chain with two leaves under it:

- `feats.martialweaponproficiency.possessed == true`
- `feats.martialweaponproficiencylongsword.possessed == true`

Nested groups are supported — useful for prerequisites like *(Dex 13 AND Improved Unarmed Strike) OR Monk level 1*.

Common targets:

| Target | Meaning |
|---|---|
| `abilities.<name>.total` | final ability score after all bonuses |
| `combat.bab` | base attack bonus |
| `combat.hp.total` | total HP |
| `feats.<slug>.possessed` | whether a specific feat is taken |
| `classes.<slug>.level` | level in a specific class |
| `skills.<slug>.rank` | ranks in a specific skill |
| `identity.meta.level` | total character level (sum of class levels) |

The slug is the entity name lowercased with separators stripped — Power Attack becomes `powerattack`, Knowledge (Arcana) becomes `knowledgearcana`.

Requirements gate eligibility. They don't model selection rules ("must pick at level 1") — that's handled by aptitudes and class-granted feats. They don't apply at runtime in combat — they're evaluated when the level-up wizard previews choices.

## What are Modifiers?

A **modifier** is a numeric or boolean change an entity applies to a character sheet. Toughness adds `+3` to HP. A `+1` longsword adds `+1` to attack and damage.

Each modifier has three parts: **target** (a path on the character sheet), **operator**, and **value**.

| Operator | Effect |
|---|---|
| `add` | adds the value |
| `subtract` | subtracts |
| `multiply` | multiplies |
| `divide` | divides |
| `set` | overrides any previous value |

Examples:

- **Improved Initiative** — target `combat.initiative.misc`, operator `add`, value `4`.
- **Weapon Focus (Longsword)** — target `items.weapons.longsword.tohit.misc`, operator `add`, value `1`.
- **+1 longsword** — two rows: `items.weapons.longsword.tohit.magic` add `1`, and `items.weapons.longsword.damage.magic` add `1`. Splitting attack and damage into two rows means each shows separately on the sheet.
- **Toughness** — target `combat.hp.misc`, operator `add`, value `3`.

The character engine computes the **base, permanent character sheet**. Conditional, situational, or activated effects do *not* belong as modifiers:

- **Dodge** — `+1` AC vs one designated opponent only.
- **Mobility** — `+4` AC vs attacks of opportunity only.
- **Power Attack** — variable trade-off the player chooses each round.
- **Rage, Smite Evil, bardic music** — temporary, per-use abilities.

The system has no concept of "currently active" — only "permanent". Modeling conditional bonuses as flat modifiers silently inflates the sheet.

Two advanced patterns: **wildcards** (target `saves.*.misc` to apply to all three saves at once) and **references** (use `{{ abilities.charisma.modifier }}` instead of a literal value to read another stat at evaluation time, used by Divine Grace). See [How do wildcard patterns work?](#how-do-wildcard-patterns-work)

## How do these three work together?

Three things plug into every entity in a ruleset:

- [Properties](#what-are-properties) describe what the entity *is* — the data tags. A spell carries `SPELL_SCHOOL = Evocation`, a longsword carries `WEAPON_PROFICIENCY = Martial`.
- [Requirements](#what-are-requirements) decide when the entity is *available* to a character. Power Attack requires `abilities.strength.total >= 13`; Cleave requires having Power Attack already.
- [Modifiers](#what-are-modifiers) describe what the entity *does* once it applies. Toughness adds `+3` to `combat.hp.misc`. A `+1` longsword adds `+1` to `items.weapons.longsword.tohit.magic` and `+1` to `items.weapons.longsword.damage.magic`.

An entity uses any combination of the three — all three, just one, or none. The system models what fits.

### Building Greater Weapon Focus: Longsword from scratch

Greater Weapon Focus uses all three.

**Property** — `FEAT_FAMILY = Greater Weapon Focus`. This tag lets a downstream prestige class that wants "any Greater Weapon Focus" reference `feats.greaterweaponfocus.*.possessed` in a single requirement, and that wildcard expands to every Greater Weapon Focus variant — Longsword, Greatsword, or homebrew.

**Requirements** — two leaves AND'd:

- `feats.weaponfocuslongsword.possessed == true`
- `classes.fighter.level >= 8`

The level-up wizard reads these and greys the feat out for any character that doesn't qualify.

**Modifier** — one row: target `items.weapons.longsword.tohit.misc`, operator `add`, value `1`.

A Fighter 8 with Weapon Focus: Longsword qualifies. Once picked, the `+1` attack bonus appears on the longsword line of the character sheet automatically.

### Building Improved Initiative from scratch

Improved Initiative is a modifier-only feat. No property tag, no prerequisite — just one effect.

**Modifier** — one row: target `combat.initiative.misc`, operator `add`, value `4`.

Any character with Improved Initiative gets `+4` to initiative on their sheet automatically.

Where the feat shows up in the level-up wizard — the General feat pool, the Fighter Bonus Feat pool — is set by the feat's *aptitude link* when you create it, not by a property. Properties tag the entity with engine-readable data; the aptitude link decides which pool the engine offers it from.

## How do wildcard patterns work?

Wildcards let a single requirement or modifier target a *group* of entities or paths instead of a specific one. Three patterns.

### Feat family wildcards — `feats.<family>.*.possessed`

Used in requirements like *any Weapon Focus* or *any metamagic feat*. A feat is tagged with a `FEAT_FAMILY` property; the wildcard matches if the character possesses any feat in that family.

A prestige class needing any metamagic feat AND any item creation feat — two requirement rows:

- `feats.metamagic.*.possessed == true`
- `feats.itemcreation.*.possessed == true`

A feat needing any Weapon Focus — one row:

- `feats.weaponfocus.*.possessed == true`

This matches Weapon Focus (Longsword), Weapon Focus (Greatsword), and any custom Weapon Focus variant carrying `FEAT_FAMILY = weaponfocus`.

Built-in families on the SRD ruleset:

| Family | Matches |
|---|---|
| `weaponfocus`, `greaterweaponfocus` | Weapon Focus and Greater Weapon Focus variants |
| `weaponspecialization`, `greaterweaponspecialization` | Weapon Specialization variants |
| `improvedcritical` | Improved Critical variants |
| `martialweaponproficiency`, `exoticweaponproficiency` | per-weapon proficiency feats |
| `rapidreload` | Rapid Reload variants |
| `spellfocus`, `greaterspellfocus` | Spell Focus and Greater Spell Focus per school |
| `skillfocus` | Skill Focus per skill |
| `metamagic`, `itemcreation` | every metamagic / item creation feat |
| `turnorrebukeundead`, `wildshape` | class-feature feats |

### Skill subtype wildcards — `skills.<prefix>*.rank`

For requirements like *any Knowledge skill 5 ranks* or *any Craft 10 ranks*. The `*` after a prefix matches any skill whose slug starts with that prefix.

A prestige class needing 5 ranks of any Knowledge skill:

- `skills.knowledge*.rank >= 5`

Matches Knowledge (Arcana), Knowledge (Religion), Knowledge (Nature), and any custom Knowledge subtype.

Works the same way for Craft, Perform, and any skill with parenthetical subtypes.

### Modifier wildcards — apply to all entries in a category

Used in modifiers, not requirements:

- `saves.*.misc` — apply once, hit all three save categories (Fortitude, Reflex, Will).
- `abilities.*.misc` — every ability score's misc bonus.
- `items.weapons.*.damage.misc` — bonus to damage on every wielded weapon.

**Divine Grace** (*add Cha modifier to all saves*) is one row: target `saves.*.misc`, operator `add`, value `{{ abilities.charisma.modifier }}` — using a [reference](#what-are-modifiers). At evaluation time the engine expands `*` to fortitude, reflex, will and applies the Cha modifier to each.
