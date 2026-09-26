# Characters & Campaigns

[← Help home](README.md)

## How does character creation work?

Character creation is a guided flow. Pick a ruleset, fill in the basics, and the level-up wizard handles your first level — the same flow used for every level after.

Steps:

1. **Pick a ruleset.Core SRD 3.5** is available to everyone; any forks you own or have access to via campaigns are also listed.
2. **Identity.** Name, gender, age, height, weight, alignment, deity, description.
3. **Race.** Picking a race seeds size, base speed, and racial modifiers automatically.
4. **Ability scores.** Roll, point-buy, or enter manually. What you enter is the *base* score — racial modifiers stack on top.
5. **First level.** The [level-up wizard](#what-is-the-level-up-wizard) takes over: pick a class, roll HP, allocate skill points within the rank cap, pick feats from the available pools, pick spells if your class has them, review and confirm.

The engine refuses illegal choices at every step: prestige classes you don't qualify for are greyed out, skill ranks above the level-1 cap are blocked, feats whose prerequisites you don't meet won't appear.

A character can't be switched to a different ruleset later — build a new character on the new ruleset.

There's no "permanent delete" — *delete* archives a character (read-only, hidden from lists).

## What are Campaigns?

A **campaign** is a shared space tied to one ruleset. The person who creates it is the **GM**; players join by invite and link characters.

A campaign holds:

- **Players** — anyone the GM has invited and who has accepted.
- **Characters** — linked by their owner from their own character list, with a per-character [visibility setting](#what-is-character-visibility).
- **Pending invites** (visible to the GM).

A campaign is tied to one ruleset. Every linked character must be built on that exact ruleset, not a fork or parent.

If you have house rules, fork the SRD ruleset, **publish** the fork, then point the campaign at the published fork. Players invited to the campaign can build characters on it. An unpublished fork (Draft) is private to you, so a campaign on a Draft fork prevents players from creating characters.

Roles:

- **GM** — creates the campaign, invites and removes players, sees every linked character's full sheet regardless of visibility, edits the description.
- **Players** — see other characters according to each character's visibility; edit their own characters; can leave at any time.

Campaigns are a character / ruleset organization layer. They aren't a virtual tabletop — no initiative tracker, dice roller, combat state, maps, or in-app chat.

## What is character visibility?

When you link a character to a campaign, you choose how much other players can see. The setting is per-campaign — the same character can be Private in one campaign and Public in another. Change it any time from the campaign roster.

| Visibility | What other players see |
|---|---|
| **Private** | Nothing — the character appears in the roster as yours but the sheet isn't viewable. |
| **Partial** | Physical traits only — race, class, level, name, public notes. Stats, feats, spells, equipment hidden. |
| **Public** | The full sheet. |

The GM always sees the full sheet of every linked character, including private notes. Visibility controls player-to-player privacy only.

Each character has two notes fields: **public notes** (visible to everyone whose visibility level reveals the sheet) and **private notes** (visible only to the player and the GM).

Independent of campaign visibility, every character has a per-character public share link from **More → Share** that displays the full sheet in a browser, no account required. Revoke any time from the same menu.

## What is the Level-Up Wizard?

The **level-up wizard** is the step-by-step modal that handles every choice for a new level. It runs at level 1 and at every level after. Each step validates against the ruleset.

Steps on Core SRD 3.5:

1. **Class plan.** Pick the class for this level. Multiclassing is supported. Classes whose prerequisites you don't meet are listed but disabled.
2. **HP.** Roll the class's hit die or take the average. Constitution modifier applies automatically per level.
3. **Ability score increase.** Only on levels 4, 8, 12, 16, 20.
4. **Skills.** Skill points come from the class formula. Class skills are highlighted; the rank cap is enforced (level + 3 for class skills, half for cross-class).
5. **Feats.** Standard feats at levels 1, 3, 6, 9, 12, 15, 18. Class bonus feats appear at the levels their class grants them. Each slot is tied to its [aptitude pool](rulesets.md#what-are-aptitudes) — only feats tagged for that pool are offered.
6. **Spells / powers.** For prepared casters (Cleric, Druid, Wizard) you pick which spells go into your spellbook / domain. For spontaneous casters (Sorcerer, Bard) you pick spells known.
7. **Review.** Final summary of every change. Nothing commits until you click **Confirm**.

A feat you expected isn't offered — three reasons, in this order:

1. **Prerequisite not met.** Hover the greyed-out feat — the tooltip explains what's missing.
2. **Wrong aptitude.** A General feat won't appear in a Fighter Bonus Feat slot.
3. **Not in your ruleset.** Some feats only exist in extensions like Complete Warrior. Install the extension on your fork.

For mid-campaign characters joining at higher levels, **Add multiple levels** plans the full path up front and commits in one go.

The engine validates the *base, permanent character sheet*. Temporary buffs, conditional bonuses (Dodge's `+1`, Mobility's `+4` vs AoO) and activated abilities (Power Attack, Combat Expertise, Smite Evil, Rage) aren't auto-applied. Apply them at the table.

## Can I export my character?

Yes. Every character can be exported as a printable PDF.

From the character page: **More → Export PDF.** Generation runs server-side and is queued — usually a few seconds. You'll get a notification when it's ready, with a download link.

The PDF is **edition-aware**: a Core SRD 3.5 character produces a 3.5-flavored sheet — spells organized by level and school, save bonuses split into Fortitude / Reflex / Will, skill columns matching the 3.5 layout. Characters built on a different ruleset produce sheets matching that ruleset's structure.

The PDF is a snapshot at the moment of export. It doesn't update when you level up — re-export to get the latest.

Separately, every character has a public share URL from **More → Share** that displays the full sheet in a browser, no account required.
