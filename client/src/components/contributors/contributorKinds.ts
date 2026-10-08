/**
 * The kinds of contributor, managed one way wherever they're managed (`ContributorsDialog`, through
 * `useContributors`): a ruleset's, a character's.
 */

import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { InviteContributorFormData } from "./InviteContributorDialog.tsx";

/** A ruleset's or a character's contributor, as its list sends it. */
export type Contributor = ContributorsPage["items"][number];

/** What a contributor contributes to. */
export type ContributorKind = "character" | "ruleset";

/** A page of a ruleset's or a character's contributors, which also names its owner. */
export type ContributorsPage = Awaited<ReturnType<(typeof CONTRIBUTOR_KINDS)[ContributorKind]["listFn"]>>;

/**
 * Each kind's words (its name, its noun, its dialog's lead line), its requests, its contributors' cache key, and the
 * list its record leaves once its contributor leaves it, where leaving lands.
 */
export const CONTRIBUTOR_KINDS = {
  character: {
    label: "Character",
    noun: "character",
    lead: "Contributors can edit this character and download its PDF.",
    listKey: QUERY_KEYS.characters.lists,
    listPath: "/characters",
    queryKey: (id: string) => QUERY_KEYS.characters.contributors(id),
    listFn: (id: string, page: number) =>
      parseResponse(
        rpc.api.characters[":id"].contributors.$get({ param: { id }, query: { page: page.toString(), limit: "10" } }),
      ),
    inviteFn: (id: string, { email }: InviteContributorFormData) =>
      parseResponse(rpc.api.characters[":id"].contributors.$post({ param: { id }, json: { email } })),
    removeFn: (id: string, contributorId: string) =>
      parseResponse(rpc.api.characters[":id"].contributors[":contributorId"].$delete({ param: { id, contributorId } })),
    leaveFn: (id: string) => parseResponse(rpc.api.characters[":id"].contributors.leave.$post({ param: { id } })),
  },
  ruleset: {
    label: "Ruleset",
    noun: "ruleset",
    lead: "Contributors work on this ruleset by their role: a Viewer reads it, an Editor edits its content, and an Admin also edits its details and manages its contributors.",
    listKey: QUERY_KEYS.rulesets.lists,
    listPath: "/rulesets",
    queryKey: (id: string) => QUERY_KEYS.rulesets.section(id, "contributors"),
    listFn: (id: string, page: number) =>
      parseResponse(
        rpc.api.rulesets[":id"].contributors.$get({ param: { id }, query: { page: page.toString(), limit: "10" } }),
      ),
    inviteFn: (id: string, invite: InviteContributorFormData) =>
      parseResponse(rpc.api.rulesets[":id"].contributors.$post({ param: { id }, json: invite })),
    removeFn: (id: string, contributorId: string) =>
      parseResponse(rpc.api.rulesets[":id"].contributors[":contributorId"].$delete({ param: { id, contributorId } })),
    leaveFn: (id: string) => parseResponse(rpc.api.rulesets[":id"].contributors.leave.$post({ param: { id } })),
  },
} as const satisfies Record<ContributorKind, unknown>;
