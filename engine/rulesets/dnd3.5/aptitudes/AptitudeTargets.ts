/**
 * The aptitudes' target grammar, as the listing writes it: a list's slug (`[a-z0-9]+`), a whole spell level, an anchored
 * field. A leaf module: the listing (`AptitudesPaths`) reads the spell lists (`spellLists.ts`), which read targets, and
 * both read this.
 */

/** A list's pool or one of its spell levels' slots, by the list's slug: `aptitudes.<list>(.<level>).allowed`. */
const ALLOWED_TARGET = /^aptitudes\.([a-z0-9]+)(?:\.\d+)?\.allowed$/;
/** Its spells joining its class's list: `aptitudes.<list>.joinsclasslist`. */
const JOIN_TARGET = /^aptitudes\.([a-z0-9]+)\.joinsclasslist$/;
/** Any path of a list: `aptitudes.<list>` and what follows. */
const LIST_TARGET = /^aptitudes\.([a-z0-9]+)(?:\.|$)/;
/** A list's pool: `aptitudes.<list>.allowed`. */
const POOL_TARGET = /^aptitudes\.([a-z0-9]+)\.allowed$/;
/** A list's spell level: `aptitudes.<list>.<level>.allowed` or `.uses`. */
const SPELL_LEVEL_TARGET = /^aptitudes\.([a-z0-9]+)\.(\d+)\.(allowed|uses)$/;

/** What a modifier's target says of an aptitude: the pool, list, spell level or join it names. */
export default class AptitudeTargets {
  /** The list whose pool or spell level's slots a target counts (`aptitudes.<list>(.<level>).allowed`): its slug. */
  static parseAllowed(target: string): string | undefined {
    return ALLOWED_TARGET.exec(target)?.[1];
  }

  /** The list whose spells join its class's list (`aptitudes.<list>.joinsclasslist`): its slug. */
  static parseJoin(target: string): string | undefined {
    return JOIN_TARGET.exec(target)?.[1];
  }

  /** The list any of whose paths a target is (`aptitudes.<list>…`): its slug. */
  static parseList(target: string): string | undefined {
    return LIST_TARGET.exec(target)?.[1];
  }

  /** The list whose pool a target is (`aptitudes.<list>.allowed`): its slug. */
  static parsePool(target: string): string | undefined {
    return POOL_TARGET.exec(target)?.[1];
  }

  /** A list's spell level a target is (`aptitudes.<list>.<level>.allowed` or `.uses`): the list's slug, the level, the field. */
  static parseSpellLevel(target: string): { field: "allowed" | "uses"; level: number; list: string } | undefined {
    const match = SPELL_LEVEL_TARGET.exec(target);
    if (!match) return undefined;
    return { list: match[1], level: Number(match[2]), field: match[3] === "uses" ? "uses" : "allowed" };
  }
}
