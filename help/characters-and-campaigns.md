# Characters & Campaigns

[← Help home](README.md)

## How does character creation work?

Character creation is one dialog, **Create New Character**, then the level-up wizard for your first level — the same wizard used for every level after.

The dialog has four sections:

1. **Basic Information.** Name, experience points, ruleset, race, alignment and gender. The ruleset list holds **Core SRD 3.5** and the other published public rulesets, your own and those you contribute to (drafts too), and your campaigns' rulesets. The races are the ruleset's: pick it first. A race that doesn't allow the alignment or gender you picked is greyed out. Picking a race seeds size, base speed, and racial modifiers automatically.
2. **Ability Scores.** Pick a **Method**: 4d6 Drop Lowest, 3d6 Straight, Standard Array or Point Buy. **Roll All** rolls the dice methods; each score has its own + and − buttons. What you enter is the *base* score — racial modifiers stack on top.
3. **Physical Details.** Age, height, weight.
4. **Optional Details.** Deity, description, notes, [private notes](#what-is-character-visibility).

Click **Create**: the character's page opens on the [level-up wizard](#what-is-the-level-up-wizard) for level 1. Pick a class, set HP, allocate skill points within the rank cap, pick feats from the available pools, pick spells if your class has them, review and confirm.

The engine refuses illegal choices at every step: prestige classes you don't qualify for are greyed out, skill ranks above the level-1 cap are blocked, feats whose prerequisites you don't meet are greyed out, with a tooltip saying what's missing.

A character can't be switched to a different ruleset later — build a new character on the new ruleset.

**Archive** makes a character read-only and hides it from your lists; **Unarchive** it from its menu: it waits under the Archived filter of your characters. An archived character can also be removed for good with **Delete Permanently**, once it's no longer linked to an active campaign.

## What are Campaigns?

A **campaign** is a shared space tied to one ruleset. Whoever creates it is its first **Game Master**. A Game Master adds players from the campaign's **Players** tab with **Add Player**: an empty slot, or an invite sent to an email address, as a **Player Character** or a **Game Master**.

A campaign holds:

- **Players** — its slots: an active player, an unassigned slot, or an invite waiting for an answer (**Invite Pending**, which a Game Master can revoke with **Revoke Invite**).
- **Characters** — linked by their owner from the campaign's **Characters** tab (**Link Character**), each with its own [visibility setting](#what-is-character-visibility). A character can be in one campaign at a time.

A campaign is tied to one ruleset. Every linked character must be built on that exact ruleset, not a fork or parent.

If you have house rules, fork the SRD ruleset and point the campaign at your fork. Players invited to the campaign can build characters on it, even while it's a private Draft: joining the campaign gives them that access.

Roles:

- **Game Master** — every player with that role: adds, invites and removes players, sees every linked character's full sheet regardless of visibility and can download its PDF, edits the campaign's name and description (**Edit**, in the campaign's **⋮** menu), and archives it. A campaign keeps at least one Game Master: the last one can't be removed or made a Player Character.
- **Player Character** — sees other characters according to each character's visibility; edits their own characters; can **Leave** at any time.

Campaigns are a character / ruleset organization layer. They aren't a virtual tabletop — no initiative tracker, dice roller, combat state, maps, or in-app chat.

## What is character visibility?

When you link a character to a campaign, you choose how much other players can see. Change it any time from the Visibility select on its card, in the campaign's Characters tab.

| Visibility | What other players see |
|---|---|
| **Private** | Nothing — the character doesn't appear in their roster. |
| **Partial** | Physical traits only — name, race, age, gender, height and weight. Everything else is hidden: classes and level, alignment, deity, languages, description, notes, stats, feats, spells, equipment. |
| **Public** | The full sheet. |

A Game Master always sees the full sheet of every linked character, including its private notes. Visibility controls player-to-player privacy only.

Each character has two notes fields, under its description:

- **Notes** — seen by anyone who sees the full sheet: the Game Masters, the other players when the character is Public, and anyone with its share link.
- **Private Notes** — seen only by the character's owner, its contributors (invited from the character page's **⋮** menu → **Contributors**), and the Game Masters of its campaign. The owner and contributors write them on the character's page; a Game Master reads them on the campaign's character page, and edits them only as a contributor. Other players never see them, whatever the visibility, and a share link leaves them out.

Independent of campaign visibility, a character's owner can share it with a public link: **⋮** → **Share**, then **Generate Link**. Anyone with the link sees the full sheet in a browser, without its private notes, and can download its PDF, no account required. **Revoke Link**, in the same dialog, turns it off.

## What is the Level-Up Wizard?

The **level-up wizard** is the step-by-step dialog that handles every choice for a new level. It runs at level 1 and at every level after. Each step validates against the ruleset.

Steps on Core SRD 3.5:

1. **Class Plan.** Pick the class for this level. Multiclassing is supported. Classes whose prerequisites you don't meet are listed but disabled. A plan stops at character level 20, whatever its classes.
2. **Select HP.** Roll the class's hit die, take the maximum (**Max**), or type the HP gain (the step shows the average); **Roll All** and **Max All** set every level at once. Constitution modifier applies automatically per level.
3. **Ability Increase.** A pick at character levels 4, 8, 12, 16 and 20, which **Next** waits for; at other levels the step says there's none.
4. **Select Skills.** Skill points come from the class formula. The **Class** column says which skills are class skills; the rank cap is enforced (level + 3 for class skills, half for cross-class). **Auto** spends the points at random.
5. **Select Feats.** Standard feats at levels 1, 3, 6, 9, 12, 15, 18. Class bonus feats appear at the levels their class grants them. Each slot is tied to its [aptitude pool](rulesets.md#what-are-aptitudes) — only feats tagged for that pool are offered. A Cleric's domains are picked here too, from the Cleric Domain pool. A feat that stacks, such as Toughness, can fill several slots, two at the same level too; one that doesn't is picked once, and isn't offered when another of your levels has it, a later one or a planned one too.
6. **Select Spells.** A Wizard adds spells to the spellbook; a Sorcerer or a Bard picks spells known, pool by pool and spell level by spell level. A Cleric or a Druid knows the whole class list and picks none, the spells another of the character's classes knows included: a Cleric/Wizard's Cleric Spells have the cleric spells of his spellbook too. A class's list knows a spell once: the step leaves out the spells it knows already, at any of your levels, a later one or a planned one too, which another class's list can still take, and the sheet and the PDF list a spell two classes know under each, at each class's DC. The sheet and the PDF list a cleric's domain slot, one a spell level, under **Domain Spells**, with his domains' spells to fill it, and a specialist wizard's extra slot of her school, one a spell level from the 0th, with her school's spells from her spellbook.
7. **Review Changes.** Final summary of every change. Nothing is saved until you click **Finish All**.

A feat you expected isn't offered — three reasons, in this order:

1. **Prerequisite not met.** Hover the greyed-out feat — the tooltip explains what's missing.
2. **Wrong aptitude.** A General feat won't appear in a Fighter Bonus Feat slot.
3. **Not in your ruleset.** Some feats only exist in extensions like Complete Warrior. Subscribe your fork to the extension.

For mid-campaign characters joining at higher levels, add several levels to the class plan (**Add Level**, or a class's quick-add button): the wizard plans the full path up front and saves it in one go.

The engine validates the *base, permanent character sheet*. Temporary buffs, conditional bonuses (Dodge's `+1`, Mobility's `+4` vs AoO) and activated abilities (Power Attack, Combat Expertise, Smite Evil, Rage) aren't auto-applied. Apply them at the table.

Each weapon on the sheet lists a row per way to attack with it: its own attack, a thrown one for a melee weapon you can throw (a dagger, a spear), and, when a weapon set holds a weapon in each hand, the same with two-weapon fighting's penalties. The Two-Weapon Fighting feats and a light off-hand weapon lessen them, and Improved and Greater Two-Weapon Fighting add off-hand attacks. Range-increment penalties depend on the distance, so they aren't on the sheet.

## Can I export my character?

Yes. Every character can be exported as a printable PDF.

From the character page: **⋮** → **Download PDF**. Generation runs server-side and is queued — usually a few seconds. You'll get a notification when it's ready, with a download link.

The PDF is **edition-aware**: a Core SRD 3.5 character produces a 3.5-flavored sheet — spells organized by level and school, save bonuses split into Fortitude / Reflex / Will, skill columns matching the 3.5 layout. Characters built on a different ruleset produce sheets matching that ruleset's structure.

In a campaign, a Game Master can also download the PDF of any linked character, whatever its visibility: **⋮** → **Download PDF** on the character's campaign page.

The PDF is a snapshot at the moment of export. It doesn't update when you level up — re-export to get the latest.

Separately, a character's owner can share a public link to it from **⋮** → **Share**: it displays the full sheet in a browser, no account required. See [What is character visibility?](#what-is-character-visibility)
