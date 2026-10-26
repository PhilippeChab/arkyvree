/**
 * A ruleset's nouns are its own (docs/rulesets.md, #59's contract):
 *
 * - `ruleset-nouns`: no file outside a ruleset's folders (`dnd3.5/`: its module, content, vocabulary, seeders, codegen
 *   and docs) names one of 3.5's nouns: a class (`klass`), a power, a spell, a feat, an aptitude, a skill, an ability,
 *   a race, an alignment, a language, a bonded creature, hit points, a saving throw… The engine's core, its entry, the
 *   server, the shared code, the client and the scripts speak of entities, kinds, fields, links, tracks, steps and
 *   pools, which a module names. Every identifier, string, regular expression, JSX text and file path is read word by
 *   word (`klassLevelId` is `klass`, `level`, `id`; `"klass_levels"` is `klass`, `levels`), and a whole string that is a
 *   kind's stored name and an English word alone (`"items"`, `"mechanics"`), which the core reads from what a module
 *   declares. A comment may name them, as an example of what a module declares.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { isInRepo, repoPath, rootOf, rulesetsOf } from "./paths.mjs";

/** The operators that compare a value with another: a stored name compared is a kind. */
const COMPARISONS = new Set(["===", "!==", "==", "!="]);

/** The nouns 3.5 names its things by, each a word of a name (`klassLevelId`'s `klass`). */
const NOUNS = new Set([
  "abilities",
  "ability",
  "alignment",
  "alignments",
  "aptitude",
  "aptitudes",
  "armor",
  "armour",
  "bab",
  "bonded",
  "cantrip",
  "cantrips",
  "caster",
  "deities",
  "deity",
  "familiar",
  "familiars",
  "feat",
  "feats",
  "hd",
  "hitpoints",
  "hp",
  "klass",
  "klasses",
  "language",
  "languages",
  "multiclass",
  "pcg",
  "pcgen",
  "power",
  "powers",
  "race",
  "races",
  "racial",
  "skill",
  "skills",
  "spell",
  "spellbook",
  "spellbooks",
  "spellcaster",
  "spellcasters",
  "spellcasting",
  "spells",
  "weapon",
  "weapons",
  "xp",
]);

/**
 * The nouns 3.5 names by two words, whose first or second is English alone: a save's (`saveId`, `rulesetSaves`, not
 * `onSave`), hit points, a class level's string as the code stored it (`"classes"`, `"class_levels"`); and the program
 * its imports read, whose name its case splits (`PCGen` is `pc`, `gen`).
 */
const PHRASES = [
  ["base", "save"],
  ["class", "level"],
  ["class", "levels"],
  ["hit", "dice"],
  ["hit", "die"],
  ["hit", "points"],
  ["level", "save"],
  ["level", "saves"],
  ["pc", "gen"],
  ["ruleset", "save"],
  ["ruleset", "saves"],
  ["save", "bonus"],
  ["save", "effect"],
  ["save", "id"],
  ["save", "ids"],
  ["saves", "by"],
  ["saves", "track"],
  ["saving", "throw"],
  ["saving", "throws"],
];

/**
 * The names 3.5's kinds are stored and routed by that are English words alone (`"items"`, `"mechanics"`), as a whole
 * string where it can only be a kind (`isStoredName`): compared (`type === "items"`, `case "items":`), handed to a
 * call (`byId("items")`, `types.includes("items")`), a property's value or a list's element (`{ type: "items" }`),
 * a whole template (`` `items` ``), a record's key (`Record<"items", …>`) or a kind registry's (`ViewKinds["items"]`).
 * Never a name, a property's key, a computed member, an `in` test or another type's key (a page's `items`:
 * `page.items`, `{ "items": 1 }`, `page["items"]`, `"items" in page`, `Pick<Page, "items">`, `keyof Page`).
 */
const STORED_NAMES = new Set(["items", "mechanics"]);

/** The names 3.5's kinds are stored and routed by, as a whole string or name */
const WHOLE_NAMES = new Set(["classes", "saves"]);

function createRulesetNouns(context) {
  if (!isInRepo(context.filename)) return {};
  const file = repoPath(context.filename);
  if (isRulesets(file, rulesetsOf(rootOf(context.filename)))) return {};
  // A name read twice at one place (an import's imported and local name, a shorthand property) is reported once
  const reported = new Set();
  const report = (node, name) => {
    const noun = nounOf(name);
    if (!noun || reported.has(node.start)) return;
    reported.add(node.start);
    const flat = name.replace(/\s+/g, " ").trim();
    const named = flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
    context.report({
      node,
      message:
        `"${noun}" is 3.5's noun (\`${named}\`): outside a ruleset's folders, the code speaks of entities, kinds, ` +
        "fields, links, tracks, steps and pools, which a module names.",
    });
  };
  const reportStored = (node, name) => {
    if (reported.has(node.start)) return;
    reported.add(node.start);
    context.report({
      node,
      message:
        `"${name}" is 3.5's kind, as it's stored: outside a ruleset's folders, the code reads a kind from what a ` +
        "module declares (its storage, its view's kinds).",
    });
  };
  return {
    Program(node) {
      const noun = nounOf(file.replace(/\.[^.]+$/, ""));
      if (noun)
        context.report({ node, message: `"${noun}" is 3.5's noun: the file's path (${file}) names a module's thing.` });
    },
    Identifier(node) {
      // English's own: a promise's race
      if (
        node.parent.type === "MemberExpression" &&
        node.parent.property === node &&
        node.parent.object.name === "Promise"
      )
        return;
      report(node, node.name);
    },
    JSXIdentifier(node) {
      report(node, node.name);
    },
    JSXText(node) {
      report(node, node.value);
    },
    Literal(node) {
      if (typeof node.value !== "string") {
        if (node.regex) report(node, node.regex.pattern);
      } else if (isStoredName(node)) {
        reportStored(node, node.value);
      } else {
        report(node, node.value);
      }
    },
    PrivateIdentifier(node) {
      report(node, node.name);
    },
    TemplateElement(node) {
      const text = node.value.cooked ?? node.value.raw;
      if (STORED_NAMES.has(text) && node.parent.quasis.length === 1) reportStored(node, text);
      else report(node, text);
    },
  };
}

/** Whether a literal type (`type`) keys a record (`Record<"items", …>`) or indexes a kind registry (`…Kinds["items"]`). */
function isKindKey(type) {
  const { parent } = type;
  if (parent?.type === "TSIndexedAccessType" && parent.indexType === type) {
    const { objectType } = parent;
    return objectType.type === "TSTypeReference" && (objectType.typeName?.name ?? "").endsWith("Kinds");
  }
  const reference = parent?.type === "TSTypeParameterInstantiation" ? parent.parent : undefined;
  return reference?.type === "TSTypeReference" && reference.typeName?.name === "Record" && parent.params[0] === type;
}

/** Whether a file is a ruleset's, in one of its folders, or the lint's own, its word lists and their tests. */
function isRulesets(file, rulesets) {
  return (
    file.split("/").some((segment) => rulesets.has(segment)) ||
    file.startsWith("lint/") ||
    file.startsWith("tests/lint/")
  );
}

/**
 * Whether a string literal is one of 3.5's kinds' stored names (`STORED_NAMES`) where it can only name a kind: compared,
 * a call's argument, a property's value, a list's element, a switch's case, a record's key or a kind registry's.
 */
function isStoredName(node) {
  if (!STORED_NAMES.has(node.value)) return false;
  const { parent } = node;
  switch (parent?.type) {
    case "ArrayExpression":
      return true;
    case "BinaryExpression":
      return COMPARISONS.has(parent.operator);
    case "CallExpression":
    case "NewExpression":
      return parent.arguments.includes(node);
    case "Property":
      return parent.value === node;
    case "SwitchCase":
      return parent.test === node;
    case "TSLiteralType":
      return isKindKey(parent);
    default:
      return false;
  }
}

/** The 3.5 noun a name holds, read word by word, if any. */
function nounOf(name) {
  const words = wordsOf(name);
  if (words.length === 1 && WHOLE_NAMES.has(words[0])) return words[0];
  const noun = words.find((word) => NOUNS.has(word));
  if (noun) return noun;
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = PHRASES.find(([first, second]) => words[i] === first && words[i + 1] === second);
    if (phrase) return phrase.join(" ");
  }
  return undefined;
}

/**
 * A name's words, lowercase: by its case (`klassLevelId`, `KLASS_HD`), its digits (`feat2`) and what separates them
 * (`klass_levels`).
 */
function wordsOf(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export default {
  "ruleset-nouns": { meta: { type: "problem" }, create: createRulesetNouns },
};
