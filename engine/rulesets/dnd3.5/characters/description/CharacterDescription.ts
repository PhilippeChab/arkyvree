import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import IdentityFields from "@/engine/rulesets/dnd3.5/characters/IdentityFields.ts";
import BondedPaths from "@/engine/rulesets/dnd3.5/model/bonded/BondedPaths.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { BONDED_KIND_SLUGS } from "@/vocabulary/dnd3.5/bondedKinds.ts";

import CharacterResponse from "./CharacterResponse.ts";
import SheetBlocks from "./SheetBlocks.ts";
import SheetSummaries from "./SheetSummaries.ts";

/** A bonded creature's sheet, which its subsheet reads, with the feat of its master's that bonds it (`bondFeatId`). */
type BondedDescription = ReturnType<typeof CharacterResponse.buildBondedSheet> & { bondFeatId: string | null };

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
          ...CharacterResponse.buildBondedSheet(
            input.record,
            Dnd35CharacterBuilder.build(view, input, { parent: master }),
          ),
          bondFeatId: CharacterDescription.bondFeatOf(master, kind),
        };
      }
    }
    return described;
  }

  /**
   * A character's sheet, as the API answers it: a player character's, its bonded creatures (`bonded`), each built with
   * it, in the details of the feats that bond them; or a bonded creature's, from its master's.
   */
  static describeFull(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]) {
    const built = Dnd35CharacterBuilder.build(view, character);
    if (character.parent) return CharacterResponse.toResponse(CharacterResponse.buildSheet(character.record, built));
    const sheet = CharacterResponse.buildSheet(character.record, built);
    const described = CharacterDescription.describeBonded(view, built, bonded);
    // Each creature in the details of the feat that bonds it
    return CharacterResponse.toResponse({ ...sheet, blocks: SheetBlocks.bond(sheet.blocks, Object.values(described)) });
  }

  /**
   * What a campaign member who only sees a character partly reads of it: who it is, its name and physical traits (race,
   * age, gender, height, weight, its identity's block alone), and nothing else: no summary's tracks, no diagnostics. An
   * allowlist: a new key of the response must be considered here.
   */
  static describePartial(view: RulesetView, character: CharacterInput) {
    const sheet = CharacterResponse.buildSheet(character.record, Dnd35CharacterBuilder.build(view, character));
    const response = CharacterResponse.toResponse(sheet);
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
      requirements: {},
      modifiers: {},
      validation: { valid: true, issues: [] },
      summary: SheetSummaries.describe({}),
      blocks: [IdentityFields.describe(sheet.identity, true)],
    } satisfies Record<keyof typeof response, unknown>;
  }
}
