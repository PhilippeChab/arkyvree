import type { CharacterInput, MemberReading, PrivateNotes } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { BONDED_KIND_SLUGS } from "@/shared/dnd3.5/bondedKinds.ts";

import CharacterResponse from "./CharacterResponse.ts";

/** A bonded creature's sheet, as the API answers it. */
type BondedDescription = ReturnType<typeof CharacterResponse.buildBonded>;

/** A character described from the rows the server read: its sheet, a creature's, or its public part. */
export default class CharacterDescription {
  /** The master's bonded creatures (`bonded`), each built with its master's sheet, by their kind, in the kinds' order. */
  private static describeBonded(
    view: RulesetView,
    master: DetailedCharacter,
    bonded: CharacterInput[],
    notes: PrivateNotes,
  ) {
    const byKind = new Map(bonded.map((input) => [input.record.kind, input]));
    const described: Record<string, BondedDescription> = {};
    for (const kind of BONDED_KIND_SLUGS) {
      const input = byKind.get(kind);
      if (input) {
        described[kind] = CharacterDescription.redactNotes(
          CharacterResponse.buildBonded(input.record, new Dnd35CharacterBuilder().build(view, input, { master })),
          notes,
        );
      }
    }
    return described;
  }

  /**
   * What a campaign member who only sees a character partly reads of it: who it is, its name and physical traits (race,
   * age, gender, height, weight), and nothing else. An allowlist: a new field of the full sheet, or of its identity, must
   * be considered here.
   */
  private static describePartial(view: RulesetView, character: CharacterInput) {
    const response = CharacterResponse.buildFull(character.record, new Dnd35CharacterBuilder().build(view, character));
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
      powers: [],
      virtualFeats: [],
      virtualPowers: [],
      aptitudes: {},
      spellTags: {},
      spellTagLists: {},
      requirements: {},
      modifiers: {},
      validation: { valid: true, issues: [] },
      bonded: CharacterDescription.noBonded(),
    } satisfies Record<keyof typeof response | "bonded", unknown>;
  }

  /** The bonded creatures of a sheet that shows none: a creature's own, or a partly seen character's. */
  private static noBonded(): Record<string, BondedDescription> {
    return {};
  }

  /**
   * An entry's private notes, as the viewer reads them: the entry itself when it reads them, else a copy with them blank
   * or left out, so the endpoint keeps its response shape without changing the cached sheet.
   */
  private static redactNotes<T extends { identity: { background: { privateNotes?: string } } }>(
    entry: T,
    notes: PrivateNotes,
  ) {
    if (notes === "show") return entry;
    const privateNotes = notes === "blank" ? "" : undefined;
    return { ...entry, identity: { ...entry.identity, background: { ...entry.identity.background, privateNotes } } };
  }

  /**
   * A character's sheet, as the API answers it: a player character's with its bonded creatures' (`bonded`), each built
   * with it, their private notes as the viewer reads them (`notes`); or a bonded creature's, from its master's, which
   * has no creatures of its own.
   */
  static describe(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    notes: PrivateNotes = "show",
  ) {
    const built = new Dnd35CharacterBuilder().build(view, character);
    if (character.master)
      return { ...CharacterResponse.buildBonded(character.record, built), bonded: CharacterDescription.noBonded() };
    const response = CharacterResponse.buildFull(character.record, built);
    return {
      ...CharacterDescription.redactNotes(response, notes),
      bonded: CharacterDescription.describeBonded(view, built, bonded, notes),
    };
  }

  /**
   * A character as a campaign member reads it (`reading`): partly, who it is and what it looks like (`describePartial`),
   * or its sheet, with its bonded creatures', their private notes shown or blank.
   */
  static describeForMember(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    reading: MemberReading,
  ) {
    if (reading === "partial") return CharacterDescription.describePartial(view, character);
    return CharacterDescription.describe(view, character, bonded, reading);
  }
}
