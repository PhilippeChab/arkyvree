# Forking & Syncing

[← Help home](README.md)

## What is forking?

**Forking** makes your own editable copy of a base ruleset.

A fork starts empty — it shares all entities with the parent. When you edit a feat, item, or class, that one entity is copied into your fork at the moment of the edit. Everything you haven't touched stays shared.

In a fork you can:

- Add new entities — homebrew feats, custom races, new magic items.
- Edit anything inherited from the parent.
- Delete entities — for inherited content this hides it from your fork; for your own additions it's a permanent removal. Either way, deletion is blocked if a character has the entity picked.
- Subscribe your fork to [extensions](#what-are-extensions) independently of the parent.
- Build characters on it.

Only base rulesets can be forked — you can't fork someone else's fork. To use someone's homebrew, subscribe your own fork to it, once they've published it as an extension. See [What are Extensions?](#what-are-extensions)

When the parent ruleset is updated, your fork picks up the changes for any entities you haven't edited. See [How do forks stay up to date?](#how-do-forks-stay-up-to-date)

## How do forks stay up to date?

Your fork picks up parent changes automatically — for any entity you haven't edited yourself. If the parent author publishes a new feat, your fork shows it. If they fix a typo on an existing feat, your fork shows the fix. If they remove a feat, it disappears from your fork — unless one of your characters has it picked, in which case the entity stays put.

Once you edit an entity in your fork, that entity becomes yours. Parent changes to _that specific entity_ stop reaching you — your version takes over. Other entities you haven't touched keep updating from the parent as before.

This per-entity behavior protects your customizations. If you've rebalanced Power Attack to fit your campaign, the parent's next update won't silently overwrite your changes.

To re-pull the parent's update onto an entity you've already edited, delete your local copy (the inherited version returns, but your changes are lost) or manually re-apply the parent's change.

## What are Extensions?

**Extensions** are content packages a fork can subscribe to, adding a book's worth of feats, classes, spells, and items — without forking again.

**Official extensions** for Core SRD 3.5:

- **Complete Warrior** — fighter-style classes, combat feats, exotic weapons, five cleric domains.
- **Complete Adventurer** — skill-focused classes and feats.
- **Complete Arcane** — arcane classes, metamagic, spells.
- **Complete Divine** — divine classes, twenty cleric domains, divine feats.
- **Complete Scoundrel** — skill tricks, rogue-style content.
- **DMG** — additional magic items, prestige classes, optional rules.

**Community extensions.** When you publish a fork, the publish dialog asks whether it's a **Ruleset** (playable directly) or an **Extension**. A public fork published as an extension, with no extensions of its own, can be subscribed to from any fork of the same base. It's listed alongside the official ones.

To subscribe: from your fork, **More → Subscribe**, pick one or more extensions, and click **Subscribe**. The new content appears in your fork immediately.

To unsubscribe: click the extensions chip in your fork's header and remove the extension. Your edits to that extension's content are deleted with it. Unsubscribing is blocked once any character on your fork has picked content from the extension — switch those characters off the affected entities first.

If a community extension's author archives it, existing subscriptions keep working. New subscriptions are blocked until the author unarchives it and publishes it again.
