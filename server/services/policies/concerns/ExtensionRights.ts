import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may subscribe a ruleset to an extension, and unsubscribe it. */
export function ExtensionRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithExtensionRights extends Base {
    canSubscribeExtension() {
      if (!this.entity.userId) throw new ForbiddenError("Cannot subscribe to extensions on a base ruleset");

      if (this.entity.userId !== this.session.userId)
        throw new ForbiddenError("Cannot subscribe to extensions on another user's ruleset");

      if (this.entity.status === "Archived")
        throw new UnprocessableEntityError("Cannot subscribe to extensions on an archived ruleset");

      if (!this.entity.rulesetId)
        throw new UnprocessableEntityError("Only forked rulesets can subscribe to extensions");

      if (this.entity.kind === "extension")
        throw new UnprocessableEntityError("Extensions cannot subscribe to other extensions");

      return true;
    }

    canUnsubscribeExtension({ inUse = false }: { inUse?: boolean } = {}) {
      this.canSubscribeExtension();

      // An extension COWs base entities into its own ruleset and those COWs
      // may have sibling-winner ids characters have already picked. Removing
      // the extension silently invalidates those picks, so refuse the same
      // way `canDeleteEntity` does once the ruleset is being played.
      if (inUse) throw new ConflictError("Cannot unsubscribe from extensions on a ruleset in use by characters");

      return true;
    }
  }
  return WithExtensionRights;
}
