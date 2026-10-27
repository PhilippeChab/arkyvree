/**
 * A ruleset's nouns are its own (docs/rulesets.md, #59's contract):
 *
 * - `ruleset-nouns`: no file outside a ruleset's folders (`dnd3.5/`: its module, content, vocabulary, seeders, codegen
 *   and docs) names one of 3.5's nouns: a class (`klass`), a power, a spell, a feat, an aptitude, a skill, an ability,
 *   a race, an alignment, a language, a bonded creature, hit points, a saving throw… The engine's core, its entry, the
 *   server, the shared code, the client and the scripts speak of entities, kinds, fields, links, tracks, steps and
 *   pools, which a module names. Every identifier, string, regular expression, JSX text and file path is read word by
 *   word (`spellLevelId` is `spell`, `level`, `id`; `"class-levels"` is the phrase `class`, `levels`), and a whole
 *   string that is a kind's stored name and an English word alone (`"items"`, `"mechanics"`), which the core reads from
 *   what a module declares. A comment may name them, as an example of what a module declares.
 * - `klass-names`: `klass` spells 3.5's class where `class` is a reserved word, and nowhere else: its types (`Klass`,
 *   `KlassLevel`) and a value that is one (`klass`). Every other name says `class` (`classId`, `classLevelId`,
 *   `classLevelsByClass`, `getSavedClassLevel`), and so does a file's name. A string is data (a stored row a migration
 *   reads), a comment may name it, and so may an import another module's export it renames (`KlassView as View`).
 * - `dropped-names`: the names of the dropped tables' columns and rows that mean nothing today (`characterLevelId`,
 *   `targetTable`…) come back nowhere, in a ruleset's folders and the tests too, as a name or a key: what they held is
 *   stored another way (a skill's ability its `keyAbility` link, an item's cost its field). The migrations' tests keep
 *   them, and a name keeps the files where it means something today. And the server and `shared/` name no table (`getTableName`): what they name is a kind, or a target type (`TARGET_TYPES`).
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { isInRepo, repoPath, rootOf, rulesetsOf } from "./paths.mjs";

/** The operators that compare a value with another: a stored name compared is a kind. */
const COMPARISONS = new Set(["===", "!==", "==", "!="]);

/**
 * The files where a dropped name means something today (`dropped-names`), beside `MIGRATION_TESTS`: 3.5's codegen,
 * whose scraped items the books give a cost in gold pieces, and the test that sends an item's old column in a body to
 * see it refused.
 */
const DROPPED_NAME_HOMES = new Map([
  ["costGp", [/^codegen\/dnd3\.5\//, /^tests\/routers\/api\/rulesets\/entities\/dnd3\.5\/items\.test\.ts$/]],
]);

/**
 * The names of the dropped tables' columns and rows that mean nothing today, each with what holds it now, as a name or
 * a key (`dropped-names`). `saveId`, `raceId` and `isTemplate` aren't: they name a live link or field.
 */
const DROPPED_NAMES = new Map([
  ["characterLevelId", "a character's level is its advancement (`advancementId`)"],
  ["character_level_id", "a character's level is its advancement (`advancement_id`)"],
  ["costGp", "an item's cost is its field (`ITEM_COST_GP`)"],
  ["cost_gp", "an item's cost is its field (`ITEM_COST_GP`)"],
  ["klassLevelId", "a class level is an entity its class owns (`classLevelId`), and what it grants its links"],
  ["klass_level_id", "a class level is an entity its class owns (`classLevelId`), and what it grants its links"],
  ["LevelFeat", "a level's feat is a pick of its advancement (`StoredPick`)"],
  ["levelFeat", "a level's feat is a pick of its advancement (`StoredPick`)"],
  ["level_feat", "a level's feat is a pick of its advancement (`StoredPick`)"],
  ["primaryAbilityId", "a skill's ability is its `keyAbility` link"],
  ["primary_ability_id", "a skill's ability is its `keyAbility` link"],
  ["sourceItemId", "an item's template is its `madeFrom` link"],
  ["source_item_id", "an item's template is its `madeFrom` link"],
  ["targetTable", "an activity's target is its type (`targetType`), never a table's name"],
  ["target_table", "an activity's target is its type (`target_type`), never a table's name"],
]);

/**
 * Where every dropped name keeps its meaning (`dropped-names`): the migrations' tests, which write the rows the
 * migrations read (the migrations themselves are SQL, which no rule reads).
 */
const MIGRATION_TESTS = /^tests\/scripts\/db\//;

/** The nouns 3.5 names its things by, each a word of a name (`spellLevelId`'s `spell`). */
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
 * `onSave`), hit points, a class level's string as the code stored it (`"classes"`, `"class-levels"`); and the program
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

/** The names `klass` may be: 3.5's types, and a value that is one, where `class` is a reserved word. */
const RESERVED_SPELLINGS = new Set(["Klass", "KlassLevel", "klass"]);

/**
 * The names 3.5's kinds are stored and routed by that are English words alone (`"items"`, `"mechanics"`), as a whole
 * string where it can only be a kind (`isStoredName`): compared (`type === "items"`, `case "items":`), handed to a
 * call (`byId("items")`, `types.includes("items")`), a property's value or a list's element (`{ type: "items" }`),
 * a whole template (`` `items` ``), a record's key (`Record<"items", …>`) or a kind registry's (`ViewKinds["items"]`).
 * Never a name, a property's key, a computed member, an `in` test or another type's key (a page's `items`:
 * `page.items`, `{ "items": 1 }`, `page["items"]`, `"items" in page`, `Pick<Page, "items">`, `keyof Page`).
 */
const STORED_NAMES = new Set(["items", "mechanics"]);

/** The folders that name no table (`dropped-names`): the server and the shared code name kinds and target types. */
const TABLELESS_FOLDERS = [/^server\//, /^shared\//];

/** The names 3.5's kinds are stored and routed by, as a whole string or name */
const WHOLE_NAMES = new Set(["classes", "saves"]);

/**
 * `dropped-names`: a dropped table's column or row named where it means nothing today, as a name or a key; and a
 * table's name read in the server or `shared/` (`getTableName`).
 */
function createDroppedNames(context) {
  if (!isInRepo(context.filename)) return {};
  const file = repoPath(context.filename);
  if (MIGRATION_TESTS.test(file)) return {};
  const tableless = TABLELESS_FOLDERS.some((folder) => folder.test(file));
  // A name read twice at one place (an import's imported and local name, a shorthand property) is reported once
  const reported = new Set();
  const report = (node, name) => {
    if (reported.has(node.start)) return;
    if (tableless && name === "getTableName") {
      reported.add(node.start);
      context.report({
        node,
        message:
          "The server and `shared/` name no table (`getTableName`): an activity's target is an entity's type or one " +
          "of `TARGET_TYPES`, in the form a route names a kind.",
      });
      return;
    }
    const now = DROPPED_NAMES.get(name);
    if (!now || (DROPPED_NAME_HOMES.get(name) ?? []).some((home) => home.test(file))) return;
    reported.add(node.start);
    context.report({
      node,
      message: `\`${name}\` is a dropped table's, which means nothing today: ${now}.`,
    });
  };
  return {
    Identifier(node) {
      report(node, node.name);
    },
    JSXIdentifier(node) {
      report(node, node.name);
    },
    Literal(node) {
      if (typeof node.value === "string" && isKey(node)) report(node, node.value);
    },
    PrivateIdentifier(node) {
      report(node, node.name);
    },
  };
}

/** `klass-names`: a name spelled `klass` is one of 3.5's types, or a value that is one. */
function createReservedSpellings(context) {
  if (!isInRepo(context.filename)) return {};
  // A name read twice at one place (an import's imported and local name, a shorthand property) is reported once
  const reported = new Set();
  const report = (node, name) => {
    if (!/klass/i.test(name) || RESERVED_SPELLINGS.has(name) || reported.has(node.start)) return;
    reported.add(node.start);
    context.report({
      node,
      message:
        `\`${name}\` spells 3.5's class \`klass\`, which only its types (\`Klass\`, \`KlassLevel\`) and a value that is ` +
        "one (`klass`) do, where `class` is a reserved word: every other name says `class`.",
    });
  };
  return {
    Program(node) {
      const file = repoPath(context.filename);
      if (/klass/i.test(file))
        context.report({ node, message: `The file's path (${file}) spells \`klass\`: a file's name says \`class\`.` });
    },
    Identifier(node) {
      // Another module's export, renamed as it's imported: its local name is the file's own
      const { parent } = node;
      if (parent.type === "ImportSpecifier" && parent.imported === node && parent.local.name !== node.name) return;
      report(node, node.name);
    },
    JSXIdentifier(node) {
      report(node, node.name);
    },
    PrivateIdentifier(node) {
      report(node, node.name);
    },
  };
}

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

/**
 * Whether a string literal is a key: an object's (`{ "costGp": 1 }`, `{ ["costGp"]: 1 }`), a type's, a class's or an
 * enum's member's, or a computed member read's (`row["costGp"]`). Never a type's literal (`Omit<R, "costGp">`) or an
 * export's name.
 */
function isKey(node) {
  const { parent } = node;
  switch (parent?.type) {
    case "MemberExpression":
      return parent.computed && parent.property === node;
    case "MethodDefinition":
    case "Property":
    case "PropertyDefinition":
    case "TSMethodSignature":
    case "TSPropertySignature":
      return parent.key === node;
    case "TSEnumMember":
      return parent.id === node;
    default:
      return false;
  }
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
 * A name's words, lowercase: by its case (`spellLevelId`, `CLASS_HD`), its digits (`feat2`) and what separates them
 * (`class-levels`).
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
  "dropped-names": { meta: { type: "problem" }, create: createDroppedNames },
  "klass-names": { meta: { type: "problem" }, create: createReservedSpellings },
  "ruleset-nouns": { meta: { type: "problem" }, create: createRulesetNouns },
};
