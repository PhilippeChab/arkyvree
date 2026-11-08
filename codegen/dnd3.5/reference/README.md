# Reference JSON Schema

A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else. Loading it (`References`, `tools/references/References.ts`, with the detectors in `tools/detect/`) derives what the generator reads: `detected`, parsed from `raw` (wizard schools have none), and `mapping`, each entity as the seeds make it, its overrides applied (they win over both). The seeds read the mapping, never the overrides. So a correction takes effect at the next `parser:dnd3.5:generate`, and re-scraping (which replaces `raw`) keeps it.

A class reference is `ClassReference`, in `codegen/dnd3.5/tools/types/classes.ts`; as stored, it's `StoredReference<"class">` (`codegen/dnd3.5/tools/types/reference.ts`): its `_meta`, `raw` and `overrides`.

What loading it derives is `ClassReference`'s `detected` and `mapping`, in the same file.

A race reference stores each race's page as read (`raw`: its name, size, speed, ability adjustments, description and traits, a trait the page leaves outside a paragraph too) and its overrides (`description`, `name`, `size`, `baseSpeed`, `modifiers`, `fields`, `languages`, `skip`). Loading it detects each race's `modifiers` and its `languages`, those it speaks from the start, read from its traits' text ("Automatic Languages: …", its bonus languages left out), or, when its traits name none, `unresolvedLanguages[]` (`parser:dnd3.5:validate` reports it until it's reviewed): the human's and the halfling's pages have no traits, so their `overrides.languages` give the SRD's. Its `mapping.languages` is the override's, else the detected; the seeds write each as the grant of the language (`languages.<name>.known` set true), after the race's other modifiers.

Next to `detected` and `mapping`, the loaded reference keeps `_meta` as stored; `raw` as stored, except that a class's `overrides.alignment` fills its prerequisites' alignment when they have none; and `overrides`, their text cleaned up (sanitized) except a spell's or a wizard school's.

## How the generator reads it

The generator reads a class's `mapping` (`ClassMapping` builds it), and what no override changes (its hit die, levels, feature occurrences…) in `detected`:

1. Its features, spells and `classFeatureAptitude`, derived from `detected`
2. Each field an override sets (bab, saves, requirements, aptitudePicks, bonusFeatLists, casterType, bonusSpellAbility, classSkills, description, freeFeats, languages, proficiencies, modifiers, columns, skip): the override's, else the detected or scraped value. `aptitudePicks` keeps the detected picks an override's for the same aptitude doesn't replace, and `spells`' fields go over the detected spells: a class with none detected ignores them (`parser:dnd3.5:validate` reports it)
3. For features specifically: `overrides.features[name]` fields are merged on top of the detected feature (set a field to `null` to delete it)

`bun run parser:dnd3.5:validate` reports a class override that changes nothing, so remove it: it holds what's derived without it, and the class's generated files come out the same without it. An override that differs from what's derived stays, even when nothing uses it today.
