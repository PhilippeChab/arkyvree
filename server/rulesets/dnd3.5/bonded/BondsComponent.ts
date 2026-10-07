/**
 * Universal "bonded" target paths — express that a character has a familiar /
 * animal companion / mount, plus the granting classes' contribution to the
 * bonded's effective level.
 *
 * Per kind:
 *   - `race`: race name picked by the master (set by the race-pick feat).
 *   - `level`: effective level of the bonded creature, summed across every
 *     class-feature grant feat the master possesses. Each grant feat writes
 *     a template modifier to this path with its class-specific formula,
 *     e.g.:
 *
 *       Druid:       bonded.animalcompanion.level += {{ [classes.druid.level] }}
 *       Ranger:      bonded.animalcompanion.level += {{ floor([classes.ranger.level] / 2) }}
 *       Beastmaster: bonded.animalcompanion.level += {{ max(0, [classes.beastmaster.level] + 3) }}
 *       Paladin:     bonded.mount.level           += {{ [classes.paladin.level] }}
 *       Cavalier:    bonded.mount.level           += {{ [classes.cavalier.level] }}
 *
 *     Adding a new class that grants a bonded slot needs zero compose
 *     changes — just the right template modifier on the new feat.
 */

import { BONDED_KINDS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";

type BondsData = {
  [K in BondedKind]: DetailedCharacterBondedSlot;
};

type DetailedCharacterBondedSlot = {
  level: number;
  race: string;
};

export default class BondsComponent {
  protected readonly bonds: BondsData = BONDED_KINDS.reduce((acc, b) => {
    acc[b.slug] = { race: "", level: 0 };
    return acc;
  }, {} as BondsData);

  /** Effective level for a given bonded slot. */
  getBondedLevel(slug: BondedKind): number {
    return this.bonds[slug]?.level ?? 0;
  }

  /** Resolved race name for a given bonded slot, or null if no race is set. */
  getBondedRace(slug: BondedKind): string | null {
    const value = this.bonds[slug]?.race;
    return value && value.length > 0 ? value : null;
  }

  getBonds(): BondsData {
    return this.bonds;
  }
}
