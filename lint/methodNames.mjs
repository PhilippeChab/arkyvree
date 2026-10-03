/**
 * Method names, by layer: a public method starts with a verb its layer knows, so its name says what it does and a new
 * one needs no choosing.
 *
 * - A repository's verbs are `server/repositories/methodVerbs.json`'s, which the request cache classifies its methods
 *   by: reads (`find`, `exists`, `count`), writes (`create`, `update`, …) and `lock`.
 * - A service reads with `get`, creates (`create`, `add`, `duplicate`), updates (`update`, `set`, `mark`), deletes
 *   (`delete`, `remove`, `archive`, `unarchive`, `hardDelete`), or takes one of the actions below.
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
  "accept", "attach", "cancel", "complete", "detach", "enqueue", "forgot", "fork", "generate", "invite", "leave", "link",
  "publish", "reject", "resend", "reset", "revert", "revoke", "sign", "star", "start", "subscribe", "unlink", "unstar",
  "unsubscribe", "verify",
];

/** Each layer's verbs, the most specific folder first. */
const VOCABULARIES = [
  {
    layer: "server/repositories/",
    what: "A repository method",
    verbs: [...REPOSITORY.read, ...REPOSITORY.write, ...REPOSITORY.lock],
    where: "server/repositories/methodVerbs.json",
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
  },
];

const isMethod = (member) =>
  (member.type === "MethodDefinition" || member.type === "TSAbstractMethodDefinition"
    ? member.kind === "method"
    : member.type === "PropertyDefinition" &&
      ["ArrowFunctionExpression", "FunctionExpression"].includes(member.value?.type)) && !member.computed;

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
          if (typeof name !== "string" || vocabulary.verbs.some((verb) => startsWithVerb(name, verb))) continue;
          context.report({
            node: member.key,
            message: `${vocabulary.what} starts with one of its layer's verbs (${listed}): \`${name}\` doesn't.`,
          });
        }
      },
    };
  },
};

export const rules = { "method-names": methodNames };
