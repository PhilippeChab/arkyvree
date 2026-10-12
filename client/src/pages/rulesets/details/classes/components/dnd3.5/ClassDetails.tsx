import { LoadError, ValueChip } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { formatDie } from "@/client/src/lib/formatNumeric.ts";
import { ClassFormFields } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { ClassDetailsProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";

/** A 3.5 class's details: its hit die, bonus spell ability and caster type, over its description; its form's fields. */
export function ClassDetails({ klass, rulesetId, edit }: ClassDetailsProps) {
  const { data: abilities, error: abilitiesError } = useRulesetAbilities(rulesetId);
  const bonusSpellAbility = abilities?.find((a) => a.id === klass.bonusSpellAbilityId);

  return (
    <EntityDetailsCard
      title="Class Details"
      description={klass.description}
      notice={!!abilitiesError && !abilities && <LoadError what="Abilities" error={abilitiesError} />}
      chips={
        <>
          <ValueChip label={formatDie(klass.hd)} />
          {bonusSpellAbility && <ValueChip label={`Bonus Spell Ability: ${bonusSpellAbility.name}`} color="info" />}
          {klass.casterType && <ValueChip label={`Caster Type: ${klass.casterType}`} color="info" />}
        </>
      }
      edit={
        edit && {
          fields: <ClassFormFields form={edit.form} rulesetId={rulesetId} />,
          onSubmit: edit.onSubmit,
          canSave: edit.canSave,
          isSaving: edit.isSaving,
        }
      }
    />
  );
}
