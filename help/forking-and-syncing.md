# Forking & Syncing

[← Help home](README.md)

## What is forking?

**Forking** makes your own editable copy of a base ruleset.

A fork starts empty — it shares all entities with the parent. When you edit a feat, item, or class, that one entity is copied into your fork at the moment of the edit. Everything you haven't touched stays shared.

In a fork you can:

- Add new entities — homebrew feats, custom races, new magic items.
- Edit anything inherited from the parent.
- Delete entities — an inherited one (edited or not) is removed from your fork until you restore it (its menu says **Delete**): in the ruleset's **⋮** menu, **Local Changes**, then **Restore Parent Version** on it. Your own additions are removed for good (**Delete Permanently**). Either way, deletion is blocked if a character has the entity picked.
- Subscribe your fork to [extensions](#what-are-extensions) independently of the parent.
- Build characters on it.

Only base rulesets can be forked — you can't fork someone else's fork. To use someone's homebrew, subscribe your own fork to it, once they've published it as an extension. See [What are Extensions?](#what-are-extensions)

When the parent ruleset is updated, your fork picks up the changes for any entities you haven't edited. See [How do forks stay up to date?](#how-do-forks-stay-up-to-date)

## How do forks stay up to date?

Your fork picks up parent changes automatically — for any entity you haven't edited yourself. If the parent author publishes a new feat, your fork shows it. If they fix a typo on an existing feat, your fork shows the fix. If they remove a feat, it disappears from your fork — unless one of your characters has it picked, in which case the entity stays put.

Once you edit an entity in your fork, that entity becomes yours. Parent changes to *that specific entity* stop reaching you — your version takes over. Other entities you haven't touched keep updating from the parent as before.

This per-entity behavior protects your customizations. If you've rebalanced Power Attack to fit your campaign, the parent's next update won't silently overwrite your changes.

To re-pull the parent's update onto an entity you've already edited, restore it: in the ruleset's **⋮** menu, **Local Changes**, then **Restore Parent Version** on it. The inherited version returns, but your changes are lost. What used your version uses the inherited one instead: your own feats in its list, a class granting it, the characters who picked it. A class can't be restored while a character took a level your version added that the parent's doesn't have. Or re-apply the parent's change by hand.

## What are Extensions?

**Extensions** are content packages a fork can subscribe to, adding a book's worth of feats, classes, spells, and items — without forking again.

**Official extensions** for Core SRD 3.5:

- **Complete Warrior** — fighter-style classes, combat feats, five cleric domains.
- **Complete Adventurer** — skill-focused classes and feats.
- **Complete Arcane** — arcane classes, metamagic, spells.
- **Complete Divine** — divine classes, twenty cleric domains, divine feats.
- **Complete Scoundrel** — luck feats, rogue-style classes and feats.
- **DMG** — prestige classes.

**Community extensions.** When you publish a fork that subscribes to no extensions, the **Publish Ruleset** dialog asks what to **Publish as**: a **Ruleset** (playable directly) or an **Extension**. A public fork published as an extension, with no extensions of its own, can be subscribed to from any fork of the same base. It's listed alongside the official ones.

To subscribe: in your fork's **⋮** menu, choose **Subscribe**, pick one or more extensions under **Select Extensions**, and click **Subscribe**. The new content appears in your fork immediately.

To unsubscribe: click **Extensions** in your fork's header, then the × on the extension, and confirm with **Unsubscribe from Extension**. Your edits to that extension's content are deleted with it. Unsubscribing is blocked once any character on your fork has picked content from the extension — switch those characters off the affected entities first. Your spells and feats keep their lists: one on a list the extension gave you moves to the list of the same name another of your books has (each book has its own copy of a list like Assassin Spells). If no other book has that list, or your content uses another of the extension's entities (a class granting its feat, a class taking its skill, an item made from its item…), unsubscribing is blocked and the message names them: remove those first.

If a community extension's author archives it, existing subscriptions keep working. New subscriptions are blocked until the author unarchives it and publishes it again.
