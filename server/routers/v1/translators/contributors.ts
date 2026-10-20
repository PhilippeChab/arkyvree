/** A character's or a ruleset's contributors as v1 answers them, each by the address they were invited at. */

import type { z } from "zod";

import type { v1Contributor, v1ContributorPage } from "@/server/routers/v1/schemas/contributors.ts";
import type { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import type { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";

import { toV1Page } from "./pages.ts";

/** What a service answers, awaited. */
type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;

/** A page of contributors, as a character's or a ruleset's service answers it, with its owner. */
type ContributorList =
  | Answer<typeof CharacterContributorsService.getContributors>
  | Answer<typeof ContributorsService.getContributors>;

/** A contributor, or an invite to be one, as a list, an invite or a change of role answers it. */
export function toV1Contributor(
  contributor:
    | Answer<typeof CharacterContributorsService.inviteContributor>
    | Answer<typeof ContributorsService.inviteContributor>
    | Answer<typeof ContributorsService.updateContributorRole>
    | ContributorList["items"][number],
): z.infer<typeof v1Contributor> {
  const { email, id, role, status, userId } = contributor;
  return { email, id, role, status, userId };
}

/** A page of a character's or a ruleset's contributors, with the owner they contribute with. */
export function toV1Contributors({ owner, ...page }: ContributorList): z.infer<typeof v1ContributorPage> {
  return { ...toV1Page(page, toV1Contributor), owner: owner ? { id: owner.id, username: owner.username } : null };
}
