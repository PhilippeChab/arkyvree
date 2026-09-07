import type { TargetPath } from "@/shared/customization/target.ts";

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

type BondedKindSlug = BondedKind;

export type DetailedCharacterBondedSlot = {
  race: string;
  level: number;
};

export type DetailedCharacterComprehensiveBonds = {
  [K in BondedKindSlug]: DetailedCharacterBondedSlot;
};

export default class DetailedCharacterBonds {
  static generateTargetPaths(
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];
    for (const b of BONDED_KINDS) {
      paths.push({
        path: `bonded.${b.slug}.race`,
        category: "bonded",
        description: `${b.label} race name`,
        valueType: "string" as const,
        operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
      });
      paths.push({
        path: `bonded.${b.slug}.level`,
        category: "bonded",
        description: `${b.label} effective level (summed from granting classes)`,
        valueType: "number" as const,
        operators: kind === "modifier"
          ? ["add", "subtract", "set"]
          : ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"],
      });
    }
    return paths;
  }

  static getSegmentLabels(): Record<string, string> {
    const labels: Record<string, string> = {
      bonded: "Bonded",
      race: "Race",
      level: "Effective level",
    };
    for (const b of BONDED_KINDS) labels[b.slug] = b.label;
    return labels;
  }

  protected readonly bonds: DetailedCharacterComprehensiveBonds = BONDED_KINDS
    .reduce((acc, b) => {
      acc[b.slug] = { race: "", level: 0 };
      return acc;
    }, {} as DetailedCharacterComprehensiveBonds);

  getBonds(): DetailedCharacterComprehensiveBonds {
    return this.bonds;
  }

  /** Resolved race name for a given bonded slot, or null if no race is set. */
  getBondedRace(slug: BondedKindSlug): string | null {
    const value = this.bonds[slug]?.race;
    return value && value.length > 0 ? value : null;
  }

  /** Effective level for a given bonded slot. */
  getBondedLevel(slug: BondedKindSlug): number {
    return this.bonds[slug]?.level ?? 0;
  }
}

export type { BondedKindSlug };
