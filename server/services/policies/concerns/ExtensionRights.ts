import type { Constructor } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Whether a ruleset can be an extension, and who may subscribe it to an extension, and unsubscribe it. */
export function ExtensionRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithExtensionRights extends Base {
    /**
     * Who may subscribe the ruleset to extensions, and its kind: its owner, on a fork that isn't an extension, and isn't
     * one in use (`usedAsExtension`).
     */
    private checkSubscriber({ usedAsExtension }: { usedAsExtension: boolean }) {
      this.checkOwned("subscribe to extensions on");

      if (this.entity.userId !== this.session.userId)
        throw new ForbiddenError("Cannot subscribe to extensions on another user's ruleset");

      if (!this.entity.rulesetId)
        throw new UnprocessableEntityError("Only forked rulesets can subscribe to extensions");

      if (this.entity.kind === "extension")
        throw new UnprocessableEntityError("Extensions cannot subscribe to other extensions");

      if (usedAsExtension) {
        throw new UnprocessableEntityError(
          "Cannot subscribe to extensions while this ruleset is being used as an extension",
        );
      }
    }

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
     * Being subscribed to, as an extension, by a fork (`subscriber`: its id and its parent's): never by itself, whatever
     * either read of it says (one taken while it changes kind), then a published extension, public (a system one always
     * is), of the same base, as extensions are forks of a base, which no fork forks again. Whoever asks: who may
     * subscribe the fork is `canSubscribeExtension`'s.
     */
    canBeSubscribed(subscriber: { extensionIds: string[]; id: string; parentId: string | null }) {
      if (subscriber.id === this.entity.id) throw new UnprocessableEntityError("A ruleset can't subscribe to itself");

      if (this.entity.kind !== "extension")
        throw new UnprocessableEntityError("Ruleset is not published as an extension");

      if (this.entity.status !== "Published") throw new UnprocessableEntityError("Extension must be published");

      if (!this.entity.system && this.entity.private) throw new UnprocessableEntityError("Extension must be public");

      if (subscriber.parentId !== this.entity.rulesetId)
        throw new UnprocessableEntityError("Extension must share a common ancestor ruleset");

      if (subscriber.extensionIds.includes(this.entity.id))
        throw new ConflictError("Already subscribed to this extension");

      return true;
    }

    /**
     * Changing the ruleset's kind: an extension keeps its own while another ruleset subscribes to it
     * (`usedAsExtension`), which would go on depending on what's no extension. Whoever asks: who may publish or edit it
     * is `canPublish`'s and `canUpdate`'s.
     */
    canChangeKind({ usedAsExtension }: { usedAsExtension: boolean }) {
      if (this.entity.kind === "extension" && usedAsExtension)
        throw new UnprocessableEntityError("Cannot change the kind of an extension other rulesets subscribe to");

      return true;
    }

    /**
     * Subscribing the ruleset to extensions: its owner, on a live fork that isn't an extension, and isn't one in use
     * either (`usedAsExtension`: another ruleset subscribes to it), whose subscribers would then depend on extensions
     * through it. The extensions it names (`extensions`: each one's policy, none for one the session can't read, and
     * those it subscribes to already) are other records, checked after who and its kind, before its own state: an
     * unknown one's 404, then each one's `canBeSubscribed`.
     */
    canSubscribeExtension({
      extensions,
      usedAsExtension,
    }: {
      extensions?: { policies: (WithExtensionRights | undefined)[]; subscribed: string[] };
      usedAsExtension: boolean;
    }) {
      this.checkSubscriber({ usedAsExtension });

      const subscriber = {
        extensionIds: extensions?.subscribed ?? [],
        id: this.entity.id,
        parentId: this.entity.rulesetId,
      };
      for (const extension of extensions?.policies ?? []) {
        if (!extension) throw new NotFoundError("Extension not found");
        extension.canBeSubscribed(subscriber);
      }

      this.checkUnarchived();
      return true;
    }

    /**
     * Unsubscribing the ruleset from an extension: who may subscribe it to one, whether or not it's used as one; one it
     * subscribes to (`isSubscribed`, the extension it names, another record's 404), before its state, then the in-use
     * guard.
     */
    canUnsubscribeExtension({ inUse = false, isSubscribed = true }: { inUse?: boolean; isSubscribed?: boolean } = {}) {
      this.checkSubscriber({ usedAsExtension: false });

      if (!isSubscribed) throw new NotFoundError("Not subscribed to this extension");

      this.checkUnarchived();

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
