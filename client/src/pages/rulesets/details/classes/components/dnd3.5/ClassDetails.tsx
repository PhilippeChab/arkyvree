import { ValueChip } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { formatDie } from "@/client/src/lib/formatNumeric.ts";
import { ClassFormFields } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { ClassDetailsProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";

import { ClassPropertySelects } from "./ClassPropertySelects.tsx";

/**
 * A 3.5 class's details: its hit die, bonus spell ability and caster type, over its description; for an editor, its
 * form's fields, then the bonus spell ability and caster type it sets in place.
 */
export function ClassDetails({ klass, classId, rulesetId, edit, followCopy, isFetching }: ClassDetailsProps) {
  const { data: abilities, error: abilitiesError } = useRulesetAbilities(rulesetId);
  const bonusSpellAbility = abilities?.find((a) => a.id === klass.bonusSpellAbilityId);

  return (
    <EntityDetailsCard
      title="Class Details"
      description={klass.description}
      chips={
        <>
          <ValueChip label={formatDie(klass.hd)} />
          {bonusSpellAbility && <ValueChip label={`Bonus Spell Ability: ${bonusSpellAbility.name}`} color="info" />}
          {klass.casterType && <ValueChip label={`Caster Type: ${klass.casterType}`} color="info" />}
        </>
      }
      edit={
        edit && {
          fields: (
            <>
              <ClassFormFields form={edit.form} />
              <ClassPropertySelects
                klass={klass}
                classId={classId}
                rulesetId={rulesetId}
                followCopy={followCopy}
                isFetching={isFetching}
                abilities={abilities}
                abilitiesError={abilitiesError}
              />
            </>
          ),
          onSubmit: edit.onSubmit,
          canSave: edit.canSave,
          isSaving: edit.isSaving,
        }
      }
    />
  );
}
