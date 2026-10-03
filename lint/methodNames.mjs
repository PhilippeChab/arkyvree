/**
 * Method names, by layer: a public method starts with a verb its layer knows, so its name says what it does and a new
 * one needs no choosing.
 *
 * - A repository's verbs are `server/repositories/methodVerbs.json`'s, which the request cache classifies its methods
 *   by: reads (`find`, `exists`, `count`), writes (`create`, `update`, …) and `lock`. Its name says what it returns,
 *   never how it filters (`findManyByUser`, `archiveAllForUser`): filters go in its `where`, one method per verb.
 * - A service reads with `get`, creates (`create`, `add`, `duplicate`), updates (`update`, `set`, `mark`), deletes
 *   (`delete`, `remove`, `archive`, `unarchive`, `hardDelete`), or takes one of the actions below, on its resource
 *   (`FeatsService.getFeat`): never `ById` (the id is a parameter) or `My` (the session's scope is implied).
 * - A policy checks: `can` (it throws, or returns what it checked) or `is` (a yes or no). `for` builds one.
 *
 * Private and protected methods are the class's own business: any name.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */
import fs from "node:fs";

import { startsWithVerb } from "./memberOrder.mjs";
import { repoPath } from "./paths.mjs";

const REPOSITORY = JSON.parse(
  fs.readFileSync(new URL("../server/repositories/methodVerbs.json", import.meta.url), "utf8"),
);

// oxfmt-ignore
const SERVICE_ACTIONS = [
  "accept", "attach", "cancel", "complete", "detach", "enqueue", "finalize", "forgot", "fork", "generate", "invite",
  "leave", "link", "publish", "reject", "resend", "reset", "revert", "revoke", "sign", "star", "start", "subscribe",
  "unlink", "unstar", "unsubscribe", "validate", "verify",
];

/** Each layer's verbs, the most specific folder first. */
const VOCABULARIES = [
  {
    layer: "server/repositories/",
    what: "A repository method",
    verbs: [...REPOSITORY.read, ...REPOSITORY.write, ...REPOSITORY.lock],
    where: "server/repositories/methodVerbs.json",
    // A filter goes in its `where`: `findManyByUser` is `findMany(db, { userId })`.
    filters: {
      words: /(?<=[a-z0-9])(By|For|In|On|From|All)(?=[A-Z0-9]|$)/,
      why: "a repository has one method per verb, its filters in its `where`, and a variant is named by what it returns",
    },
  },
  { layer: "server/services/policies/", what: "A policy method", verbs: ["can", "is", "for"] },
  {
    layer: "server/services/",
    what: "A service method",
    verbs: [
      "get",
      ...["create", "add", "duplicate"],
      ...["update", "set", "mark"],
      ...["delete", "remove", "archive", "unarchive", "hardDelete"],
      ...SERVICE_ACTIONS,
    ],
    // `getCampaignById` is `getCampaign(id)`; `getMyStats` is `getStats(session)`.
    filters: {
      words: /(?<=[a-z0-9])(By|My)(?=[A-Z0-9]|$)/,
      why: "a service method is its verb and its service's resource (`FeatsService.getFeat`): an id is a parameter, and the session's scope is implied",
    },
  },
];

/** A function a field holds: written there, or another one's (`readonly finalizeLevelUp = finalizeLevelUp`). */
const FUNCTION_VALUES = ["ArrowFunctionExpression", "FunctionExpression", "Identifier", "MemberExpression"];

const isMethod = (member) =>
  (member.type === "MethodDefinition" || member.type === "TSAbstractMethodDefinition"
    ? member.kind === "method"
    : member.type === "PropertyDefinition" && FUNCTION_VALUES.includes(member.value?.type)) && !member.computed;

const isPublic = (member) =>
  (!member.accessibility || member.accessibility === "public") && member.key?.type !== "PrivateIdentifier";

const methodNames = {
  meta: { type: "suggestion" },
  create(context) {
    const file = repoPath(context.filename);
    const vocabulary = VOCABULARIES.find((v) => file.startsWith(v.layer));
    if (!vocabulary) return {};
    const listed = vocabulary.where ?? "lint/methodNames.mjs";
    return {
      ClassBody(body) {
        for (const member of body.body) {
          if (!isMethod(member) || !isPublic(member)) continue;
          const name = member.key.name ?? member.key.value;
          if (typeof name !== "string") continue;
          if (!vocabulary.verbs.some((verb) => startsWithVerb(name, verb))) {
            context.report({
              node: member.key,
              message: `${vocabulary.what} starts with one of its layer's verbs (${listed}): \`${name}\` doesn't.`,
            });
          } else if (vocabulary.filters?.words.test(name)) {
            const word = vocabulary.filters.words.exec(name)[1];
            context.report({
              node: member.key,
              message: `\`${name}\` names a filter (\`${word}\`): ${vocabulary.filters.why}.`,
            });
          }
        }
      },
    };
  },
};

export const rules = { "method-names": methodNames };
