import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";

import type { SectionTab } from "@/client/src/components/common/index.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/**
 * What an owner's links' tab says, in its rules' words: its entities' (`one`, "Skill"), the owner's (`owner`, "class").
 */
export interface LinkWords {
  one: string;
  owner: string;
}

/** What a progression owner's page passes each of its tabs. */
export interface OwnerSectionProps {
  ownerId: string;
  ownerName: string;
  /** Its kind (3.5's `classes`), whose routes its tabs read and write through */
  ownerType: string;
  /** A delete on its tab can be undone from Local Changes: the owner is inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
}

/**
 * A progression owner's page's tab: its key (the URL's `:section`), its label and icon, the section it shows, and what
 * it warms.
 */
export interface OwnerTab extends SectionTab<string> {
  /** Warms its rows as it's pointed at; a tab whose section reads its own rows warms none */
  prefetch?: (queryClient: QueryClient, rulesetId: string, ownerId: string) => Promise<void>;
  Section: ComponentType<OwnerSectionProps>;
}
