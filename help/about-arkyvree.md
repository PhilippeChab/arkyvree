# About Arkyvree

[← Help home](README.md)

## What is Arkyvree?

Arkyvree is a character builder for tabletop RPGs.

The difference from other builders: the rules aren't locked in. You can take any of the base rulesets we publish, make a copy, and change anything in it — feats, classes, BAB progression, save tables, item lists — and characters built on your copy follow your rules. House rules, homebrew content, and balance tweaks live alongside the system instead of in a separate document.

Arkyvree is pronounced **archive-ry** — a play on *archive*, a place where rulesets are crafted, stored, and built upon.

## Which game systems are supported?

**Core SRD 3.5** is the only base ruleset right now. More systems are on the roadmap.

Included content for Core SRD 3.5:

- **Base content** — the 11 base classes, all standard races, every SRD spell, the SRD feat list, weapons, armor, magic items.
- **Sourcebook extensions** — Complete Warrior, Complete Divine, Complete Scoundrel, Complete Arcane, Complete Adventurer and DMG content. Each fork subscribes to the ones it wants.

Excluded:

- **Epic-level play.** No character goes past level 20, whatever its classes, and spells stop at 9th level.

The 3.5 data is auto-generated from SRD pages and hand-checked. Errors get fixed in content updates and propagate to every character built on the ruleset — report them with the in-app **Feedback** button.

## Can another program read my characters?

Yes, through Arkyvree's public API, with an API key. Make one under **Settings → API Keys**, named for what will use it (a script, an assistant leveling your fighter), and choose when it expires: in 30 days, 90 days or a year, or never. Its key is shown once: copy it then, and give it to the program, which sends it with each request.

A key acts as you: it reads your characters and the rulesets you can read, and a character's choices at its next level (the classes it can take, and the feats and spells it qualifies for). It runs your campaigns, their players, invites and characters; invites contributors to your characters and rulesets, and answers the invites you get; shares a character; reads your notifications and activity; changes your avatar or a character's portrait; and makes a character's PDF, which it asks for until it's ready, then downloads. The API's reference, every route and what it answers, is its OpenAPI document, at `/v1/openapi.json` on Arkyvree's site. Revoke it on the same page once nothing uses it: it stops working at once. Changing or resetting your password, or deleting your account, revokes every key too.
