# Forking & Syncing

[← Help home](README.md)

## What is forking?

**Forking** makes your own editable copy of a published ruleset.

A fork starts empty — it shares all entities with the parent. When you edit a feat, item, or class, that one entity is copied into your fork at the moment of the edit. Everything you haven't touched stays shared.

In a fork you can:

- Add new entities — homebrew feats, custom races, new magic items.
- Edit anything inherited from the parent.
- Delete entities — for inherited content this hides it from your fork; for your own additions it's a permanent removal. Either way, deletion is blocked if a character has the entity picked.
- Install [extensions](#what-are-extensions) on your fork independently of the parent.
- Build characters on it.

Only base rulesets can be forked — you can't fork someone else's fork. To use someone's published homebrew, install it as a community extension on your own fork instead. See [What are Extensions?](#what-are-extensions)

When the parent ruleset is updated, your fork picks up the changes for any entities you haven't edited. See [How do forks stay up to date?](#how-do-forks-stay-up-to-date)

## How do forks stay up to date?

Your fork picks up parent changes automatically — for any entity you haven't edited yourself. If the parent author publishes a new feat, your fork shows it. If they fix a typo on an existing feat, your fork shows the fix. If they remove a feat, it disappears from your fork — unless one of your characters has it picked, in which case the entity stays put.

Once you edit an entity in your fork, that entity becomes yours. Parent changes to *that specific entity* stop reaching you — your version takes over. Other entities you haven't touched keep updating from the parent as before.

This per-entity behavior protects your customizations. If you've rebalanced Power Attack to fit your campaign, the parent's next update won't silently overwrite your changes.

To re-pull the parent's update onto an entity you've already edited, delete your local copy (the inherited version returns, but your changes are lost) or manually re-apply the parent's change.

## What are Extensions?

**Extensions** are content packages you can install on a fork to add a book's worth of feats, classes, spells, and items — without forking again.

**Official extensions** for Core SRD 3.5:

- **Complete Warrior** — fighter-style classes, combat feats, exotic weapons.
- **Complete Adventurer** — skill-focused classes and feats.
- **Complete Arcane** — arcane classes, metamagic, spells.
- **Complete Divine** — divine classes, domain spells, divine feats.
- **Complete Scoundrel** — skill tricks, rogue-style content.
- **DMG** — additional magic items, prestige classes, optional rules.

**Community extensions.** Any published, public fork that has no extensions of its own is automatically eligible to be installed as an extension by anyone forking the same base. There's no separate publish step — they show up in the same Browse list alongside the official ones, just publish your fork as public.

To install: from your fork, **Extensions → Browse → Install**. The new content appears in your fork immediately.

To uninstall: **Extensions → Uninstall**. Uninstall is blocked once any of your characters has picked content from the extension — switch those characters off the affected entities first.

If a community extension's author archives it, existing installations keep working — only new installs are blocked until the author unarchives.
