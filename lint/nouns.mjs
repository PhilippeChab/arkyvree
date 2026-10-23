/**
 * A ruleset's nouns are its own (docs/rulesets.md, #59's contract):
 *
 * - `ruleset-nouns`: no file outside a ruleset's folders (`dnd3.5/`: its module, content, vocabulary, seeders, codegen
 *   and docs) names one of 3.5's nouns: a class (`klass`), a power, a spell, a feat, an aptitude, a skill, an ability,
 *   a race, an alignment, a language, a bonded creature, hit points, a saving throw… The engine's core, its entry, the
 *   server, the shared code, the client and the scripts speak of entities, kinds, fields, links, tracks, steps and
 *   pools, which a module names. Every identifier, string, JSX text and file name is read word by word (`klassLevelId`
 *   is `klass`, `level`, `id`; `"klass_levels"` is `klass`, `levels`). A comment may name them, as an example of what
 *   a module declares.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import fs from "node:fs";

import { repoPath } from "./paths.mjs";

/**
 * The folders whose files still name 3.5's nouns (`notYetGeneric.json`, each a folder, not its subfolders), which phase 5
 * of #59 makes generic one at a time: each leaves the list as it's clean, and none comes back.
 */
const NOT_YET_GENERIC = new Set(JSON.parse(fs.readFileSync(new URL("./notYetGeneric.json", import.meta.url), "utf8")));

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
  "hp",
  "klass",
  "klasses",
  "language",
  "languages",
  "pcg",
  "pcgen",
  "power",
  "powers",
  "race",
  "races",
  "racial",
  "saving",
  "skill",
  "skills",
  "spell",
  "spellcasting",
  "spells",
  "weapon",
  "weapons",
  "xp",
]);

/**
 * The nouns 3.5 names by two words, whose first or second is English alone: a save's (`saveId`, `rulesetSaves`, not
 * `onSave`), hit points, a class level's string as the code stored it (`"classes"`, `"class_levels"`).
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
  ["ruleset", "save"],
  ["ruleset", "saves"],
  ["save", "bonus"],
  ["save", "effect"],
  ["save", "id"],
  ["save", "ids"],
  ["saves", "by"],
  ["saves", "track"],
];

/** The names 3.5's kinds are stored and routed by, as a whole string or name */
const WHOLE_NAMES = new Set(["classes", "saves"]);

function createRulesetNouns(context) {
  const file = repoPath(context.filename);
  if (isRulesets(file) || NOT_YET_GENERIC.has(file.slice(0, file.lastIndexOf("/")))) return {};
  const report = (node, name) => {
    const noun = nounOf(name);
    if (!noun) return;
    const named = name.length > 60 ? `${name.slice(0, 60)}…` : name;
    context.report({
      node,
      message:
        `"${noun}" is 3.5's noun (\`${named}\`): outside a ruleset's folders, the code speaks of entities, kinds, ` +
        "fields, links, tracks, steps and pools, which a module names.",
    });
  };
  return {
    Program(node) {
      const noun = nounOf(file.replace(/\.[^.]+$/, ""));
      if (noun)
        context.report({ node, message: `"${noun}" is 3.5's noun: the file's name (${file}) names a module's thing.` });
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
      if (typeof node.value === "string") report(node, node.value);
    },
    PrivateIdentifier(node) {
      report(node, node.name);
    },
    TemplateElement(node) {
      report(node, node.value.cooked ?? node.value.raw);
    },
  };
}

/** Whether a file is a ruleset's, in one of its folders, or the lint's own, its word lists and their tests. */
function isRulesets(file) {
  return file.split("/").includes("dnd3.5") || file.startsWith("lint/") || file.startsWith("tests/lint/");
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

/** A name's words, lowercase: by its case (`klassLevelId`, `KLASS_HD`) and by what separates them (`klass_levels`). */
function wordsOf(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export default {
  "ruleset-nouns": { meta: { type: "problem" }, create: createRulesetNouns },
};
