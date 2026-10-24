import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";

import type { SectionTab } from "@/client/src/components/common/index.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/** What the class page passes each of its tabs. */
export interface ClassSectionProps {
  classId: string;
  className: string;
  /** Its kind (3.5's `classes`), whose routes its tabs read and write through */
  classType: string;
  /** A delete on its tab can be undone from Local Changes: the class is inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
}

/** A class page's tab: its key (the URL's `:section`), its label and icon, the section it shows, and what it warms. */
export interface ClassTab extends SectionTab<string> {
  /** Warms its rows as it's pointed at; a tab whose section reads its own rows warms none */
  prefetch?: (queryClient: QueryClient, rulesetId: string, classId: string) => Promise<void>;
  Section: ComponentType<ClassSectionProps>;
}

/** What a class's links' tab says, in its rules' words: its entities' (`one`, "Skill"), the class's (`owner`, "class"). */
export interface LinkWords {
  one: string;
  owner: string;
}
