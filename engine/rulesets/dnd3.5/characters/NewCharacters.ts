import { z } from "zod";

import { Field } from "@/engine/core/fields/index.ts";
import type {
  CreationField,
  CreationMethod,
  FieldsPlan,
  FieldsRequest,
  ScoresCreation,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { MIN_ABILITY_SCORE, STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { CREATION_METHODS } from "@/vocabulary/dnd3.5/creation.ts";
import { CHARACTER_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

import CharacterValues from "./CharacterValues.ts";

/** What a new character's form reads of a ruleset's view: its abilities, each by its id and name. */
interface CreationData {
  abilities: readonly ScoresCreation["entities"][number][];
}

/** A field of a 3.5 character's, by its name among its declarations (`CHARACTER_FIELDS`). */
type FieldName = keyof typeof CHARACTER_FIELDS;

/** A 3.5 creation method, as its data writes it. */
type MethodData = (typeof CREATION_METHODS)[number];

/** The row's own column a new character's form sends among its fields, by its key: its description, a text or none. */
const OWN_REQUEST = z.object({ description: z.string().nullable().optional() });

/**
 * What a new 3.5 character's form offers: how its ability scores are set, their bounds and the one an unset ability
 * starts at, which the characters part checks a new character's scores and an ability edit's by.
 */
export default class NewCharacters {
  /** A creation method as a form runs it: a point buy's bounds are the scores its costs price. */
  private static methodOf(method: MethodData): CreationMethod {
    if (method.kind !== "pointBuy") return method;
    const priced = Object.keys(method.costs).map(Number);
    return { ...method, max: Math.max(...priced), min: Math.min(...priced) };
  }

  /**
   * A new character's fields (`given`, by the stored field that keeps each) as the character's codec reads them
   * (`CharacterValues.parseForm`), each it always holds given: refused as invalid otherwise, every field it leaves out
   * that it always holds (`<Label> is required`) with what the codec refuses.
   */
  private static parseGiven(view: RulesetView, given: FieldsRequest) {
    const missing = CharacterValues.held
      .filter((leaf) => given[leaf.field] === undefined)
      .map((leaf) => ({ category: `fields.${leaf.field}`, message: `${leaf.label} is required` }));
    try {
      const values = CharacterValues.parseForm(view, given);
      if (missing.length === 0) return values;
    } catch (error) {
      if (!(error instanceof RulesError) || missing.length === 0) throw error;
      throw new RulesError("invalid", error.message, [...missing, ...(error.issues ?? [])]);
    }
    throw new RulesError("invalid", "Request validation failed", missing);
  }

  /**
   * How a new character's ability scores are set: the ruleset's abilities (`view`'s), in the order its sheet lists
   * them, the SRD's methods, the scores' bounds and the one an unset ability shows, and each score's modifier over those
   * bounds, by the abilities' one formula.
   */
  static describeCreation(data: CreationData): ScoresCreation {
    const scores = { max: RULESET_LIMITS.abilityScore, min: MIN_ABILITY_SCORE, start: STARTING_ABILITY_SCORE };
    const modifiers = Object.fromEntries(
      Array.from({ length: scores.max - scores.min + 1 }, (_, index) => {
        const score = scores.min + index;
        return [score, AbilityRules.computeModifier(score)];
      }),
    );
    const abilities = data.abilities.map(({ id, name }) => ({ id, name }));
    return {
      entities: AbilityRules.orderAbilities(abilities, (ability) => ability.name),
      methods: CREATION_METHODS.map((method) => NewCharacters.methodOf(method)),
      modifiers,
      scores,
    };
  }

  /**
   * A character's field (`name`'s) as a new character's form shows it, keyed by its stored field, labeled and bounded
   * as it's declared (`CHARACTER_FIELDS`): one it always holds required (`CharacterValues.held`), a number starting at
   * its default, a text with its example; `shown`, what its form adds: a select that narrows its creation picks
   * (`narrows`), a number whose input's arrows stop at its least (`stepped`).
   */
  static describeField(name: FieldName, shown: { narrows?: true; stepped?: true } = {}): CreationField {
    const declared = CHARACTER_FIELDS[name];
    const { field: key, label } = declared;
    const required = CharacterValues.isHeld(key) ? { required: `${label} is required` } : {};
    if (declared.kind === "number") {
      const start = "default" in declared ? { start: declared.default } : {};
      const { min } = Field.boundsOf(declared);
      return { key, kind: "number", label, min, ...required, ...start, ...(shown.stepped && { stepped: true }) };
    }
    if ("values" in declared) {
      const options: readonly string[] = declared.values;
      return {
        key,
        kind: "select",
        label,
        options: [...options],
        ...required,
        ...(shown.narrows && { narrows: true }),
      };
    }
    return { key, kind: "text", label, ...("placeholder" in declared && { placeholder: declared.placeholder }) };
  }

  /**
   * What a new character's fields (`fields`, its form's, by the stored field that keeps each, and its description)
   * write, each read by the character's codec as an entity's form is (`CharacterValues.parseForm`): refused when one it
   * always holds is missing (`CharacterValues.held`), one names a field the character hasn't, or holds a value its
   * field doesn't take, each refused together. One left empty writes nothing: no value, no description.
   */
  static planFields(view: RulesetView, fields: FieldsRequest): FieldsPlan {
    const { description, ...given } = fields;
    const own = RulesError.parse(OWN_REQUEST, { description }, ["fields"]);
    const written = CharacterValues.writeOf(NewCharacters.parseGiven(view, given));
    const values = Object.fromEntries(Object.entries(written).filter(([, value]) => value !== null));
    return { fields: values, own: { ...(own.description && { description: own.description }) } };
  }
}
