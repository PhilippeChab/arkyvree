import type { Constructor } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Whether a ruleset can be an extension, and who may subscribe it to an extension, and unsubscribe it. */
export function ExtensionRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithExtensionRights extends Base {
    /**
     * Whether the ruleset can be published as an extension, or made one: a fork that subscribes to none
     * (`hasExtensions`: it subscribes to one), so subscribers never walk a chain of extensions. Whoever asks: who may
     * publish or edit it is `canPublish`'s and `canUpdate`'s.
     */
    canBeExtension({ hasExtensions }: { hasExtensions: boolean }) {
      if (!this.entity.rulesetId) throw new UnprocessableEntityError("Only forks can be published as extensions");

      if (hasExtensions)
        throw new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension");

      return true;
    }

    /**
     * Being subscribed to, as an extension, by a fork of `parentId`: a published extension, public (a system one
     * always is), of the same base, as extensions are forks of a base, which no fork forks again. Whoever asks: who may
     * subscribe the fork is `canSubscribeExtension`'s.
     */
    canBeSubscribed({ parentId }: { parentId: string | null }) {
      if (this.entity.kind !== "extension")
        throw new UnprocessableEntityError("Ruleset is not published as an extension");

      if (this.entity.status !== "Published") throw new UnprocessableEntityError("Extension must be published");

      if (!this.entity.system && this.entity.private) throw new UnprocessableEntityError("Extension must be public");

      if (parentId !== this.entity.rulesetId)
        throw new UnprocessableEntityError("Extension must share a common ancestor ruleset");

      return true;
    }

    /**
     * Subscribing the ruleset to extensions: its owner, on a live fork that isn't an extension, and isn't one in use
     * either (`usedAsExtension`: another ruleset subscribes to it), whose subscribers would then depend on extensions
     * through it.
     */
    canSubscribeExtension({ usedAsExtension }: { usedAsExtension: boolean }) {
      this.checkOwned("subscribe to extensions on");

      if (this.entity.userId !== this.session.userId)
        throw new ForbiddenError("Cannot subscribe to extensions on another user's ruleset");

      if (this.entity.status === "Archived")
        throw new UnprocessableEntityError("Cannot subscribe to extensions on an archived ruleset");

      if (!this.entity.rulesetId)
        throw new UnprocessableEntityError("Only forked rulesets can subscribe to extensions");

      if (this.entity.kind === "extension")
        throw new UnprocessableEntityError("Extensions cannot subscribe to other extensions");

      if (usedAsExtension) {
        throw new UnprocessableEntityError(
          "Cannot subscribe to extensions while this ruleset is being used as an extension",
        );
      }

      return true;
    }

    /** Unsubscribing the ruleset from an extension: who may subscribe it to one, whether or not it's used as one. */
    canUnsubscribeExtension({ inUse = false }: { inUse?: boolean } = {}) {
      this.canSubscribeExtension({ usedAsExtension: false });

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
