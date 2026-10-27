import { z } from "zod";

import { Field } from "@/engine/core/fields/index.ts";
import type {
  CreationField,
  CreationMethod,
  FieldsRequest,
  NewCharacterPlan,
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

/**
 * The fields a new character's form must give: those a character always holds (always written: its alignment, its
 * gender and its experience), each a field of its form its create refuses to leave out.
 */
const HELD = Field.storedLeavesOf(CHARACTER_FIELDS).filter((leaf) => "write" in leaf && leaf.write === "always");

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
   * as it's declared (`CHARACTER_FIELDS`): one it always holds required, a number starting at its default, a text with
   * its example; `shown`, what its form adds: a select that narrows its creation picks (`narrows`), a number whose
   * input's arrows stop at its least (`stepped`).
   */
  static describeField(name: FieldName, shown: { narrows?: true; stepped?: true } = {}): CreationField {
    const declared = CHARACTER_FIELDS[name];
    const { field: key, label } = declared;
    const required = "write" in declared ? { required: `${label} is required` } : {};
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
   * always holds is missing (`HELD`), one names a field the character hasn't, or holds a value its field doesn't take.
   * One left empty writes nothing: no value, no description.
   */
  static planFields(view: RulesetView, fields: FieldsRequest): Pick<NewCharacterPlan, "fields" | "own"> {
    const { description, ...given } = fields;
    const own = RulesError.parse(OWN_REQUEST, { description }, ["fields"]);
    const missing = HELD.filter((leaf) => given[leaf.field] === undefined);
    if (missing.length > 0) {
      const issues = missing.map((leaf) => ({
        category: `fields.${leaf.field}`,
        message: `${leaf.label} is required`,
      }));
      throw new RulesError("invalid", "Request validation failed", issues);
    }
    const written = CharacterValues.writeOf(CharacterValues.parseForm(view, given));
    const values = Object.fromEntries(Object.entries(written).filter(([, value]) => value !== null));
    return { fields: values, own: { ...(own.description && { description: own.description }) } };
  }
}
