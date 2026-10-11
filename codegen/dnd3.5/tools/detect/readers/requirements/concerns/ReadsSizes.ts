import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { RACE_SIZE_PATH } from "@/codegen/dnd3.5/tools/terms/races.ts";
import { eqStr, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

/** The sizes, as a prerequisite names one. */
const SIZE_NAMES = SIZE_OPTIONS.join("|");

/** "Small or Medium size": either. */
const EITHER_SIZE = new RegExp(`\\b(${SIZE_NAMES})\\s+or\\s+(${SIZE_NAMES})\\s+size\\b`, "i");

/** "Small size": that size. */
const ONE_SIZE = new RegExp(`\\b(${SIZE_NAMES})\\s+size\\b`, "i");

/** "Medium or smaller size", "Large size or larger": that size or one smaller (larger). */
const SIZE_OR_BEYOND = new RegExp(
  `\\b(${SIZE_NAMES})(?:\\s+or\\s+(smaller|larger)\\s+size|\\s+size\\s+or\\s+(smaller|larger))\\b`,
  "i",
);

/** The size option a prerequisite's word names. */
function sizeOf(word: string): (typeof SIZE_OPTIONS)[number] {
  const size = SIZE_OPTIONS.find((option) => option.toLowerCase() === word.toLowerCase());
  if (!size) throw new Error(`"${word}" is no size`);
  return size;
}

/** Reading the size a prerequisite asks of the character's race. */
export function ReadsSizes<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingSizes extends Base {
    /**
     * The size `text` asks: either of two ("Small or Medium size"), one or any smaller or larger ("Medium or smaller
     * size", "Large size or larger"), or one ("Small size"); none when it names no size.
     */
    protected sizeRequirements(text: string): RequirementEntry[] {
      const either = EITHER_SIZE.exec(text);
      if (either) return [or(eqStr(RACE_SIZE_PATH, sizeOf(either[1])), eqStr(RACE_SIZE_PATH, sizeOf(either[2])))];

      const beyond = SIZE_OR_BEYOND.exec(text);
      if (beyond) {
        const index = SIZE_OPTIONS.indexOf(sizeOf(beyond[1]));
        const smaller = (beyond[2] ?? beyond[3]).toLowerCase() === "smaller";
        const sizes = smaller ? SIZE_OPTIONS.slice(0, index + 1) : SIZE_OPTIONS.slice(index);
        return [or(...sizes.map((size) => eqStr(RACE_SIZE_PATH, size)))];
      }

      const one = ONE_SIZE.exec(text);
      return one ? [eqStr(RACE_SIZE_PATH, sizeOf(one[1]))] : [];
    }
  }
  return ReadingSizes;
}
