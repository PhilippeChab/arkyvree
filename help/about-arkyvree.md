# About Arkyvree

[← Help home](README.md)

## What is Arkyvree?

Arkyvree is a character builder for tabletop RPGs.

The difference from other builders: the rules aren't locked in. You can take any of the base rulesets we publish, make a copy, and change anything in it — feats, classes, BAB progression, save tables, item lists — and characters built on your copy follow your rules. House rules, homebrew content, and balance tweaks live alongside the system instead of in a separate document.

Arkyvree is pronounced **archive-ry** — a play on _archive_, a place where rulesets are crafted, stored, and built upon.

## Which game systems are supported?

Three base rulesets, each its own game system: **Core SRD 3.5** (D&D 3.5), **Core PSD 1** (Pathfinder 1) and **Core SRD 5** (D&D 5th Edition, its 2024 rules). A ruleset and every character on it follow one game system: a Pathfinder character can't take a 3.5 feat.

Included content for Core SRD 3.5:

- **Base content** — the 11 base classes, all standard races, every SRD spell, the SRD feat list, weapons, armor, magic items.
- **Sourcebook extensions** — Complete Warrior, Complete Divine, Complete Scoundrel, Complete Arcane, Complete Adventurer and DMG content, and the SRD's epic feats (Epic). Each fork subscribes to the ones it wants.

Included content for Core PSD 1, from the Pathfinder Core Rulebook:

- **Base content** — the 11 base classes, the 5 NPC classes and the 10 prestige classes, the 7 core races, its spells, feats, weapons, armor, gear and magic items, cleric domains, and the familiars, animal companions and paladin mounts.
- Pathfinder's own rules: its 35 skills (Acrobatics, Perception, Stealth…), class skills' +3, combat maneuvers, and a human's, half-elf's or half-orc's +2 to the ability score of your choice, picked at 1st level.

Included content for Core SRD 5, from the System Reference Document 5.2.1:

- **Base content** — the 12 classes, each with its subclass, the 9 species and their lineages, the 4 backgrounds, the SRD's feats, its spells, weapons with their masteries, armor, gear, tools and magic items.
- 5th Edition's own rules: the Proficiency Bonus by your level, a saving throw for each ability, skills you're proficient in (and Expertise) rather than ranks, a background's Origin feat and ability score increases, a subclass at 3rd level, an Ability Score Improvement or another feat at 4th, spell slots combined across your classes, and the spells each class knows as its rules say (a Bard's picked at its levels, a Wizard's spellbook, a Cleric's whole list), of any level you have slots for.

Excluded:

- **Play past a ruleset's Last Level.** No character goes past it, whatever its classes: 20, unless the ruleset's Settings raise it (up to 40, in D&D 3.5 and Pathfinder). Spells stop at 9th level: D&D 3.5's epic spells are left out.
- **Pathfinder:** artifacts, cursed items, and weapon and armor special abilities; a favored class's bonus, which you add to your character yourself.
- **D&D 5th Edition:** monsters; the 20 an increase raises a score to at most, which you keep to yourself; attunement's limit of three items; changing your weapon masteries at a Long Rest.

The data is auto-generated from the books' open rules and hand-checked. Errors get fixed in content updates and propagate to every character built on the ruleset — report them with the in-app **Feedback** button.

## Can another program read my characters?

Yes, through Arkyvree's public API, with an API key. Make one under **Settings → API Keys**, named for what will use it (a script, an assistant leveling your fighter), and choose when it expires: in 30 days, 90 days or a year, or never. Turn on **Read Only** for a program that only needs to read: its key reads what you can and changes nothing. Its key is shown once: copy it then, and give it to the program, which sends it with each request.

A key acts as you: it reads and changes your characters and the rulesets you can edit, as the app does (a character's sheet, its inventory, its levels as the Add Level wizard plans and saves them; a ruleset's content and its customizations), and reads the rulesets you can read. It runs your campaigns, their players, invites and characters; invites contributors to your characters and rulesets, and answers the invites you get; shares your characters, makes their PDFs, reads your notifications and activity, and sets your portraits and avatar. The API's reference, every route and what it answers, is its OpenAPI document, at `/v1/openapi.json` on Arkyvree's site. Revoke it on the same page once nothing uses it: it stops working at once. Changing or resetting your password, or deleting your account, revokes every key too.

## Can an AI assistant use Arkyvree?

Yes, through Arkyvree's MCP server: an assistant like Claude or ChatGPT reads your characters' sheets and rulesets and changes them as you can, with nothing to install.

In Claude or ChatGPT, add a custom connector with the address `https://rpg.arkyvree.com/mcp`. In Claude Code, run `claude mcp add --transport http arkyvree https://rpg.arkyvree.com/mcp`, then `/mcp` to sign in. Either sends you to Arkyvree, where you allow it, or turn on **Read Only** first so it reads and changes nothing. Your connected assistants are listed under **Settings → Connected Apps**, where you disconnect one; changing or resetting your password disconnects them all.

A script or an agent that runs on its own, with no browser to sign in with, sends an API key instead (`Authorization: Bearer <key>`).

Then ask it what you'd ask the app: "what's my character's armor class?", "add a level and take this feat". Arkyvree marks the tool that archives or deletes apart from the others, so your assistant can ask you before it uses it.

## Who can sign up?

Each Arkyvree has admins: the first account on it to verify its email (or to sign in with Google) becomes its first admin. An admin opens **Admin** in the sidebar and chooses who can make an account:

- **Open:** anyone who reaches its address.
- **Invite Only:** someone invited to a campaign, a ruleset or a character, with the address the invite went to. Anyone on it can send that invite.
- **Closed:** nobody. An invite then goes only to someone who already has an account.

An admin can also make an **invite link** on the same page, which lasts a day, a week or a month. Anyone who opens it can make an account, even while sign-ups are Invite Only, until it expires or the admin revokes it: paste it in your group's chat. The link is shown once, as it's made. Invite links don't work while sign-ups are Closed, and a link stops working when the admin who made it is no longer one. Each account that came in through a link says so in the accounts list.

The same page lists the accounts. An admin makes another account an admin, or no longer one (there's always one left), and marks an account's email verified when its code never arrived. They can also deactivate an account: it's signed out everywhere, its API keys and connected apps stop working, and it can't sign in until an admin reactivates it. Its characters, rulesets and campaigns stay as they are.
