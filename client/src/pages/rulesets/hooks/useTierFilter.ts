import { useRules, useSearchParam } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** A list's tier filter: the tier it shows, and the change that picks one ("" for all, where it offers them). */
interface TierFilter<L extends number | ""> {
  setTier: (next: number | "") => void;
  tier: L;
}

/**
 * A list's tier filter, kept in the URL (`tier`): one of its ruleset's tiers (`baseRules`, its rules' `tiers`:
 * 3.5's spell levels), or "" for all of them where the list offers `allowAll` (its first tier otherwise); an unknown
 * value reads as that default. While its rules load, any tier stands, so its list's first fetch is for the tier the
 * URL names.
 */
export function useTierFilter(baseRules: BaseRules, allowAll: true): TierFilter<number | "">;
export function useTierFilter(baseRules: BaseRules, allowAll: false): TierFilter<number>;
export function useTierFilter(baseRules: BaseRules, allowAll: boolean): TierFilter<number | ""> {
  const { value, setValue } = useSearchParam("tier");
  const { rules } = useRules(baseRules);
  // Its rules' first tier (3.5's cantrips, 0), whatever number it is
  const fallback: number | "" = allowAll ? "" : (rules?.tiers[0]?.tier ?? 0);
  const asked = Number(value);
  const known = rules
    ? oneOf(
        asked,
        rules.tiers.map((option) => option.tier),
      )
    : Number.isInteger(asked) && asked >= 0
      ? asked
      : undefined;
  const tier = value === "" ? fallback : (known ?? fallback);
  const setTier = (next: number | "") => setValue(next === fallback ? "" : String(next));
  return { setTier, tier };
}
