import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import BondedPaths from "@/engine/rulesets/dnd3.5/model/bonded/BondedPaths.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { BONDED_KIND_SLUGS } from "@/vocabulary/dnd3.5/bondedKinds.ts";

import CharacterResponse from "./CharacterResponse.ts";

/** A bonded creature's sheet, as the API answers it, with the feat of its master's that bonds it (`bondFeatId`). */
type BondedDescription = ReturnType<typeof CharacterResponse.buildBonded> & { bondFeatId: string | null };

/**
 * A character described from the rows the server read: its sheet, a creature's, or its public part. Its private notes
 * are as its rows have them: the characters part reads them as the viewer does (`CharactersPart.describe`).
 */
export default class CharacterDescription {
  /** The master's feat that bonds its creature of a kind: the one whose modifier sets the creature's race, if one does. */
  private static bondFeatOf(master: DetailedCharacter, kind: string) {
    const race = BondedPaths.raceOf(kind);
    const bond = master.modifierEvaluator
      .getModifiers()
      .appliedModifiers.findLast((modifier) => modifier.target === race && modifier.sourceType === "feats");
    return bond?.sourceId ?? null;
  }

  /** The master's bonded creatures (`bonded`), each built with its master's sheet, by their kind, in the kinds' order. */
  private static describeBonded(view: RulesetView, master: DetailedCharacter, bonded: CharacterInput[]) {
    const byKind = new Map(bonded.map((input) => [input.record.kind, input]));
    const described: Record<string, BondedDescription> = {};
    for (const kind of BONDED_KIND_SLUGS) {
      const input = byKind.get(kind);
      if (input) {
        described[kind] = {
          ...CharacterResponse.buildBonded(input.record, Dnd35CharacterBuilder.build(view, input, { master })),
          bondFeatId: CharacterDescription.bondFeatOf(master, kind),
        };
      }
    }
    return described;
  }

  /** The bonded creatures of a sheet that shows none: a creature's own, or a partly seen character's. */
  private static noBonded(): Record<string, BondedDescription> {
    return {};
  }

  /**
   * A character's sheet, as the API answers it: a player character's with its bonded creatures' (`bonded`), each built
   * with it; or a bonded creature's, from its master's, which has no creatures of its own.
   */
  static describeFull(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]) {
    const built = Dnd35CharacterBuilder.build(view, character);
    if (character.master)
      return { ...CharacterResponse.buildBonded(character.record, built), bonded: CharacterDescription.noBonded() };
    return {
      ...CharacterResponse.buildFull(character.record, built),
      bonded: CharacterDescription.describeBonded(view, built, bonded),
    };
  }

  /**
   * What a campaign member who only sees a character partly reads of it: who it is, its name and physical traits (race,
   * age, gender, height, weight), and nothing else. An allowlist: a new field of the full sheet, or of its identity, must
   * be considered here.
   */
  static describePartial(view: RulesetView, character: CharacterInput) {
    const response = CharacterResponse.buildFull(character.record, Dnd35CharacterBuilder.build(view, character));
    const { physiology } = response.identity;
    return {
      id: response.id,
      userId: response.userId,
      kind: response.kind,
      parentCharacterId: response.parentCharacterId,
      name: response.name,
      raceId: response.raceId,
      rulesetId: response.rulesetId,
      rulesetName: response.rulesetName,
      baseRules: response.baseRules,
      isCustomRuleset: response.isCustomRuleset,
      deletedAt: response.deletedAt,
      updatedAt: response.updatedAt,
      shareToken: null,
      identity: {
        background: null,
        beliefs: null,
        meta: null,
        physiology: {
          age: physiology.age,
          description: null,
          gender: physiology.gender,
          height: physiology.height,
          languages: null,
          name: physiology.name,
          race: physiology.race,
          weight: physiology.weight,
        } satisfies Record<keyof typeof physiology, unknown>,
      } satisfies Record<keyof typeof response.identity, unknown>,
      skillBudget: { available: 0, spent: 0, total: 0 },
      abilities: {},
      combat: {},
      saves: {},
      classes: {},
      skills: {},
      inventory: {},
      equipment: [],
      virtualFeats: [],
      spellGroups: [],
      spellsPerDay: { levels: [], lists: [] },
      requirements: {},
      modifiers: {},
      validation: { valid: true, issues: [] },
      bonded: CharacterDescription.noBonded(),
    } satisfies Record<keyof typeof response | "bonded", unknown>;
  }
}
