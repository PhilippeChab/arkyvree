import { MenuItem, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { Ability } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { propertiesQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import type { ClassDetailsProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import { classDetailQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { followCopiesOf } from "@/client/src/pages/rulesets/followCopies.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";
import {
  ENTITY_PROPERTY_TYPES,
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  PROPERTY_VALUES,
} from "@/vocabulary/dnd3.5/properties/index.ts";

interface ClassPropertySelectsProps extends Omit<ClassDetailsProps, "edit"> {
  /** The ruleset's abilities, the bonus spell ability's options */
  abilities: Ability[] | undefined;
  /** Why they didn't load */
  abilitiesError: unknown;
}

/** The caster types a class takes, its property's own options. */
const CASTER_TYPES = PROPERTY_VALUES[KLASS_CASTER_TYPE] ?? [];

/** What a class's properties are for, by their type. */
const CLASS_PROPERTY_HELP = ENTITY_PROPERTY_TYPES.klasses ?? {};

/** A property select's help: what the property is for, and that it saves as it's picked, apart from the card's Save. */
function propertyHelp(type: string) {
  return `${CLASS_PROPERTY_HELP[type]}. Saves as it's picked.`;
}

/**
 * A 3.5 class's bonus spell ability and caster type, which its page's editor sets in place: each a property of the
 * class, created, changed or cleared ("None") as it's picked, as the Properties tab would.
 */
export function ClassPropertySelects({
  klass,
  classId,
  rulesetId,
  followCopy,
  isFetching,
  abilities,
  abilitiesError,
}: ClassPropertySelectsProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  // A save of an inherited class copies it, and the page follows the copy of the class it was sent for
  const { tag, follow } = followCopiesOf(classId, followCopy);
  const bonusSpellAbility = abilities?.find((a) => a.id === klass.bonusSpellAbilityId);

  // Create, update or clear (empty value) the class's single property of a type, tagged with the class it was sent for
  const setPropertyFn = (type: string, propertyId: string | null | undefined, value: string) => {
    const param = { id: rulesetId, entityType: getUrlSegment("klasses"), entityId: klass.id };
    const endpoint = rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties;
    if (!propertyId) return tag(parseResponse(endpoint.$post({ param, json: { type, value } })));
    if (!value) return tag(parseResponse(endpoint[":propertyId"].$delete({ param: { ...param, propertyId } })));
    return tag(parseResponse(endpoint[":propertyId"].$put({ param: { ...param, propertyId }, json: { type, value } })));
  };

  // What the Properties tab's own saves refresh: its list, the class (whose fields read the properties) and Local Changes
  const handleSaved = (message: string) => (saved: { resolvedEntityId?: string; sourceEntityId: string }) => {
    invalidateRulesetEdit(queryClient, rulesetId, [
      propertiesQuery(rulesetId, "klasses", classId).queryKey,
      classDetailQuery(rulesetId, classId).queryKey,
      // A copy takes the class's place in the list
      QUERY_KEYS.rulesets.section(rulesetId, "classes"),
    ]);
    follow(saved);
    snackbar.success(message);
  };

  const bonusSpellMutation = useMutation({
    mutationFn: (value: string) =>
      setPropertyFn(KLASS_BONUS_SPELL_ABILITY_ID, klass.propertyIds.bonusSpellAbilityId, value),
    onSuccess: handleSaved("Bonus spell ability updated"),
    onError: (error) => snackbar.error(error, "Failed to update bonus spell ability"),
  });

  const casterTypeMutation = useMutation({
    mutationFn: (value: string) => setPropertyFn(KLASS_CASTER_TYPE, klass.propertyIds.casterType, value),
    onSuccess: handleSaved("Caster type updated"),
    onError: (error) => snackbar.error(error, "Failed to update caster type"),
  });

  return (
    <>
      <TextField
        label="Bonus Spell Ability"
        fullWidth
        select
        // Empty until the abilities load: a value with no option is out of range.
        value={bonusSpellAbility?.id ?? ""}
        onChange={(e) => bonusSpellMutation.mutate(e.target.value)}
        disabled={!abilities || bonusSpellMutation.isPending || isFetching}
        error={!!abilitiesError && !abilities}
        helperText={
          !abilities && abilitiesError
            ? loadFailureMessage("Abilities", abilitiesError)
            : propertyHelp(KLASS_BONUS_SPELL_ABILITY_ID)
        }
      >
        <MenuItem value="">None</MenuItem>
        {abilities?.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Caster Type"
        fullWidth
        select
        value={klass.casterType ?? ""}
        onChange={(e) => casterTypeMutation.mutate(e.target.value)}
        disabled={casterTypeMutation.isPending || isFetching}
        helperText={propertyHelp(KLASS_CASTER_TYPE)}
      >
        <MenuItem value="">None</MenuItem>
        {CASTER_TYPES.map((casterType) => (
          <MenuItem key={casterType} value={casterType}>
            {casterType}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}
