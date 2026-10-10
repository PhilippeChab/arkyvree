# Rulesets

[← Help home](README.md)

## What is a Ruleset?

A **ruleset** is the complete set of rules for a game system. Every character belongs to exactly one ruleset and is bound by its rules.

A ruleset holds:

- **Abilities** — Strength, Dexterity, etc.
- **Races** — size, speed, racial modifiers.
- **Classes** with their level-by-level progression — BAB, saves, skill points, granted features.
- **Skills**, including subtypes like Knowledge subcategories.
- **Feats** with their prerequisites and effects.
- **Spells** or powers organized into spellcasting pools.
- **Items** — weapons, armor, shields, gear, magic items.
- **Aptitudes** — pools of choosable options at certain class levels (Fighter Bonus Feats, Cleric Domains).
- **Mechanics** — free-form rules the system doesn't model on the sheet (trip, grapple, bull rush).
- **Customization** — the layer that wires it all together (properties, requirements, modifiers).

The base **Core SRD 3.5** ruleset and its sourcebook extensions are read-only — they're maintained by us. To change anything in them, make your own copy. See [What is forking?](forking-and-syncing.md#what-is-forking)

## What is the Ruleset lifecycle?

A user-owned ruleset has three states: **Draft**, **Published**, **Archived**. The base **Core SRD 3.5** ruleset and its sourcebook extensions stay Published — they're maintained by us and have no lifecycle.

**Campaign access is independent of lifecycle state.** If you invite players into a campaign linked to one of your rulesets, those players get character-creation access to the ruleset — even if it's a private Draft. The campaign membership is the access grant.

### Draft

The starting state of a fork. Your rulesets all start as a fork of a base ruleset.

- Add, edit, and delete any entity. An entity that's already been picked by a character on this ruleset, or on a fork that subscribes to it as an extension, can't be deleted — the platform blocks it.
- Within a kind, a name belongs to one entity: a new feat, spell, list, item… or one you rename can't take a name the ruleset already shows, whether its own or one from its base ruleset or extensions. A name you renamed an entity away from, or one you deleted from your fork, is free again.
- Subscribe to and unsubscribe from extensions. The same in-use rule applies: you can't unsubscribe from an extension while a character on the ruleset has picked content only it has. A core feat or spell it changes doesn't count: the character keeps the core version.
- Not visible in public listings. Only you, invited contributors and the players of a campaign on it find it.
- You can build characters on it while iterating.

### Published

When it's ready to share, choose **Publish** in the ruleset's **⋮** menu and confirm with **Publish Ruleset**. Owner only.

- Other users can find it and build characters on it (subject to its public/private setting). Published as an extension, it can be subscribed to from their own forks. Only base rulesets can be forked, so nobody can fork it.
- Editing rules don't change. You can still add, edit, and delete entities, and subscribe to or unsubscribe from extensions — gated by the same in-use check as Draft.
- The new responsibility is social: deletions now affect other people's characters, and the forks that subscribe to it as an extension. The in-use check counts their characters too, so you can't silently break them.
- Publishing is one-way. There's no Published → Draft transition; archive then unarchive if you need to.

### Archived

Choose **Archive** in the ruleset's **⋮** menu to retire it. Allowed any time, from Draft or Published, to its owner and its Admin contributors.

- Fully read-only. No edits, subscriptions, or entity changes.
- Its **Contributors** stay listed: the owner or an Admin can still remove one, and a contributor can still leave. Invites and role changes wait until it's unarchived.
- Existing characters and campaigns linked to it keep working — the entity data stays live, so they keep resolving and can still be played and leveled up.
- Choose **Unarchive** in its **⋮** menu to return it to Draft: it waits under the Archived filter of your rulesets. Owner only.

### Transitions

- Fork → **Draft**.
- **Draft → Published** (Publish, owner only).
- **Draft → Archived** or **Published → Archived** (Archive).
- **Archived → Draft** (Unarchive, owner only).

There's no direct Published → Draft path. To take a published ruleset back to Draft, archive it then unarchive.

A ruleset can't be deleted: Archive it when you want to step away from it without losing it. Deleting an entity you added is permanent; deleting one your fork inherits can be undone from **Local Changes** (see [What is forking?](forking-and-syncing.md#what-is-forking)).

## What are Aptitudes?

An **aptitude** is a pool of choices that opens at certain class levels. The level-up wizard reaches into the right pool whenever it asks you to pick something.

Examples on the SRD ruleset:

- **Fighter Bonus Feat** — picks at Fighter levels 1, 2, 4, 6, 8, 10, …
- **Cleric Domain** — two picks at Cleric level 1, from the Player's Handbook's 22 domains and those of the extensions the ruleset subscribes to (Complete Divine's 20, Complete Warrior's 5).
- **Divine Crusader Domain** — one pick at Divine Crusader level 1 (Complete Divine): her spell list is that domain's spells.
- **Wizard Spells** — spells added to the spellbook at every level.
- **Sorcerer Spells** — the spontaneous spell list, picked as spells known.
- **General** — the standard "any feat" pool, available at character levels 1, 3, 6, 9, … Every character's general feats count toward the aptitude named General, so it keeps that name and can't be deleted.

An aptitude defines:

- **Which entities show up** at a given pick — only entities tagged for that aptitude.
- **How many picks are granted** at each class level.
- For spell pools, **which spell levels** are available at each character level.

Aptitudes are for choices the player actively makes. Automatic class features like Barbarian Rage or Trapfinding aren't aptitudes — they're class-granted feats applied without a pick.

## What are Mechanics?

**Mechanics** are free-form rule entries for things the system doesn't put on the character sheet — the procedural rules that come up during play but don't reduce to a flat number.

In Core SRD 3.5 the typical entries are: trip, disarm, grapple, bull rush, overrun, sunder, aid another, flanking — anything in the combat chapter that's a procedure rather than a stat.

Each entry stores a description. The Mechanics tab on a ruleset surfaces them so anyone playing on that ruleset can read them.

Use them to:

- Document how a rule works at your table.
- Override the default ruling when your group plays it differently.
- Note errata or clarifications.

Mechanics are documentation. They don't gate or modify anything; the system doesn't read them. For rules with effects on the sheet, use [modifiers](customization-system.md#what-are-modifiers) and [requirements](customization-system.md#what-are-requirements).
