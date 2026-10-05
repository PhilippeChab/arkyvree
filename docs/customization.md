# Customization System — Modifiers, Requirements, Properties

## Overview

Entities (`CUSTOMIZABLE_ENTITY_TYPES` in `shared/customization/entities.ts`: feats, powers, items, races, classes, class levels) can have **modifiers**, **requirements**, and **properties** attached via junction tables in the `customization` schema.

A class's own modifiers apply once to a character with any level of it, and its requirements are checked to take any level of it, with that level's own (the level-up wizard's class list), and on a character who has it. The class page's Properties, Modifiers and Requirements tabs are the sections every entity's customization page has (`ClassCustomizationSections`).

The complete application operator definitions live in `shared/customization/operators.ts`. API validators consume those lists; `tests/shared/customization/operators.test.ts` verifies they match the migrated database's CHECK constraints. Keep generated `drizzle/schema.ts` free of handwritten helpers. Operator changes require a database migration and a schema refresh as well as updating the application definitions.

## How a sheet is built

A character's sheet holds **inputs** and **computed values**:

- **Inputs** are set from the character's data and changed by modifiers: ability scores and their misc, skill ranks and misc, the class's base attack bonus and base saves, the hit die rolls, the race's speed, an item's AC bonus and penalties, the carried weight, a weapon's magic and misc bonuses and dice.
- **Computed values** are getters, worked out from the inputs whenever read: totals, an ability's modifier, a skill's or a save's ability bonus, a skill's armor check penalty, Dexterity's bonus to AC, the size modifiers, the loads and their penalties, the speed under the load, a weapon's to-hit, Strength to damage and thrown and two-weapon attacks, a spell's DC. They never go stale: requirements, modifiers and the API read the sheet as it stands. A modifier can't target one (its target path is "req only"); a stored one is skipped, saying why.
- **The armor's and the shield's AC** (`combat.ac.armor`, `combat.ac.shield`) are both: the equipped items' AC (with what their own modifiers add), plus what modifiers on the path add. A modifier's write keeps only its own part, so the items' stays live.

The build (`AbstractDetailedCharacter.build`) loads the data, sets the inputs (the subsystems' `initialize`, then a bonded creature's master and stat block), and applies the modifiers in rounds:

1. The modifiers no requirement gates apply first.
2. Then, round after round, the gated ones whose requirements the sheet now meets. So an item's Strength counts toward a feat's prerequisite, and a load requirement reads the load. Each round checks only the requirements gating a modifier still waiting, and a round that applies none ends it.
3. Template modifiers apply last, reading the final values. The requirements are then evaluated once more on the final sheet: the evaluation the power modifiers and the validation read.

## Modifier Operators

`add`, `subtract`, `multiply`, `divide`, `set`

## Requirements

### Operators

`equal`, `not_equal`, `greater_than`, `less_than`, `greater_than_or_equal`, `less_than_or_equal`

### Paths that reach nothing

A requirement is met when what its path reaches satisfies it: any of it, for a wildcard. A path that resolves to nothing, a wildcard over an empty group (`powers.groups.evocation.*.dc.total` for a character without evocation spells), isn't met. A path that names nothing (`feats.weaponfocus.possessed`, a family by its own name) is invalid: the requirement is reported, and never met.

### Hierarchical Levels

Requirements use a dotted level numbering system for hierarchy:

- Root conditions: `"1"`, `"2"`, `"3"`
- Chain node: `"1"` with `chainingOperator: "or"` — children are `"1.1"`, `"1.2"`, etc.
- This enables OR/AND groups: a chain node groups its children under one logical operator

### Requirement Builder Helpers

Seed data is written with nested `or()` / `and()` builders from `database/packages/dnd35/content/requirements.ts`:

```ts
import { and, eq, feat, gte, or } from "@/database/packages/dnd35/content/requirements.ts";

// Simple AND (all root-level entries are AND'd together):
requirements: [
  gte("combat.bab", 1),
  eq(feat("Power Attack")),
]

// OR group:
requirements: [
  or(
    eq(feat("Martial Weapon Proficiency")),
    eq(feat("Martial Weapon Proficiency: Longsword")),
  ),
  gte("combat.bab", 1),
]

// Nested AND-inside-OR (e.g. monk prerequisite bypass):
requirements: [
  or(
    and(
      gte("abilities.dexterity.total", 13),
      eq(feat("Improved Unarmed Strike")),
    ),
    gte("classes.monk.level", 1),
  ),
]
```

`requirementRows()` in `database/packages/dnd35/seed/customization.ts` walks the tree and assigns hierarchical levels:
- Root entries: `"1"`, `"2"`, `"3"`
- Children: `"1.1"`, `"1.2"`, nested: `"1.1.1"`, `"1.1.2"`

## Properties

Properties are key-value pairs attached to entities via `customization.properties`. They store metadata used by the character engine (e.g., weapon damage dice, armor AC bonus, spell school). See [Auto-Generated Customization](#auto-generated-customization) below for all property types.

A ruleset's property names are constants in `shared/` (`shared/dnd3.5/properties/`), which the engine, the seeds, the parser, the client and the tests import instead of writing the name. Their descriptions and values are in the ruleset's `PropertyTypes.ts` (`server/rulesets/dnd3.5/PropertyTypes.ts`).

## Wildcard Patterns

### Feat family groupings (`feats.<family>.*.possessed`)

Feats with a `FEAT_FAMILY` property are grouped by the character engine. Requirements can check "any feat in the family" using the `feats.<family>.*.possessed` wildcard. The group holds every feat of the family in the character's ruleset, had or not: the `*` expands to all of them, and the requirement is met when the character has any. `feats.<family>.*.count` reads each one's count, and `feats.<family>.count` all of them together: "any two luck feats" is `feats.luck.count >= 2`, and "Sneak attack +2d6" `feats.sneakattack.count >= 2`, every class's dice together. A family's name alone (`feats.weaponfocus.possessed`) names no feat, and a modifier on it gives none: it's skipped. A feat named like its family shares its key: `feats.martialweaponproficiency.possessed` is the feat Martial Weapon Proficiency (every martial weapon), and `feats.martialweaponproficiency.*.possessed` any feat of its family (Martial Weapon Proficiency: Rapier…), which doesn't include that feat; its `count` is the feat's, the family's isn't reachable. A modifier on a family (`feats.<family>.*.possessed`, "All X feats") reaches every feat of it.

```ts
// "Any Weapon Focus feat"
requirements: [eq("feats.weaponfocus.*.possessed")]

// "Any metamagic feat" AND "any item creation feat"
requirements: [
  eq("feats.metamagic.*.possessed"),
  eq("feats.itemcreation.*.possessed"),
]

// "Any two luck feats"
requirements: [gte("feats.luck.count", 2)]
```

Available families: `FEAT_FAMILIES` in `shared/dnd3.5/feats.ts`, the `FEAT_FAMILY` values the customization offers and the seeded rules use (`tests/seeds/feats.test.ts` keeps the two the same):
- Template families: `weaponfocus`, `greaterweaponfocus`, `weaponspecialization`, `greaterweaponspecialization`, `improvedcritical`, `powercritical`, `disembowelingstrike`, `headshot`, `greaterresiliency`, `martialweaponproficiency`, `exoticweaponproficiency`, `rapidreload`, `spellfocus`, `greaterspellfocus`, `arcanedefense`, `skillfocus`
- Feat type families, each named like its type: `metamagic`, `itemcreation`, `luck`, and Complete Arcane's `draconic` feats, by their "Draconic …" name
- Class feature families: `turnorrebukeundead`, `wildshape`, `favoredenemy`, and the features each class seeds as its own feat, "Sneak Attack (Rogue)" (`CLASS_FEATURE_FAMILIES`, which `CLASS_FEAT_FAMILIES` in `dnd35-from-parser/tools/buildSeeds.ts` matches): `animalcompanion`, `bardicmusic`, `evasion`, `flurryofblows`, `grace`, `inspirecourage`, `kipower`, `layonhands`, `poisonuse`, `rage`, `skirmish`, `smiteevil`, `sneakattack`, `suddenstrike`, `summonfamiliar`, `trapfinding`

Grouping paths are auto-generated by `DetailedCharacterFeatGroupings` from `FEAT_FAMILY` property values — no manual path registration needed. The parser's generator writes a check of a family by its own name ("Weapon Specialization") as a check of any of its feats (`anyOfFamilies`), and a count of it ("Sneak attack +2d6") as the family's count.

### Skill sub-type wildcards (`skills.<prefix>*.rank`)

Skills with sub-types (Craft, Knowledge, Perform) share a common slug prefix. Requirements can use prefix matching to check "any skill in the group":

```ts
// "Any Knowledge skill 5 ranks"
requirements: [gte("skills.knowledge*.rank", 5)]

// "Any Craft skill 10 ranks"
requirements: [gte("skills.craft*.rank", 10)]
```

The `*` suffix matches any key starting with the prefix. This is handled by `traversePath` in `TargetPaths.ts`.

A skill's name without the `*` reaches its subtypes too: next to the skill of that name (`skills.craft.rank`, Craft and each Craft (…)), or alone when no skill has it (`skills.knowledge.rank`: implicit prefix expansion). Only skills: anywhere else a name reaches its own entry only. A feat's name is that feat, not the feats whose names it starts (`feats.dodge.possessed` isn't met by Dodge Bonus (Swashbuckler)), and names nothing when no feat has it (`feats.light.possessed`, not Lightning Reflexes). A family of feats is checked by its group.

### Modifier wildcards (`saves.*.misc`, `items.weapons.*.damage.misc`)

Modifiers can use `*` to target all entries in a category. See [Template modifiers](#template-modifiers-dynamic-references) below.

## Target Paths

See [docs/target-paths.md](./target-paths.md) for all available target paths.

## Normalization

All entity names in paths use `stripSeparators()` from `shared/text.ts`:

```ts
export const stripSeparators = (s: string) =>
  String(s)
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase();
```

Example: `"Martial Weapon Proficiency: Battleaxe"` → `"martialweaponproficiencybattleaxe"`

## Auto-Generated Customization

Some entities get properties, requirements, or feats auto-generated on create/update/delete. Generators live in `server/rulesets/dnd3.5/hooks/generators/`, triggered by hooks in `server/rulesets/dnd3.5/hooks/`.

### Weapons (type = "Weapon")

Properties generated from `WEAPON_TYPE_DEFINITIONS` in `weaponGenerator.ts`:

| Property Type              | Example (Longsword)                 |
|----------------------------|-------------------------------------|
| `WEAPON_PROFICIENCY`       | Martial                             |
| `WEAPON_FAMILY`            | Sword                               |
| `WEAPON_BASE_DAMAGE`       | 1d8                                 |
| `WEAPON_CRITICAL_RANGE`    | 1                                   |
| `WEAPON_CRITICAL_MULTIPLIER` | 2                                 |
| `WEAPON_SIZE`              | Medium                              |
| `WEAPON_TYPE`              | Longsword                           |
| `DAMAGE_TYPE`              | Slashing (one property per damage type) |
| `WEAPON_FINESSABLE`        | false                               |
| `WEAPON_RANGE`             | _(only if > 0)_                     |
| `WEAPON_RANGED`            | _(only on a ranged weapon)_         |
| `WEAPON_STRENGTH_DAMAGE`   | _(only if not by slot)_             |
| `WEAPON_MIGHTY`            | _(composite bows: 0)_               |
| `WEAPON_ONE_HANDED_PENALTY` | _(crossbows: −2 light, −4 heavy)_  |
| `WEAPON_ONE_HAND_TRAINING` | _(bastard sword, dwarven waraxe: true)_ |
| `WEAPON_DOUBLE_DAMAGE`     | _(double weapons: the other end's dice, a quarterstaff's 1d6)_ |
| `WEAPON_REACH`             | _(only if > 0)_                     |

How the engine reads a weapon's attack (`combat/Attacks.ts`), the SRD's rules:
- A **ranged weapon** (`WEAPON_RANGED`: bows, crossbows, slings, darts, javelins, bolas, nets, shuriken) attacks with Dexterity. Any other attacks with Strength, or with Dexterity when it's `WEAPON_FINESSABLE` and the character has a feat with `FEAT_WEAPON_FINESSE` (Weapon Finesse), if that's better: a carried shield's armor check penalty applies to that Dexterity (a shield the character is proficient with: another's costs every attack already).
- A **composite bow** (a bow with a `WEAPON_MIGHTY`, 0 for the seeded ones) takes −2 to attack when the character's Strength bonus is below its rating. A plain bow, without one, never does.
- A **melee weapon with a range increment** (`WEAPON_RANGE`: daggers, throwing axes, spears…) can also be thrown: its weapon slot carries a `thrown` attack with Dexterity, which the sheets list as a second row.
- **Strength to damage** (`WEAPON_STRENGTH_DAMAGE`): `Slot` when absent (the slot's share of a bonus: all of it in the main hand, half in the off hand, one and a half in two hands, all of it for a light weapon in two hands; a penalty in full), `Rating` (bows: a penalty, and a bonus up to `WEAPON_MIGHTY`, 0 without) or `None` (crossbows).
- A weapon is **light** when its `WEAPON_SIZE` is Tiny or Small. The table's sizes are written for a Medium wielder, and the engine sizes every weapon for its wielder (its damage too), so a halfling's shortsword is light as a human's is.
- A **crossbow** takes two hands to load: held in one (main or off hand), it fires at its `WEAPON_ONE_HANDED_PENALTY`, −2 for a light crossbow and −4 for a heavy one, a repeating one as the crossbow of its size. A hand crossbow, made for one hand, has none.
- **The gear** (`tohit.gearpenalty`, on every attack): the armor check penalty of each armor and shield worn without proficiency, and −2 with a tower shield, for its bulk.
- A weapon with `WEAPON_ONE_HAND_TRAINING` (the bastard sword, the dwarven waraxe) is **too large for one hand without training**: the inventory refuses it there, unless forced, when the character lacks its proficiency in one hand: its proficiency read in no hand (`areRequirementsMet(…, { sourceId: null })`), which a dwarf's familiarity meets and what only two hands give doesn't. Without, it's "as impossible as wielding a greatsword one-handed" (FAQ), not a −4.
- A weapon whose `WEAPON_SIZE` is Large is **two-handed**: the inventory refuses it in one hand (`InventoryHooks.validateWeaponHands`), whatever the wielder's size. The bows are Large: "you need at least two hands to use a bow, regardless of its size".
- **Thrown weapons and slings** (a ranged weapon Strength adds to by the hand, so not a bow or a crossbow) take `combat.throwing.tohit` to attack, and so does a melee weapon's thrown attack: a halfling's +1.
- **Natural attacks** (a bonded creature's, by its stat block in `bondedRaceData.ts`): each sits in a set's main or off hand for the sheets, which label it Primary or Secondary, but the hand doesn't count. A primary attack adds its whole Strength bonus to damage, one and a half when it's the creature's only attack. A secondary one takes `combat.naturalattacks.secondarypenalty` (−5) to attack and adds half. Each attacks once a round, whatever the base attack bonus. The first primary one also makes `combat.naturalattacks.extraattacks` extra attacks, each at −5. An animal companion's Multiattack sets the penalty to −2 with three or more attacks (`combat.naturalattacks.count`), and gives one extra primary attack with fewer.
- **Two weapons**: when a set holds an equipped weapon in each hand (an unarmed strike or a natural attack doesn't count), each weapon slot carries a `twoweapon` attack, which the sheets list as more rows: the main hand's attacks with `combat.twoweapon.mainhandpenalty` (−6), the off hand's first attack and `combat.twoweapon.offhandattacks` − 1 more, each 5 lower, with `combat.twoweapon.offhandpenalty` (−10). A light off-hand weapon lessens both penalties by 2, and so does a one-handed one with a feat with `FEAT_OVERSIZED_TWO_WEAPON_FIGHTING` (Complete Adventurer's Oversized Two-Weapon Fighting). The feats change these fields through modifiers. A **double weapon** (`WEAPON_DOUBLE_DAMAGE`) held in two hands fights as two weapons too, its other end a light off-hand one: its `twoweapon` attacks are the main end's, with its whole Strength bonus (its row's damage), and its `offend` the other end's, with its own dice and half the Strength bonus. A sling counts as a one-handed weapon, not a light one (its size is Medium).

Proficiency requirements (on the item, checked at equip time):
- **Simple**: OR chain — `feats.simpleweaponproficiency.possessed` OR `feats.simpleweaponproficiency<weapon>.possessed` (a gauntlet's also takes `feats.simpleweaponproficiencyunarmedstrike.possessed`: a strike with it is unarmed)
- **Martial**: OR chain — `feats.martialweaponproficiency.possessed` OR `feats.martialweaponproficiency<weapon>.possessed`
- **Exotic**: `feats.exoticweaponproficiency<weapon>.possessed == true`; or, for a weapon that counts as martial, `feats.martialweaponproficiency.possessed` while it's held in two hands (`weapon.wielded == twohanded`: the bastard sword, the dwarven waraxe) or by its wielder's race (`identity.physiology.race.name`: a dwarf's waraxe and urgrosh, a gnome's hooked hammer). A prerequisite (a feat's, a class's) holds no weapon: only the race counts there

The engine reads a weapon's proficiency of the inventory entry holding it (`areRequirementsMet(…, { sourceId })`), so `weapon.wielded`, like the rest of an item's own weapon's paths (`weapon.tohit.*`, `weapon.damage.*`), is read of that entry. An item held in two places (a dagger in each hand, a bastard sword in two weapon sets) is a weapon in each, each with its own proficiency, and an item's modifier on its weapon behind a gate reaches each weapon whose gate is met there (`sourcesOf`): a bonus gated on `weapon.wielded == mainhand` goes to the main-hand dagger, not the off-hand one. A race's proficiencies are its modifiers: the elf's martial ones (longsword, rapier, longbow and shortbow, composite ones included).

An item's proficiency is its base item's requirements: its template's, or its own when it's a template. An equipped weapon whose proficiency is unmet isn't proficient: −4 to hit, and nothing else (its modifiers still apply). Its own requirements on top of a template, or a plain item's, are its other requirements: unmet, its own modifiers don't apply, and it keeps its proficiency (`DetailedCharacterDataLoader`).

### Armor (type = "Armor")

Properties generated from `ARMOR_TYPE_DEFINITIONS` in `armorGenerator.ts`:

| Property Type        | Example (Chain Mail) |
|----------------------|----------------------|
| `ARMOR_PROFICIENCY`  | Medium               |
| `ARMOR_TYPE`         | Chain Mail           |
| `ARMOR_AC_BONUS`     | 5                    |
| `ARMOR_MAX_DEX`      | 2                    |
| `ARMOR_CHECK_PENALTY` | -5                  |
| `ITEM_SPELL_FAILURE` | 30                   |

Proficiency requirements:
- **Light**: `feats.armorproficiencylight.possessed == true`
- **Medium**: `feats.armorproficiencymedium.possessed == true`
- **Heavy**: `feats.armorproficiencyheavy.possessed == true`

Armor or a shield is equipped only when its proficiency is met, unless forced. Worn without it (forced, or the proficiency lost since), its armor check penalty applies to every attack (`tohit.gearpenalty`).

### Shields (type = "Shield")

Properties generated from `SHIELD_TYPE_DEFINITIONS` in `armorGenerator.ts`:

| Property Type        | Example (Heavy Steel Shield) |
|----------------------|------------------------------|
| `SHIELD_PROFICIENCY` | Heavy                        |
| `SHIELD_TYPE`        | Heavy Steel Shield           |
| `SHIELD_AC_BONUS`    | 2                            |
| `ARMOR_CHECK_PENALTY` | -2                          |
| `ITEM_SPELL_FAILURE` | 15                           |

Proficiency requirements:
- **Light/Heavy**: `feats.shieldproficiency.possessed == true`
- **Tower**: `feats.towershieldproficiency.possessed == true`

### Class Levels

Properties and requirements auto-generated in `ClassLevelsHooks.syncProperties()`:

| Property Type              | Description                              |
|----------------------------|------------------------------------------|
| `KLASS_LEVEL_BAB`          | BAB for this level, based on progression type (Full/Medium/Poor) |
| `KLASS_LEVEL_SKILL_POINTS` | Skill points per level from class definition |

Requirement auto-generated for level 2+:
- `classes.<normalized_class_name>.level > N-1` — ensures the character has reached the previous level before gaining the next

On update: changing BAB progression or skill points re-syncs the properties (deletes old, creates new).

### Skills

Properties auto-generated from the skill form's fields in `SkillsHooks.syncProperties()`, and read back by `readSkillFlags` (`server/rulesets/dnd3.5/skillFlags.ts`) for the skill API and the engine alike:
- `SKILL_IMPACTED_BY_WEIGHT` — whether armor check penalty applies
- `SKILL_CHECK_PENALTY_MULTIPLIER` — how many times over a skill armor weighs on takes the penalty (2 on Swim; absent means 1)
- `SKILL_USABLE_WITHOUT_TRAINING` — whether untrained use is allowed

Feat auto-generated per skill in `SkillsHooks.generateSkillFeat()`:
- `Skill Focus: <name>` — +3 `skills.<stripped>.misc`, linked to General aptitude
- Deleted on skill delete, regenerated on skill rename

Generated feat names cannot be edited directly. A feat is generated (`feats.generated`) when a family's feat is made
for each of its options, its name naming the option (`Weapon Focus: Longsword`): by the seeds (the parser's template
families, the per-weapon proficiencies, Favored Enemy per creature type, Deity's Weapon, War Domain Weapon) and by the
app (a skill's Skill Focus, a school's Spell Focus). A fork's copy keeps it. `FeatsService` refuses a new name for one
before any COW copy or write; descriptions and customizations remain editable. A feat merely named like one (a class
feature's `Terrain Mastery: …` option, a user's own) can be renamed. Renaming a skill deletes its old generated feat
and its customizations, then creates the replacement in the same transaction.

### Races

Properties the engine reads off a race (`combat/InitiativeAndSpeed.ts`, `DetailedCharacterEncumbrance.ts`), seeded where the SRD says so:
- `RACE_SPEED_IGNORES_ENCUMBRANCE` — the race keeps its speed in medium or heavy armor and under a medium or heavy load. The dwarf has it, through the parser's override (`reference/srd/races.json`).
- `RACE_QUADRUPED` — the race walks on four legs, so it carries more for its size: ×¼ Fine to ×24 Colossal (×1½ Medium, ×3 Large) instead of a biped's ×⅛ to ×16. The four-legged familiars, animal companions and special mounts have it (`content/raceProperties.ts`); birds, bats and snakes don't.

### Spells / Powers

Properties auto-generated from spell form fields in `hooks/generators/spellGenerator.ts`:

| Property Type | Description |
|---|---|
| `SPELL_SCHOOL` | School of magic (required) |
| `SPELL_SUBSCHOOL` | Subschool (optional) |
| `SPELL_DESCRIPTOR` | Spell descriptor(s) — one property row per value (optional, multi) |
| `SPELL_CASTING_TIME` | Casting time (optional) |
| `SPELL_RANGE_TYPE` | Range category (optional) |
| `SPELL_TARGET` | Target description (optional) |
| `SPELL_AREA_OF_EFFECT` | Area of effect description (optional) |
| `SPELL_DURATION` | Duration description (optional) |
| `SPELL_RESISTANCE` | Whether spell resistance applies (optional) |
| `SPELL_COMPONENT` | Required components — one property row per value (optional, multi) |

On create: generates properties from form fields. If school is provided, also generates Spell Focus feats (idempotent).
On update: deletes all existing properties, regenerates from updated form, and creates feats for a new school when needed. Existing school feats remain.
On delete: cleans up the spell's customizations. School feats remain even if the school has no spells left.

Feats auto-generated per unique school in `hooks/generators/spellGenerator.generateSpellFocusFeats()`:
- `Spell Focus: <school>` — +1 `powers.groups.<stripped_school>.*.dc.misc`, linked to General aptitude
- `Greater Spell Focus: <school>` — +1 `powers.groups.<stripped_school>.*.dc.misc`, requires `feats.spellfocus<stripped_school>.possessed == true`, linked to General aptitude
- Created idempotently (skipped if already exist for the school)
- Independent of current group membership; removing the last spell does not delete them

## D&D 3.5 Feat Guidelines

### Always add modifiers for feats with quantifiable flat bonuses:

- Weapon Focus: +1 `items.weapons.{w}.tohit.misc`
- Weapon Specialization: +2 `items.weapons.{w}.damage.misc`
- Greater variants: same pattern, stacks
- Spell Focus: +1 `powers.groups.{school}.*.dc.misc`
- Greater Spell Focus: +1 `powers.groups.{school}.*.dc.misc` (stacks with Spell Focus)
- Skill Focus: +3 `skills.{skill}.misc` (auto-generated per skill, linked to General aptitude)
- Skill bonus feats (Acrobatic, Alertness, etc.): +2 to `skills.{skill}.misc`
- Save bonus feats (Great Fortitude, etc.): +2 to `saves.{save}.misc`
- Improved Initiative: +4 `combat.initiative.misc`
- Two-Weapon Fighting: +2 `combat.twoweapon.mainhandpenalty`, +6 `combat.twoweapon.offhandpenalty`
- Improved and Greater Two-Weapon Fighting: +1 `combat.twoweapon.offhandattacks` each
- Toughness: +3 `combat.hp.misc`

### Template modifiers (dynamic references):

Use `{{ target.path }}` syntax to reference another stat as the modifier value. Template modifiers are evaluated **after** all literal modifiers, so they read final resolved values (see [How a sheet is built](#how-a-sheet-is-built)).

```ts
// Divine Grace: add CHA modifier to all saves
modifiers: [
  { target: "saves.*.misc", operator: "add", value: "{{ abilities.charisma.modifier }}", valueType: "number" },
]
```

The `*` wildcard expands to all entries (e.g., `saves.*.misc` applies to fortitude, reflex, and will).

### DON'T add modifiers for conditional/situational/temporary effects:

The character engine computes the **base, permanent character sheet** — no temporary buffs, conditional bonuses, or activated abilities. Only flat, always-on modifiers belong in the system.

- Dodge (+1 AC vs designated opponent only)
- Mobility (+4 AC vs AoO only)
- Point Blank Shot (+1 within 30 ft only)
- Power Attack / Combat Expertise (variable trade-off, player chooses)
- Weapon Finesse (handled via the feat's `FEAT_WEAPON_FINESSE` and the weapon's `WEAPON_FINESSABLE` properties, not a modifier)
- Rage (+4 STR/CON while raging — temporary)
- Smite Evil (+CHA to attack, +level to damage — per-use ability)

### Proficiency requirements on weapon feats:

A simple or martial weapon's proficiency is its group's or its own (an OR group); an exotic weapon's is its own, as for the weapon items above. `simple`, `martial` and `exotic` in `database/packages/dnd35/content/weapons.ts` build them, and `proficiencyRequirements(weapon)` picks the weapon's.

### Item creation feats require caster level (approximated as character level):

Item creation feats use `identity.meta.level` (character level) for their caster level requirement checks.

### Caster level advancement:

Prestige classes that advance spellcasting use a "Bonus Caster Level" aptitude system. Each advancement feat adds +1 to `classes.<name>.bonuscasterlevel` via a stackable modifier. Classes define `casterLevelAdvancement` with a type (`divine`, `arcane`, or general) and which levels grant the advancement feat pick. See `database/packages/dnd35/seed/classes.ts` for implementation. The class levels a bonus caster level reaches apply their spell slots each while its own requirements hold.

### A class's spell lists:

A class's spell lists are those its levels give slots in (`aptitudes.<list>.<spell level>.uses|allowed`), or "<Class> Spells". A class can send its slots to one of several lists, each while that list's requirements hold: the pious templar picks the paladin's or the blackguard's at her first level, and the other list's slots stay gated out. Bonus spells from the casting ability and the caster type's highest spell level (`spellcasting.divine`) read each of a class's lists.

### Seeded classes (for class-level requirements):

All 11 core classes: fighter, barbarian, cleric, rogue, sorcerer, monk, wizard, druid, ranger, paladin, bard.

Ruleset customization endpoints require the source entity to belong to the composed ruleset. IDs outside that scope (including character IDs) are rejected before writes; inherited sources are copied before customization.

Modifiers belong directly to ruleset entities, classes and class levels included. A modifier can have requirements, but cannot have other modifiers. Editing an inherited modifier or its requirements copies its owning entity and preserves the modifier requirements. Missing owners and sources outside the ruleset source chain are rejected.

Modifier, property, and requirement updates and deletes follow one pattern. The
row must be shown on the entity in the composed ruleset: its own rows plus
visible contributions from sibling extensions, and for a derived item, the
properties of its template. Editing a template property creates an override on
the item; deleting one is rejected. `cowCustomizationForMutation` then copies the
owning entity if it is inherited and resolves the row to its copy, so a sibling
contribution is written through the local copy, never the stored sibling. After a
COW copy, clients must use the returned `resolvedEntityId` and reload its customizations;
stale ancestor customization IDs are rejected. During the initial copy, mutations
use the exact copied IDs, including sibling properties, modifiers, and modifier
requirements, so equal values are never used to guess a copied row's identity.
Sibling copying follows the same source-chain order as display when selecting
duplicate contributions across extensions.
After copying, reads use the local customizations without merging the original
sibling rows back in. Editing or deleting a copied property, modifier, requirement,
or aptitude link therefore stays effective until the override is restored.

Modifiers and their requirements are copied in batches, without recursive modifier queries.

Customization writes hold a PostgreSQL row lock on their owning ruleset entity
until the transaction ends. Deletion and override restoration acquire that same
lock before removing child rows. Requirements on modifiers lock the modifier's
owner; class levels lock their class. After waiting, sources are checked again so a
deleted modifier or level cannot receive a new customization, and the modifier,
property, or requirement being edited is re-read so one deleted meanwhile is
reported as missing (404) for every kind. Ordinary reads
do not take these locks, and different owners can be edited independently.

First COW copies retain the fork/source advisory lock and hold a shared row lock
on the source while copying. An existing copy is locked before reuse. Modifier
deletion removes the selected modifiers and batches removal of their requirements
and activity records.
