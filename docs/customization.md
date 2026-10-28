# Customization System — Modifiers, Requirements, Fields

## Overview

Entities of the kinds a module's storage declares customizable (`StoredKind.customizable`: 3.5's feats, spells, items, races, classes, class levels; the storage's `customizableKinds()`, which the server asks `Engine.storage()`, the view's `RulesetData.isCustomizable`, and the rules' `customizationPages`, the kinds whose customizations have a page of their own, a class's being its page's tabs, which the server's activity links read as the storage's `customizationPages()`) can have **modifiers** and **requirements**, rows of the `customization` schema's tables naming their owner by type and id, and **fields**, its values by field ([persistence.md](./persistence.md#the-generic-tables)). A user edits an entity's modifiers and requirements in its page's tabs; its fields are its own form's, which its own save writes ([Fields](#fields)).

A class's own modifiers apply once to a character with any level of it, and its requirements are checked to take any level of it, with that level's own (the level-up wizard's class list), and on a character who has it. The class page's Modifiers and Requirements tabs are the sections every entity's customization page has (`OwnerCustomizationSections`).

The complete application operator definitions live in `shared/customization/operators.ts`. API validators consume those lists; `tests/shared/customization/operators.test.ts` verifies they match the migrated database's CHECK constraints. Keep generated `drizzle/schema.ts` free of handwritten helpers. Operator changes require a database migration and a schema refresh as well as updating the application definitions.

## How a sheet is built

A character's sheet holds **inputs** and **computed values**:

- **Inputs** are set from the character's data and changed by modifiers: ability scores and their misc, skill ranks and misc, the class's base attack bonus and base saves, the hit die rolls, the race's speed, an item's AC bonus and penalties, the carried weight, a weapon's magic and misc bonuses and dice.
- **Computed values** are getters, worked out from the inputs whenever read: totals, an ability's modifier, a skill's or a save's ability bonus, a skill's armor check penalty, Dexterity's bonus to AC, the size modifiers, the loads and their penalties, the speed under the load, a weapon's to-hit, Strength to damage and thrown and two-weapon attacks, a spell's DC. They never go stale: requirements, modifiers and the API read the sheet as it stands. A modifier can't target one (its target path is "req only"); a stored one is skipped, saying why.
- **The armor's and the shield's AC** (`combat.ac.armor`, `combat.ac.shield`) are both: the equipped items' AC (with what their own modifiers add), plus what modifiers on the path add. A modifier's write keeps only its own part, so the items' stays live.

The build (core's `CharacterBase.build`, with the 3.5 steps of the `Builds` concern of `DetailedCharacter`) loads the data once (on core's `CharacterDataLoader`, 3.5's `DetailedCharacterDataLoader`: `LoadedCharacterData`, the character's `data`: its rows as the view composes them, its levels' picks and grants with each spell's save and DC ability; the ruleset's own lists it reads off the view, and its spell lists off `SpellLists.of(rulesetData)`, derived once per view), sets the inputs (each component's `initialize`, in the order `CharacterComponents.build` lists them), sets what the ruleset sets first (`prepareSheet`: 3.5's race's adjustments to the ability scores, which the permanent scores keep, `AbilitiesComponent.getPermanentModifier`; a bonded creature's master and stat block, its stat block's feats granted as any granted feat is, `PossessesVirtually.possessFeat`, their modifiers joining the character's), and applies the other modifiers in rounds:

1. The modifiers no requirement gates apply first.
2. Then, round after round, the gated ones whose requirements the sheet now meets. So an item's Strength counts toward a feat's prerequisite, and a load requirement reads the load. Each round checks only the requirements gating a modifier still waiting, and a round that applies none ends it.
3. A modifier that grants (`grantsOf`: 3.5's `feats.<name>.possessed`, `spells.<spell>.<aptitude>.known` or `languages.<name>.known` set to true, `PossessesVirtually`) gives what it grants as it applies, in the first pass or a round, never before its requirements hold: a feat the character doesn't hold is possessed, counted and listed with those it has without a pick, a spell known on its list with its DC, a language spoken; one it holds already is marked `given`. What it grants's own modifiers join the build (`joinModifiers`), behind their own requirements (its prerequisites don't gate it: the grant does), and apply in turn, so a grant's requirements read what other grants gave. A grant applied while its requirements held stays given if another breaks them, as any modifier does: undoing it could loop. A grant names one feat, spell or language and sets a literal `true`: a modifier on what a grant sets (each category's `grants`: 3.5's feats' `possessed`, the spells' and the languages' `known`) written as a template, or on a wildcard (a family's `feats.<family>.*.possessed`), would mark what it names had without giving it (not counted, not listed, its modifiers never applied), so its save is refused and the build skips one stored, saying why (`CategoryPaths.findGrantError`, which the save's check and `ModifierEvaluator` read). A grant on a condition takes the condition as the modifier's requirement.
4. The ruleset's steps that read what the modifiers gave (`settleSheet`: 3.5's weapon rules, Weapon Finesse and a weapon's proficiency, by the feats the character has) settle the sheet after the first pass and after each round, each run setting them as the sheet stands, so every round reads what the modifiers before it gave (a requirement on `weapon.tohit.strength` reads a finessed attack, one on `weapon.tohit.gearpenalty` the armor worn without proficiency). Then the requirements are evaluated once more on the sheet the last round read, settled: the evaluation the templates, the spell modifiers and the validation read. It meets none of the modifiers still waiting (the last round found none ready on that sheet), so a grant only ever applies in the rounds, whose modifiers its grant joins. Template modifiers then apply, reading those values, when that evaluation meets their requirements; none is a grant, which sets a literal true: one on what a grant sets is skipped (step 3). Nothing checks the requirements again after them.
5. The modifiers that target a spell's DC or fields (`spells.*`, but a grant's `known`) apply last, after the spellcasting is computed (bonus caster levels, bonus spells, known spells), gated by the same evaluation.

A modifier the ruleset applies in each scope of the sheet on its own (`CharacterBase.scopesOf`: 3.5's weapon sets, for a modifier on the armor class an item held in a set gives, on the shield's part, which no set shares, or whose own requirements read the armor class or the shield; see [Armor class by weapon set](./target-paths.md#armor-class-by-weapon-set)) has its own requirements read in each scope, a group met when one scope meets it whole (`groupContextsOf`): conditions met in different scopes don't meet it. It waits in the rounds until one scope meets them, then applies in each scope that does (`contextsOf`), its target that scope's (`PathCategory.resolve`, 3.5's `CombatPaths`). Its source's requirements (a feat's prerequisites, an item's) are read on the sheet, as every other modifier's.

Each component extends core's `CharacterComponent` and is built after the ones it reads (`CharacterComponents.build`: the inventory before the armors, the shields and combat, combat before the weapons, the spell groupings before the spells), so none is wired in later; the build sets each up in that order, from the loaded data and the view, in one `initialize` (the bonded creatures' does nothing: modifiers alone fill it), and the spellcasting also has a `finalize`, the step 4 above. A component reads its siblings and writes none of them, but for two: the feat groupings, which hold the feats' own entries and hand their families to the feats (`FeatsComponent.injectGroupings`), and the spellcasting's `finalize`, which adds the slots its bonus caster levels and bonus spells give to the aptitudes, and the spells its lists make known to the spells, their groupings and the classes' first levels. What a component computes from others is counted when read, never copied: an aptitude's slots left, the skill points' budget, the character's level (`identity.meta.level`), the highest spell levels it casts (`spellcasting.arcane`, `.divine`) and caster levels (`spellcasting.casterlevel`, `.arcanecasterlevel`), and the size the sheet reads, its identity's race's (`identity.physiology.race.size`), which a modifier changes. A computed value a modifier may change (the level, a Hide check's size) keeps what the modifier adds on top of what it counts.

## Modifier Operators

`add`, `subtract`, `multiply`, `divide`, `set`

## Requirements

### Operators

`equal`, `not_equal`, `greater_than`, `less_than`, `greater_than_or_equal`, `less_than_or_equal`

### Paths that reach nothing

A requirement is met when what its path reaches satisfies it: any of it, for a wildcard. A path that resolves to nothing, a wildcard over an empty group (`spells.groups.evocation.*.dc.total` for a character without evocation spells), isn't met. A path that names nothing (`feats.weaponfocus.possessed`, a family by its own name) is invalid: the requirement is reported, and a character never meets it (what it gates never applies). Its group counts it as met wherever it sits, in an `or` too, so only what's read leaves a group unmet: the new character form's race picker reads only what the form says (an alignment, a gender), and a race's condition on what it doesn't say counts as met.

### Hierarchical Levels

Requirements use a dotted level numbering system for hierarchy:

- Root conditions: `"1"`, `"2"`, `"3"`
- Chain node: `"1"` with `chainingOperator: "or"` — children are `"1.1"`, `"1.2"`, etc.
- This enables OR/AND groups: a chain node groups its children under one logical operator
- An entity holds one requirement per level (`requirements_entity_id_entity_type_level_key`): a requirement created at a level its entity already holds, or edited onto one, is refused with a 409, on the copy an inherited entity's save makes too (`RequirementsService`; an edit started from a stale version is told so first)

### Requirement Builder Helpers

Seed data is written with nested `or()` / `and()` builders from `content/core/builders/customization/requirements.ts`, any ruleset's, with the paths its own (3.5's `feat`, `content/dnd3.5/builders/feats/possession.ts`):

```ts
import { and, eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";

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

`requirementRows()` in `database/seeders/core/SeederState.ts` walks the tree and assigns hierarchical levels:
- Root entries: `"1"`, `"2"`, `"3"`
- Children: `"1.1"`, `"1.2"`, nested: `"1.1.1"`, `"1.1.2"`

## Fields

Fields are an entity's values past its name and description, each named and declared by its ruleset (an item's cost, weight, type, slot and template flag, a class's hit die, a race's size and speed, a spell's school and save effect, a language's type): its field rows (`rules.entity_fields`, a ruleset's `rules.ruleset_fields`), or its links when the value names an entity, a single link (a class's bonus spell ability, a skill's ability, an item's template, a ruleset's skill point ability) or a list of them its form edits (a feat's pools, a spell's spell lists at their levels, a class level's saves and granted feats). Its record holds them whole, every field by its name and every single link by its role, which `Entities` reads and writes, and a ruleset's Settings `RulesetSettings` ([persistence.md](./persistence.md#the-generic-tables)). They hold what the character engine reads (e.g., weapon damage dice, armor AC bonus, spell school). See [Auto-Generated Customization](#auto-generated-customization) below for every field.

A field is never edited on its own: its entity's own form shows it beside its name and description, and its entity's own save writes it. The client never names a field; a ruleset adds, changes or removes a field by its declarations alone, with no client change and no column.

- **Declarations**: a ruleset's field names are constants of its vocabulary (`vocabulary/dnd3.5/fields/`), which the engine, the seeds, the parser and the tests import instead of writing the name. Each entity type declares its fields once, as data written `as const` (`ENTITY_FIELDS` in `vocabulary/dnd3.5/fields/entityFields.ts`), in the order its stat block (and its form) shows them: each by its name, with the stored field that keeps it (`field`; a link's, the role of its owner's links, `role`: a reference's single link, `kind: "ref"`, or a list of links its form edits, `kind: "links"`, each entry its target alone or with what it carries, `entries`: a tier, an amount, a pool it's granted through, `via`), its `label`, what it's for (`description`), its `kind`, the values it takes when they're a closed list (`values`: a select's options, which a save holds it to; a number's too, a hit die's, each named by its label, `labels`), the entity kind its value names by its id (`references`: a class's bonus spell ability is an ability's id), its `default` and bounds (a number's `min`, `max`, and the places it's kept to, `scale`: an item's cost and weight, two), whether a form must give it (`required`: a race's size never none, a skill's ability; a list of links' refusal of a new entity's empty one, its words), how it's written (`write: "always"`: a row whatever its value, its default where a write gives none, an item's slot, a class's hit die; an item's flags' `absent: null`), how sibling copies merge it (`merge`: the winner's alone, `winner`; the winner's, else its first sibling's that holds one, `fallback`; a set's values of them all, `union`), the role of the link it's read off another through where its entity holds none (`inherits`: an item's template's, `madeFrom`), when it counts (`when`), and how its form shows it: beside its name and description, before its other fields (`placement: "beside-name"`: a class's hit die, an item's cost, weight, type, slot and template, a race's size and speed, a skill's or a save's ability, a spell's save and save effect, a language's type, a feat's pools), on which of its form's values (`shownWhen`: an item's weapon section for a weapon), in which group (`shownIn`), in its `unit`, with an example (`placeholder`), as a template of its owner's type (`typeField`: an item's template), as another input of some of its values on other conditions (`narrowed`: a template's type, one a template can be of), or not at all (`form`: `"hidden"`, its rules' alone, a feat's generated flag, which no form takes; `"unshown"`, its page's to give, an item's template flag). Its shape is the engine's `FieldSpec` (`engine/core/fields/Field.ts`), which a codec built from it checks, and a test holds each declaration to its kind's keys, each stored field to one field (`tests/vocabulary/dnd3.5/fields/entityFields.test.ts`). The module hands them to the engine (its `fields`), whose `DeclaredFields` (`engine/core/fields/DeclaredFields.ts`: the fields in their declared order, a closed list's values, a flag's true and false) holds every owner's fields in the view in their order (`fieldsOf`, `OwnerFields`), and reads off them how sibling copies merge each field and single link (`mergeOf`, `roleMergeOf`, a link role's merge declared with it), the fields a kind reads off another (`inheritance`), and a number's places (`scaleOf`); what a write stores of them, a field always written that holds no value its default, is `FieldWrites`'. A character's own fields are declared alike (`CHARACTER_FIELDS` in `vocabulary/dnd3.5/fields/characterFields.ts`: its identity and its experience), which the module hands the engine beside them (its `characterFields`, the owner type `characters`'), so they're stored and read as an entity's are; its codec reads them, its sheet's edit is read by it, and its registry rows are built from them. The declared fields are the whole list: a ruleset invents none.
- **Codecs**: each kind reads and writes its fields by a codec built from its declarations (`FieldCodec`, `engine/core/fields/`, over `FieldSpec`'s kinds, `shared/customization/fields.ts`: a flag, a number in its bounds (and within what it holds exactly to its places, its value times ten to them a safe integer: `Decimals.holds`, `Field.boundsOf`), a choice, a list, a reference, a text, a progression (`kind: "progression"`: a frequency, one every so many levels, none at 0, and more at the levels it names, kept as a row of its frequency, `every:3`, and one per level it gives more at, `5:1`, which stand for the whole together, its default without any row), a group of fields under a label), in its folder (`entities/<kind>/fields.ts`: `FEAT_FIELDS`, `new FieldCodec(ENTITY_FIELDS.feats)`, `ITEM_FIELDS`, `CLASS_FIELDS`, `CLASS_LEVEL_FIELDS`, `SPELL_FIELDS`, `RACE_FIELDS`, `SKILL_FIELDS`; the ruleset's own, `RULESET_FIELDS`, `ruleset/fields.ts`). Every rule of a write is declared as data, which every writer applies alike (`Field.writtenValues`, `FieldWrites`: a seed's, a form's save, an import's): a spell without a school keeps none of the fields its form shows among its others (its school's `keepsForm`; its save and save effect beside its name stay). A codec reads an owner's fields and links (`read`, by the declared keys a form holds), and the same values by the stored field that keeps each (`readByField`: what an entity's answer holds); its form's names are those of the spec's fields its form takes (`formNames`: all but those its rules alone set), and a form's lists of links are read with them (`FieldCodec.parse`'s `lists`), which hold no value of their own. Their values are typed by the declarations (`FieldValues`: a choice is one of its values, a class's `casterType` `"Arcane" | "Divine"`). A field may count on a condition (`when`): on the value of another stored field of its level (neither a group nor a link), which the codec reads and takes from a form by, and every write stores it by (`FieldWrites`; a skill's armor check multiplier counts while armor weighs on it, its default otherwise; a group's condition, each of its fields). A link (a reference, a list of links, or a group holding one) counts on none, and a keeper keeps no link: a write of fields can't apply either, so each is refused as it's declared. Its form may show a field on the form's values alone (`shownWhen`: an item's weapon group for a weapon, its armor's for an armor), which the codec doesn't read. A field may show in a group of its level rather than on its own (`shownIn`), among the group's fields in their declared order, its value its own all the same: an armor's or a shield's max Dex bonus, armor check penalty and arcane spell failure, which both keep alike, show in its Armor or Shield section, with its base armor or shield, its proficiency and its bonus. A stored value outside its type's list still reads as stored: a closed list holds what's written, never what's read.
- **Forms**: the fields a form shows are the engine's to describe, never the client's, all of an entity's in one description (`FieldCodec.describe`, by `FieldForms`: each declared field's stored field, `field`, or its link's role, `role`, which the client reads its entity's value off and its form sends it by; its label, help and input, a choice's options and their labels or several values, a number's bounds, unit and default, a decimal's unit, a progression's default, its last level and the most a level gives, a reference's kind and whether it's required, a template's type field, a list of links' kind, its tiers' or amounts' bounds and its refusal of an empty one, a group's fields, where it shows, `placement`, and when, `shownWhen`). The rules answer every entity type's at once, and the ruleset's Settings' (`RulesDescription.fields`, `GET /api/rules`, from each module's declarations alone, `RulesEngine.describeAll`: no ruleset changes them), and the client lays each out by its input, one generic component per kind, those beside the name first, then the others, then the lists of links (`EntityFields`, [frontend.md](./frontend.md)).
- **One write path**: a field is written by its entity's own create and edit (`planCreate`, `planEdit`, a class level's through its class's owned entities: `owned(type, classId).planCreate`, `planEdit`), from the body's `fields`, by the stored field that keeps each, and its `links`, by role (`entityFields`, `server/routers/api/validation.ts`, typed `EntityFieldValues`). The kind's codec reads them against the ruleset's declarations, its only parser of a form (`FieldForms.parse`, which nests them into the codec's names, then `FieldCodec.parse`, `RulesetEntity.readForm`): a key that's no field or role its entity type declares is refused as invalid, by field (`fields.school: Not a field of this entity`), and so is a value outside its type's closed list (`fields.FEAT_FAMILY.0`, `Hit Die must be one of: 4, 6, 8, 10, 12`), a number past its bounds, a new entity's form that leaves out what it requires (a skill's ability, a feat's pools: `At least one aptitude must be selected`), a field it never leaves at none given none (a hit die, a race's size), and a reference or a list's entry the view shows no entity of, naming it (`Ability <id> does not belong to this ruleset`), or a list naming one twice; each entity it names is stored as the id the view keys it by (a fork's copy's for its source's). A new entity's field its form leaves out is its default (a hit die's d8, a race's Medium and 30 feet), which its storage writes too for any writer that gives none (`write: "always"` with a `default`), so the view's types hold it present (`HeldFieldValues`). The fields it gives merge over those the entity keeps, and its plan writes them with its row, each field and link role its form shows replaced (`RulesetEntity.fieldsWrite`, a `FieldsWrite` in its row, which `Entities.create` and `update` write), with what its kind's rules add (a spell's school's Spell Focus feats, a skill's Skill Focus). An inherited entity is copied first, as any edit copies it (`EntityWriter`). An edit sends the fields it changed alone, but those beside its name and its lists of links, whole (`useEntitySave`), so a stored value its ruleset no longer lists stays until it's changed, and is refused if it's given back.
- **Items made from a template** store only the fields their template doesn't hold: a save writes its fields over those it shows (its own over its template's) as the values its template's don't hold, clearing the rest (`FieldCodec.toOverrides`, `ItemEntity.fieldsWrite`), so the item keeps reading the rest off its template, and a template's change reaches them. A field left empty is its template's. Each field but its type, slot and template flag is read off its template where the item holds none (`inherits: "madeFrom"`, `RulesetData.withInheritedFields`): its weight and cost too, which its page, its form, its list, a sheet and the inventory show as its template's, and which a save that gives the template's keeps none of its own of (`FieldCodec.toOverrides` clears each field it reads off its template that holds the same). A duplicate of an item that isn't a template holds its source's fields its form shows, its form's own over them.
- **The ruleset's own fields**, its **Settings** (`ENTITY_FIELDS.rulesets`, `RULESET_FIELDS`: the ability skill points come from, and the progression every character follows whatever its classes, its feats and its ability increases at each character level), are its fields too, read off its chain's own rows, the fork's first (`RulesetPart.describeSettings`, `RulesetData.rulesetValuesOf`), and written by its own save (`planSettings`: checked as an entity's fields are, written as the ruleset's own rows), which who edits its content makes (`GET|PUT /api/rulesets/:id/settings`, `RulesetSettingsService`; the ruleset page's Settings tab). See [Rulesets](#rulesets).

## Wildcard Patterns

### Feat family groupings (`feats.<family>.*.possessed`)

Feats with a `FEAT_FAMILY` field are grouped by the character engine. Requirements can check "any feat in the family" using the `feats.<family>.*.possessed` wildcard. The group holds every feat of the family in the character's ruleset, had or not: the `*` expands to all of them, and the requirement is met when the character has any. `feats.<family>.*.count` reads each one's count, and `feats.<family>.count` all of them together: "any two luck feats" is `feats.luck.count >= 2`, and "Sneak attack +2d6" `feats.sneakattack.count >= 2`, every class's dice together. A family's name alone (`feats.weaponfocus.possessed`) names no feat, and a modifier on it gives none: it's skipped. A feat named like its family shares its key: `feats.martialweaponproficiency.possessed` is the feat Martial Weapon Proficiency (every martial weapon), and `feats.martialweaponproficiency.*.possessed` any feat of its family (Martial Weapon Proficiency: Rapier…), which doesn't include that feat; its `count` is the feat's, the family's isn't reachable. A family's paths are a requirement's only: a modifier grants one feat (`feats.<name>.possessed` set true), never a family, whose feats it would mark possessed without giving any. So the path picker doesn't offer `feats.<family>.*.possessed` to a modifier, the save refuses it, and the build skips one stored, saying why (see [How a sheet is built](#how-a-sheet-is-built)).

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

Available families: `FEAT_FAMILIES` in `vocabulary/dnd3.5/feats.ts`, the `FEAT_FAMILY` values the customization offers and the seeded rules use (`tests/seeds/dnd3.5/feats.test.ts` keeps the two the same):
- Template families: `weaponfocus`, `greaterweaponfocus`, `weaponspecialization`, `greaterweaponspecialization`, `improvedcritical`, `powercritical`, `martialweaponproficiency`, `exoticweaponproficiency`, `rapidreload`, `spellfocus`, `greaterspellfocus`, `arcanedefense`, `skillfocus`
- Feat type families, each named like its type: `metamagic`, `itemcreation`, `luck`, and Complete Arcane's `draconic` feats, by their "Draconic …" name
- Class feature families: `turnorrebukeundead`, `wildshape`, `favoredenemy`, `smite` (any smite: smite evil's, a blackguard's smite good, a hunter of the dead's smite undead, a samurai's kiai smite…), and the features each class seeds as its own feat, "Sneak Attack (Rogue)" (`CLASS_FEATURE_FAMILIES`, which `CLASS_FEAT_FAMILIES` in `codegen/dnd3.5/tools/terms/classFeatFamilies.ts` matches): `animalcompanion`, `bardicmusic`, `evasion`, `flurryofblows`, `grace`, `inspirecourage`, `kipower`, `layonhands`, `poisonuse`, `rage`, `skirmish`, `smiteevil`, `sneakattack`, `suddenstrike`, `summonfamiliar`, `trapfinding`

Grouping paths are generated from the families (`FeatsPaths`' `generateFamilyPaths`: `FEAT_FAMILIES` plus the ruleset's `FEAT_FAMILY` values, a stored row's of another family too, which a save no longer takes) — no manual path registration needed. `FeatGroupingsComponent` holds each family's feats, which those paths read on the sheet. The parser's generator writes a check of a family by its own name ("Weapon Specialization") as a check of any of its feats (`FeatSeeds.familyChecks`), and a count of it ("Sneak attack +2d6") as the family's count.

### Skill sub-type wildcards (`skills.<prefix>*.rank`)

Skills with sub-types (Craft, Knowledge, Perform) share a common slug prefix. Requirements can use prefix matching to check "any skill in the group":

```ts
// "Any Knowledge skill 5 ranks"
requirements: [gte("skills.knowledge*.rank", 5)]

// "Any Craft skill 10 ranks"
requirements: [gte("skills.craft*.rank", 10)]
```

The `*` suffix matches any key starting with the prefix. This is handled by the engine's path walk (`PathTraverser`, `engine/core/paths/`).

A skill's name without the `*` reaches its subtypes too: next to the skill of that name (`skills.craft.rank`, Craft and each Craft (…)), or alone when no skill has it (`skills.knowledge.rank`: implicit prefix expansion). Only skills: anywhere else a name reaches its own entry only. A feat's name is that feat, not the feats whose names it starts (`feats.dodge.possessed` isn't met by Dodge Bonus (Swashbuckler)), and names nothing when no feat has it (`feats.light.possessed`, not Lightning Reflexes). A family of feats is checked by its group.

### Modifier wildcards (`saves.*.misc`, `items.weapons.*.damage.misc`)

Modifiers can use `*` to target all entries in a category, but what a grant sets: a grant names the one feat, spell or language it gives. See [Template modifiers](#template-modifiers-dynamic-references) below.

## Target Paths

See [docs/target-paths.md](./target-paths.md) for all available target paths.

## Languages

A character speaks the languages its modifiers grant, `languages.<name>.known` set true (`set` with `true`), and the ones it picks. A grant is given as its modifier applies, in the build's rounds behind its requirements as any modifier, as a feat's possession is (`PossessesVirtually`, see [How a sheet is built](#how-a-sheet-is-built)): a race's automatic languages (the dwarf's Common and Dwarven), a class level's (the druid's Druidic, at its 1st level, while the druid's alignment meets that level's requirements), a feat's, an equipped item's, the character's own. What a modifier grants is never stored and never picked: the sheet shows it fixed, and a languages edit leaves it out of the picks it stores. A requirement on `languages.<name>.known` reads the language however the character speaks it, picked or granted, so a prestige class can require Draconic. The picks' room counts `languages.extrapicks`, which a class level adds to (`add` 1: the loremaster's 4th and 8th levels, the mage of the Arcane Order's 3rd and 6th). See [languages](./target-paths.md#languages) and [the ruling](./dnd3.5/rules-decisions.md#characters).

The seeds write these with the content's builders (`content/dnd3.5/builders/languages/knowledge.ts`): `grantLanguage(name)` (a race's automatic languages, a class's at its 1st level, which the parser reads off each race's and class's page: "Automatic Languages: …", "A druid also knows Druidic, a secret language…") and `languagePick()` (a class level that gives a new language of any kind: "A loremaster can choose any new language at 4th and 8th level"). Druidic is the core rules' one secret language (its type `Secret`).

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

Some entities get fields, requirements, or feats generated. Every kind's form writes its fields with its row (`RulesetEntity.fieldsWrite`, which each kind's rules build on); spells and skills get their effects too when they're created or edited, from the engine's plan of the form, its `writes` (`entities("spells").planCreate` and `planEdit`, `entities("skills").planCreate` and `planEdit`: `engine/rulesets/dnd3.5/entities/spells/SpellEntity.ts` with `spells/fields.ts` and `feats/SpellFocusFeats.ts`, `skills/SkillEntity.ts`). Weapons, armors and shields get theirs from their type's definition when the content packages write them (the tables of `vocabulary/dnd3.5/weapons.ts` and `armor.ts`, through `content/dnd3.5/builders/items/fields.ts`: `weaponFields`, `armorFields`, `shieldFields`). They're an item's fields: `ITEM_FIELDS.read` reads them (`engine/rulesets/dnd3.5/entities/items/fields.ts`, which the inventory and the equipping check read with), and `ITEM_FIELDS.write` gives them back as a write, which a test holds every seeded item's to. Saving an item plans its slot (`entities("items").planCreate`, `planDuplicate`, `planEdit`, `planVariants`: an armor's the torso, a shield's the off hand), and its fields its form gives. An item made from a template stores only the fields it overrides (`FieldCodec.toOverrides`), and `RulesetData.withInheritedFields` gives it the template's fields it holds none of before they're read; `RulesetData.templateRequirements` splits its requirements into its template's (`template`) and its own (`own`), by its kind's declared template flag and the role it inherits through, which the 3.5 rules read as its proficiency and its other requirements.

Every create's or edit's plan takes one shape, `EntityWrites` (`engine/core/module/parts/entities/plans.ts`): it says what to write beside the entity's row, without ids, and the service writes it in its transaction (`EntityWriter.setParts`, `server/services/rulesets/entities/EntityWriter.ts`).
- `made` gives the entities the plan makes with it, each by its type (`type`), its record's write (`EntityWrite`: its name, description and fields), its links by role (`links`, each a `LinkSet`: a role, its targets' kind, and each link's target, `toId`, and its tier, pool, amount or flag where it holds one: a feat's `listedIn` links to its pools) and its customizations, and `removed` the ones that go with it, each by its type and id, refused while a character picked one. The core names no kind: the 3.5 module's are feats, generated in the general feats' pool (`GeneratedFeats`, `engine/rulesets/dnd3.5/entities/feats/GeneratedFeats.ts`: a skill's Skill Focus, a school's Spell Focus). The service writes each as its kind's entity (`Entities.create`, by its type), reading of the view only its copy-on-write data.
- A feat that's one entity's own (a skill's Skill Focus) is made, renamed and deleted with it: a new skill brings its own, even in a fork that deleted the one it inherited.
- A feat that a grouping's entities share (a school's Spell Focus) is made when the first of them is saved, unless the ruleset or one of its sources has it, even in a fork that deleted the copy it inherited, and none goes with an entity.

### Weapons (type = "Weapon")

Fields generated from `WEAPON_TYPE_DEFINITIONS` in `vocabulary/dnd3.5/weapons.ts` (`weaponFields`, `content/dnd3.5/builders/items/fields.ts`):

| Field                      | Example (Longsword)                 |
|----------------------------|-------------------------------------|
| `WEAPON_PROFICIENCY`       | Martial                             |
| `WEAPON_FAMILY`            | Sword                               |
| `WEAPON_BASE_DAMAGE`       | 1d8                                 |
| `WEAPON_CRITICAL_RANGE`    | 1                                   |
| `WEAPON_CRITICAL_MULTIPLIER` | 2                                 |
| `WEAPON_SIZE`              | Medium                              |
| `WEAPON_TYPE`              | Longsword                           |
| `DAMAGE_TYPE`              | Slashing (one value per damage type) |
| `WEAPON_FINESSABLE`        | false                               |
| `WEAPON_RANGE`             | _(only if > 0)_                     |
| `WEAPON_RANGED`            | _(only on a ranged weapon)_         |
| `WEAPON_MAX_RANGE_INCREMENTS` | _(bows, crossbows, slings: 10; the net: 1)_ |
| `WEAPON_STRENGTH_DAMAGE`   | _(only if not by slot)_             |
| `WEAPON_MIGHTY`            | _(composite bows: 0)_               |
| `WEAPON_ONE_HANDED_PENALTY` | _(crossbows: −2 light, −4 heavy)_  |
| `WEAPON_ONE_HAND_TRAINING` | _(bastard sword, dwarven waraxe: true)_ |
| `WEAPON_DOUBLE_DAMAGE`     | _(double weapons: the other end's dice, a quarterstaff's 1d6)_ |
| `WEAPON_REACH`             | _(only if > 0)_                     |

How the engine reads a weapon's attack (`combat/concerns/Attacks.ts`), the SRD's rules:
- A **ranged weapon** (`WEAPON_RANGED`: bows, crossbows, slings, darts, javelins, bolas, nets, shuriken) attacks with Dexterity. Any other attacks with Strength, or with Dexterity when it's `WEAPON_FINESSABLE` and the character has a feat with `FEAT_WEAPON_FINESSE` (Weapon Finesse), if that's better: a carried shield's armor check penalty applies to that Dexterity (a shield the character is proficient with: another's costs every attack already).
- A **composite bow** (a bow with a `WEAPON_MIGHTY`, 0 for the seeded ones) takes −2 to attack when the character's Strength bonus is below its rating. A plain bow, without one, never does.
- A **melee weapon with a range increment** (`WEAPON_RANGE`: daggers, throwing axes, spears…) can also be thrown: its weapon slot carries a `thrown` attack with Dexterity, which the sheets list as a second row.
- **Range increments**: a ranged or thrown attack takes −2 for each full range increment past the first (`RANGE_INCREMENT_PENALTY`), out to the increments its weapon reaches (`WEAPON_MAX_RANGE_INCREMENTS`): ten for a **projectile weapon** (bows, crossbows, slings), one for a net ("A net's maximum range is 10 feet"), and five for a thrown weapon, which doesn't say (`THROWN_RANGE_INCREMENTS`, `AttackRules.computeMaxRange`: a weapon slot's `maxRange`). The sheets give each ranged or thrown row its maximum range and its penalty per increment (`CombatSheet`'s `range` and `increment`: "1,100 ft.", "-2 / 110 ft."; none for a net, which reaches only its first), and a melee row neither. A weapon thrown that isn't made for it (−4, a 10-foot increment) isn't listed.
- **Strength to damage** (`WEAPON_STRENGTH_DAMAGE`): `Slot` when absent (the slot's share of a bonus: all of it in the main hand, half in the off hand, one and a half in two hands, all of it for a light weapon in two hands; a penalty in full), `Rating` (bows: a penalty, and a bonus up to `WEAPON_MIGHTY`, 0 without) or `None` (crossbows).
- A weapon is **light** when its `WEAPON_SIZE` is Tiny or Small. The table's sizes are written for a Medium wielder, and the engine sizes every weapon for its wielder (its damage too), so a halfling's shortsword is light as a human's is.
- A **crossbow** takes two hands to load: held in one (main or off hand), it fires at its `WEAPON_ONE_HANDED_PENALTY`, −2 for a light crossbow and −4 for a heavy one, a repeating one as the crossbow of its size. A hand crossbow, made for one hand, has none.
- **The gear** (`tohit.gearpenalty`, on every attack): the armor check penalty of each armor and shield worn without proficiency, and −2 with a tower shield, for its bulk.
- A weapon with `WEAPON_ONE_HAND_TRAINING` (the bastard sword, the dwarven waraxe) is **too large for one hand without training**: the inventory refuses it there, unless forced, when the character lacks its proficiency in one hand: its proficiency read in no hand (`areRequirementsMet(…, { sourceId: null })`), which a dwarf's familiarity meets and what only two hands give doesn't. Without, it's "as impossible as wielding a greatsword one-handed" (FAQ), not a −4.
- A weapon whose `WEAPON_SIZE` is Large is **two-handed** (`ItemPlacement.isTwoHanded`), whatever the wielder's size: the inventory dialogs offer it both hands alone (its placement's `locations`), and the inventory refuses it in one hand (`character(input).planInventoryEntry`, by `items/Equipping.ts`). The bows are Large: "you need at least two hands to use a bow, regardless of its size".
- **Thrown weapons and slings** (a ranged weapon Strength adds to by the hand, so not a bow or a crossbow) take `combat.throwing.tohit` to attack, and so does a melee weapon's thrown attack: a halfling's +1.
- **Natural attacks** (a bonded creature's, by its stat block in `vocabulary/dnd3.5/bondedCreatures.ts`): each sits in a set's main or off hand for the sheets, which label it Primary or Secondary, but the hand doesn't count. A primary attack adds its whole Strength bonus to damage, one and a half when it's the creature's only attack. A secondary one takes `combat.naturalattacks.secondarypenalty` (−5) to attack and adds half. Each attacks once a round, whatever the base attack bonus. The first primary one also makes `combat.naturalattacks.extraattacks` extra attacks, each at −5. An animal companion's Multiattack sets the penalty to −2 with three or more attacks (`combat.naturalattacks.count`), and gives one extra primary attack with fewer.
- **Two weapons**: when a set holds an equipped weapon in each hand (an unarmed strike or a natural attack doesn't count), each weapon slot carries a `twoweapon` attack, which the sheets list as more rows: the main hand's attacks with `combat.twoweapon.mainhandpenalty` (−6), the off hand's first attack and `combat.twoweapon.offhandattacks` − 1 more, each 5 lower, with `combat.twoweapon.offhandpenalty` (−10). A light off-hand weapon lessens both penalties by 2, and so does a one-handed one with a feat with `FEAT_OVERSIZED_TWO_WEAPON_FIGHTING` (Complete Adventurer's Oversized Two-Weapon Fighting). The feats change these fields through modifiers. A **double weapon** (`WEAPON_DOUBLE_DAMAGE`) held in two hands fights as two weapons too, its other end a light off-hand one: its `twoweapon` attacks are the main end's, with its whole Strength bonus (its row's damage), and its `offend` the other end's, with its own dice and half the Strength bonus. A sling counts as a one-handed weapon, not a light one (its size is Medium).

Proficiency requirements (on the item, checked at equip time):
- **Simple**: OR chain — `feats.simpleweaponproficiency.possessed` OR `feats.simpleweaponproficiency<weapon>.possessed` (a gauntlet's also takes `feats.simpleweaponproficiencyunarmedstrike.possessed`: a strike with it is unarmed)
- **Martial**: OR chain — `feats.martialweaponproficiency.possessed` OR `feats.martialweaponproficiency<weapon>.possessed`
- **Exotic**: `feats.exoticweaponproficiency<weapon>.possessed == true`; or, for a weapon that counts as martial, `feats.martialweaponproficiency.possessed` while it's held in two hands (`weapon.wielded == twohanded`: the bastard sword, the dwarven waraxe) or by its wielder's race (`identity.physiology.race.name`: a dwarf's waraxe and urgrosh, a gnome's hooked hammer). A prerequisite (a feat's, a class's) holds no weapon: only the race counts there

The engine reads a weapon's proficiency of the inventory entry holding it (`areRequirementsMet(…, { sourceId })`), so `weapon.wielded`, like the rest of an item's own weapon's paths (`weapon.tohit.*`, `weapon.damage.*`), is read of that entry. An item held in two places (a dagger in each hand, a bastard sword in two weapon sets) is a weapon in each, each with its own proficiency, and an item's modifier on its weapon behind a gate reaches each weapon whose gate is met there (`contextsOf`): a bonus gated on `weapon.wielded == mainhand` goes to the main-hand dagger, not the off-hand one. A race's proficiencies are its modifiers: the elf's martial ones (longsword, rapier, longbow and shortbow, composite ones included).

An item's proficiency is its base item's requirements: its template's, or its own when it's a template. An equipped weapon whose proficiency is unmet isn't proficient: −4 to hit, and nothing else (its modifiers still apply). Its own requirements on top of a template, or a plain item's, are its other requirements: unmet, its own modifiers don't apply, and it keeps its proficiency (core's loader, `CharacterDataLoader`, `engine/core/character/CharacterDataLoader.ts`).

### Armor (type = "Armor")

Fields generated from `ARMOR_TYPE_DEFINITIONS` in `vocabulary/dnd3.5/armor.ts` (`armorFields`):

| Field                | Example (Chain Mail) |
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

Fields generated from `SHIELD_TYPE_DEFINITIONS` in `vocabulary/dnd3.5/armor.ts` (`shieldFields`):

| Field                | Example (Heavy Steel Shield) |
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

Fields written from a level's form, its create's and its edit's, by `owned("classes", classId).planCreate` and `planEdit` (`classes/ClassLevelEntity.ts`, with `classes/fields.ts`: `CLASS_LEVEL_FIELDS`):

| Field                      | Description                              |
|----------------------------|------------------------------------------|
| `CLASS_LEVEL_BAB`          | BAB for this level, based on progression type (Full/Medium/Poor), 0 to `MAX_CLASS_LEVEL` |
| `CLASS_LEVEL_SKILL_POINTS` | Skill points per level from class definition, 0 to `MAX_TABLE_COUNT` |

A level writes no requirement of the class's previous one: a class's levels are taken in order, its next its lowest the character doesn't hold, by the class's id (`LevelRules.findNextClassLevel`, which the level-up's save, the class picker and a PCGen import read), so renaming a class leaves its levels as they are. See [the ruling](./dnd3.5/rules-decisions.md#levelling-up).

On update: changing BAB progression or skill points rewrites the fields (their old values replaced).

### Skills

Fields written from the skill form by `entities("skills").planCreate` and `planEdit`. They're a skill's fields: `SKILL_FIELDS.read` reads them (`engine/rulesets/dnd3.5/entities/skills/fields.ts`, which the skill API's descriptions, `entities("skills").describe` and its list's `describe`, a save's answer and the character read with too), and the core rules' seeder writes them as its seeds give them, by stored field (`content/dnd3.5/data/coreRules.ts`), through the write path a save writes through, which stores them as it stores a save's (`Engine.storage().writtenFields`):
- `SKILL_IMPACTED_BY_WEIGHT` — whether armor check penalty applies
- `SKILL_CHECK_PENALTY_MULTIPLIER` — how many times over a skill armor weighs on takes the penalty (2 on Swim; absent means 1): it counts while the skill is impacted by weight (`when`), 1 otherwise, and its form shows it then
- `SKILL_USABLE_WITHOUT_TRAINING` — whether untrained use is allowed

Feat auto-generated per skill by `entities("skills").planCreate` and `planEdit` (their `made`):
- `Skill Focus: <name>` — +3 `skills.<stripped>.misc`, linked to General aptitude
- Deleted on skill delete (`entities("skills").planDelete`'s `removed`, refused while a character picked it), regenerated on skill rename

Generated feat names cannot be edited directly. A feat is generated (`feats.generated`) when a family's feat is made
for each of its options, its name naming the option (`Weapon Focus: Longsword`): by the seeds (the parser's template
families, the per-weapon proficiencies, Favored Enemy per creature type, Deity's Weapon, War Domain Weapon) and by the
app (a skill's Skill Focus, a school's Spell Focus). A fork's copy keeps it. The engine refuses a new name for one
(`entities("feats").planEdit`, `feats/FeatEntity.ts`) before any COW copy or write; descriptions and customizations remain editable.
A feat merely named like one (a class feature's `Terrain Mastery: …` option, a user's own) can be renamed. Renaming a
skill deletes its old generated feat and its customizations, then creates the replacement in the same transaction.

### Races

Fields the engine reads off a race (`combat/concerns/InitiativeAndSpeed.ts`, `combat/EncumbranceComponent.ts`), seeded where the SRD says so. They're a race's fields, which its form edits and the components read with `RACE_FIELDS.read` (`entities/races/fields.ts`):
- `RACE_SPEED_IGNORES_ENCUMBRANCE` — the race keeps its speed in medium or heavy armor and under a medium or heavy load. The dwarf has it, through the parser's override (`reference/srd/races.json`).
- `RACE_QUADRUPED` — the race walks on four legs, so it carries more for its size: ×¼ Fine to ×24 Colossal (×1½ Medium, ×3 Large) instead of a biped's ×⅛ to ×16. The four-legged familiars, animal companions and special mounts have it (`QUADRUPED_FIELDS`, `content/dnd3.5/builders/races/fields.ts`, which `content/dnd3.5/data/bonds/` gives them); birds, bats and snakes don't.

### Rulesets

A ruleset's own link, `skillPointAbility`: the ability its characters' skill points come from, Intelligence in the seeds. It's the ruleset's field, which a ruleset always names (a `ref` field, `required: true`, its link's role), which the character's loader reads with `RULESET_FIELDS.read` (`ruleset/fields.ts`), over the rows of the ruleset's chain, the fork's first, and which the core rules' seeder writes as its link, `skillPointAbility` (`SeedsSkills.seedSkillPointAbility`). A fork copies its source's rows as they are (`RulesetSettings.createCopy`), so it starts with its source's value; its Settings tab changes it (`RulesetSettingsService.updateSettings`, the engine's `planSettings`), which writes the fork's own row in place of its copy, its source's left as it was.

Its progression, which every character of the ruleset follows whatever its classes, is two more of its fields, each a progression (`kind: "progression"`, its value and its counts `shared/customization/progression.ts`'s, which the engine and the form both read): a frequency, one every so many character levels (none at 0), which runs past the last level too, and more at the levels it names, up to level 20. `RULESET_FEAT_ADVANCEMENT` (`featAdvancement`, Feat Advancement: the feats the levels give to pick in the general feats' pool, a level giving at most `MAX_GENERAL_FEATS_PER_LEVEL` with its frequency's) and `RULESET_ABILITY_INCREASES` (`abilityIncreases`, Ability Score Increases: the levels that raise an ability, one at most a level, which the level-up wizard picks, so a level the frequency gives one isn't listed). Without a row in the ruleset's chain each reads as the core rules' (a feat every `GENERAL_FEAT_LEVEL_INTERVAL` levels and `FIRST_LEVEL_GENERAL_FEATS` more at the first, an increase every `ABILITY_INCREASE_LEVEL_INTERVAL`: `vocabulary/dnd3.5/classes.ts`), so the seeds write none; a save writes its frequency's row and those of the levels it gives more at. `LevelRules.of(view)` reads them for the level-up (its pools' general feat slots, `PlansAptitudeSlots`; the levels that take an increase, `LevelUpSteps`, `LevelUpPreview`; what a save's increases add up to, `getAbilityIncreaseTotal`), and the character's loader for its general feats (`LoadedCharacterData.levelRules`). A house rule that gives every class a feat at levels 3 and 5 is two levels added to Feat Advancement on the Settings tab, which a class added later or an extension's follows too. A bonded creature's feats at its hit dice are the Monster Manual's, whatever the Settings (`CREATURE_FEAT_HIT_DICE_INTERVAL`). A change reaches the ruleset's characters as they are: one with more general feats than its levels now give holds an overfull pool, which an edit of a level that picked one fits again, and an ability increase saved at a level the Settings no longer give one counts for nothing (the loader keeps those of the levels that take one, `DetailedCharacterDataLoader.readAbilityPicks`): its level's edit opens without it (`LevelSelections.describeLevel`), which a save could never keep, and writes it away.

### Spells

Fields written from the spell form by `entities("spells").planCreate` and `planEdit`. They're a spell's fields: `SPELL_FIELDS.read` reads them (`entities/spells/fields.ts`, which the spell groupings read a spell's school and descriptors with too), and `SPELL_FIELDS.write` writes them:

| Field | Description |
|---|---|
| `SPELL_SCHOOL` | School of magic (required) |
| `SPELL_SUBSCHOOL` | Subschool (optional) |
| `SPELL_DESCRIPTOR` | Spell descriptor(s) — one field row per value (optional, multi) |
| `SPELL_CASTING_TIME` | Casting time (optional) |
| `SPELL_RANGE_TYPE` | Range, as the book writes it: "Touch", "60 ft.", "Close (25 ft. + 5 ft./2 levels)" (optional, free text) |
| `SPELL_TARGET` | Target description (optional) |
| `SPELL_EFFECT` | Effect description: what the spell brings into being, a summoned creature, a wall, a ray (optional) |
| `SPELL_AREA_OF_EFFECT` | Area of effect description (optional) |
| `SPELL_DURATION` | Duration description (optional) |
| `SPELL_RESISTANCE` | Whether spell resistance applies, as the book writes it: "Yes", "No", "Yes (harmless)" (optional, free text) |
| `SPELL_COMPONENT` | Required components — one field row per value (optional, multi) |

On create: with a school, writes the form's fields, and the school's Spell Focus feats unless they're there (`entities("spells").planCreate`'s `made`).
On update: replaces the spell's fields with the form's, none without a school, and creates the feats of a school that's new. Existing school feats remain.
On delete: cleans up the spell's customizations. School feats remain even if the school has no spells left.

Feats auto-generated per unique school by `entities("spells").planCreate` and `planEdit` (`SpellFocusFeats`, `feats/SpellFocusFeats.ts`, a set of `GeneratedFeats` beside a skill's `SkillFocusFeats`):
- `Spell Focus: <school>` — +1 `spells.groups.<stripped_school>.*.dc.misc`, linked to General aptitude
- `Greater Spell Focus: <school>` — +1 `spells.groups.<stripped_school>.*.dc.misc`, requires `feats.spellfocus<stripped_school>.possessed == true`, linked to General aptitude
- Created idempotently (skipped if already exist for the school)
- Independent of current group membership; removing the last spell does not delete them

## D&D 3.5 Feat Guidelines

### Always add modifiers for feats with quantifiable flat bonuses:

- Weapon Focus: +1 `items.weapons.{w}.tohit.misc`
- Weapon Specialization: +2 `items.weapons.{w}.damage.misc`
- Greater variants: same pattern, stacks
- Spell Focus: +1 `spells.groups.{school}.*.dc.misc`
- Greater Spell Focus: +1 `spells.groups.{school}.*.dc.misc` (stacks with Spell Focus)
- Skill Focus: +3 `skills.{skill}.misc` (auto-generated per skill, linked to General aptitude)
- Skill bonus feats (Acrobatic, Alertness, etc.): +2 to `skills.{skill}.misc`
- Save bonus feats (Great Fortitude, etc.): +2 to `saves.{save}.misc`
- Improved Initiative: +4 `combat.initiative.misc`
- Two-Weapon Fighting: +2 `combat.twoweapon.mainhandpenalty`, +6 `combat.twoweapon.offhandpenalty`
- Improved and Greater Two-Weapon Fighting: +1 `combat.twoweapon.offhandattacks` each
- Toughness: +3 `combat.hp.misc`

### Template modifiers (dynamic references):

Use `{{ target.path }}` syntax to reference another stat as the modifier value. Template modifiers are evaluated **after** all literal modifiers, so they read final resolved values (see [How a sheet is built](#how-a-sheet-is-built)).

The template field's path picker lists what a template reads (the `template` kind of the target path listing): one value each from the sheet, the read-only totals and modifiers included (`abilities.charisma.modifier`, `combat.hp.total`). It leaves out what a template can't read: wildcards, a skill family's paths and a spell's field lists (`readsMany`: several values, or a list), and an item's own weapon paths (`weapon.*`), which read the item a template doesn't have.

A template is checked when it's saved, as the sheet will evaluate it (`findTemplateError`, `shared/customization/templateExpression.ts`): it parses, calls only `min`, `max`, `floor`, `ceil` and `abs`, reads only paths of that listing, and gives the value's type: a single path of the target's type, or a number computed from numbers. The seeds' templates, which no save checks, are held to the same check by a test (`tests/seeds/dnd3.5/targets.test.ts`).

A template never grants: it applies after the rounds that give what a grant names, so one on what a grant sets (`feats.<name>.possessed`, `spells.<spell>.<aptitude>.known`, `languages.<name>.known`) is refused when saved and skipped when stored, saying why (see [How a sheet is built](#how-a-sheet-is-built)). The modifier catalog marks those paths `literalOnly`, from the category's `grants` the refusal reads, so the editor's Template switch is off there, as on a pool's slots. A grant on a condition sets `true` and takes the condition as its requirement: Great Fortitude, requiring `languages.common.known`. A requirement on those paths takes a template as any requirement does. The seeds' modifiers are held to it by a test too (`tests/seeds/dnd3.5/targets.test.ts`).

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
- Weapon Finesse (handled via the feat's `FEAT_WEAPON_FINESSE` and the weapon's `WEAPON_FINESSABLE` fields, not a modifier)
- Rage (+4 STR/CON while raging — temporary)
- Smite Evil (+CHA to attack, +level to damage — per-use ability)

### Proficiency requirements on weapon feats:

A simple or martial weapon's proficiency is its group's or its own (an OR group); an exotic weapon's is its own, as for the weapon items above. `simple`, `martial` and `exotic` in `content/dnd3.5/builders/items/proficiencies.ts` build them, and `proficiencyRequirements(weapon)` picks the weapon's.

### Caster level prerequisites:

A feat's or a class's "Caster level Nth" prerequisite (the item creation feats: Craft Wand's 5th) checks the character's highest caster level, `spellcasting.casterlevel`, and an "Arcane caster level Nth" one its highest arcane caster level, `spellcasting.arcanecasterlevel`: a class's level and the bonus caster levels other classes add to it, never the highest spell level it casts (`spellcasting.arcane`, `.divine`). See [spellcasting](./target-paths.md#spellcasting).

### Caster level advancement:

Prestige classes that advance spellcasting use a "Bonus Caster Level" aptitude system. Each advancement feat adds +1 to `classes.<name>.bonuscasterlevel` via a stackable modifier, which the class's caster level counts. Classes define `casterLevelAdvancement` with a type (`divine`, `arcane`, `any`, or `dual`, both of a dual caster's) and which levels grant the advancement feat pick. See `database/seeders/dnd3.5/concerns/SeedsClasses.ts` for implementation. The class levels a bonus caster level reaches apply their spell slots each while its own requirements hold.

### A class's spell lists:

A class's spell lists are those its levels give slots in (`aptitudes.<list>.<spell level>.uses|allowed`), the levels a character hasn't taken included: a paladin's before his fourth level. A list a class gives slots in has spell levels even before it holds spells: a divine crusader's holds none, her domain's join it. A class can send its slots to one of several lists, each while that list's requirements hold: the pious templar picks the paladin's or the blackguard's at her first level, and the other list's slots stay gated out. Bonus spells from the casting ability and the caster type's highest spell level (`spellcasting.divine`) read each of a class's lists.

A list a feat brings, one a feat gives slots in or makes known and no class does (a cleric's domain, a specialist wizard's school, the cleric's domain slot), follows the class whose level gave the feat: its spell levels, its slots or its spells known, follow those that class casts, bonus caster levels included, it has no known paths, and its spells carry the feat's name as a tag, shown on that list and on the class's lists. Such a list has spell levels even when no spell is on it: the cleric's domain slot (`Domain Spells`), one a spell level from the first, is his Deity, Domains, and Domain Spells feature's, and his domains' spells fill it, however many domains he has; a domain gives its spells, known (`aptitudes.<list>.<level>.allowed` set to -1), never a slot. A specialist's school gives a slot at each spell level, its cantrips' included. A domain's spells also join the cleric's list, because its feat sets `aptitudes.<list>.joinsclasslist`: they're known there. A school's don't: a specialist learns them. The engine reads this data, never a list's name.

A domain can be a class's whole list: the divine crusader picks one at her first level, from a pool of a feat per domain of the core rules and Complete Divine (`spells.domainPool` in the class's reference, without the cleric's granted power), each setting the domain list's `joinsclasslist`; her slots, her Charisma's bonus spells and her caster level are her own list's. A class level can join a list too, by its modifiers or a class feature's: the feature's list joins its class's from the level that grants it.

### Seeded classes (for class-level requirements):

All 11 core classes: fighter, barbarian, cleric, rogue, sorcerer, monk, wizard, druid, ranger, paladin, bard.

Ruleset customization endpoints require the source entity to belong to the composed ruleset. IDs outside that scope (including character IDs) are rejected before writes; inherited sources are copied before customization.

Modifiers belong directly to ruleset entities, classes and class levels included. A modifier can have requirements, but cannot have other modifiers. Editing an inherited modifier or its requirements copies its owning entity and preserves the modifier requirements. Missing owners and sources outside the ruleset source chain are rejected.

Modifier and requirement updates and deletes follow one pattern (an entity's
fields are written by its own save: see [Fields](#fields)). The
row must be shown on the entity in the composed ruleset: its own rows plus
visible contributions from sibling extensions. `CustomizationEdit.cowCustomization` then copies the
owning entity if it is inherited and resolves the row to its copy, so a sibling
contribution is written through the local copy, never the stored sibling. After a
COW copy, clients must use the returned `resolvedEntityId` and reload its customizations;
stale ancestor customization IDs are rejected. During the initial copy, mutations
use the exact copied IDs, including sibling fields, modifiers, and modifier
requirements, so equal values are never used to guess a copied row's identity.
Sibling copying follows the same source-chain order as display when selecting
duplicate contributions across extensions.
After copying, reads use the local customizations without merging the original
sibling rows back in. Editing or deleting a copied modifier or requirement, an aptitude
link, or a copy's fields therefore stays effective until the override is restored.

Modifiers and their requirements are copied in batches, without recursive modifier queries.

Customization writes hold a PostgreSQL row lock on their owning ruleset entity
until the transaction ends. Deletion and override restoration acquire that same
lock before removing child rows. Requirements on modifiers lock the modifier's
owner; class levels lock their class. After waiting, sources are checked again so a
deleted modifier or level cannot receive a new customization, and the modifier
or requirement being edited is re-read so one deleted meanwhile is reported as
missing (404) for both kinds, and so is a modifier a class's progression save
drops (`EditTarget.resolveCustomizations`). Ordinary reads
do not take these locks, and different owners can be edited independently.

First COW copies retain the fork/source advisory lock and hold a shared row lock
on the source while copying. An existing copy is locked before reuse. Modifier
deletion removes the selected modifiers and batches removal of their requirements
and activity records.
