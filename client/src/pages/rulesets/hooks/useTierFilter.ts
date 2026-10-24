import { useRules, useSearchParam } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** A list's tier filter: the level it shows, and the change that picks one ("" for all, where it offers them). */
interface TierFilter<L extends number | ""> {
  level: L;
  setLevel: (next: number | "") => void;
}

/**
 * A list's tier filter, kept in the URL (`level`): one of its ruleset's tiers' levels (`baseRules`, its rules'
 * `tiers`: 3.5's spell levels), or "" for all of them where the list offers `allowAll` (its first level otherwise); an
 * unknown value reads as that default. While its rules load, any level stands, so its list's first fetch is for the
 * level the URL names.
 */
export function useTierFilter(baseRules: BaseRules, allowAll: true): TierFilter<number | "">;
export function useTierFilter(baseRules: BaseRules, allowAll: false): TierFilter<number>;
export function useTierFilter(baseRules: BaseRules, allowAll: boolean): TierFilter<number | ""> {
  const fallback: number | "" = allowAll ? "" : 0;
  const { value, setValue } = useSearchParam("level");
  const { rules } = useRules(baseRules);
  const asked = Number(value);
  const known = rules
    ? oneOf(
        asked,
        rules.tiers.map((option) => option.level),
      )
    : Number.isInteger(asked) && asked >= 0
      ? asked
      : undefined;
  const level = value === "" ? fallback : (known ?? fallback);
  const setLevel = (next: number | "") => setValue(next === fallback ? "" : String(next));
  return { level, setLevel };
}
