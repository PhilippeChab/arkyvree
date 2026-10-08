import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";

import {
  BlankState,
  DiceSpinner,
  ListToolbar,
  LoadError,
  Panel,
  ScrollSafeListbox,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { SkillsIcon } from "@/client/src/components/icons/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { truncate } from "@/client/src/lib/truncate.ts";
import { RemoveSkillDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ClassSectionProps } from "./classSections.ts";
import { useClassSkills } from "./useClassSkills.ts";

export function ClassSkillsSection({ rulesetId, classId, ruleset }: ClassSectionProps) {
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const {
    classSkills,
    error,
    availableSkills,
    isLoading,
    isAvailableSkillsLoading,
    availableSkillsError,
    setSkillSearch,
    handleSkillsScroll,
    removeDialog,
    addSkillMutation,
    removeSkillMutation,
    handleRemoveSkill,
    confirmRemoveSkill,
  } = useClassSkills(rulesetId, classId);

  // Get skills that are not already assigned to this class
  const unassignedSkills = availableSkills.filter((skill) => !classSkills?.some((cs) => cs.skillId === skill.id));

  return (
    <Stack spacing={3}>
      {canEdit && (
        <ListToolbar>
          <Box sx={{ minWidth: { xs: "100%", sm: 300 } }}>
            <Autocomplete
              options={unassignedSkills}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, val) => option.id === val.id}
              filterOptions={(x) => x}
              renderOption={(props, option) => {
                const { key, ...otherProps } = props;
                return (
                  <Box component="li" key={key} {...otherProps}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {truncate(option.description ?? "", 60)}
                      </Typography>
                    </Box>
                  </Box>
                );
              }}
              loading={isAvailableSkillsLoading}
              disabled={addSkillMutation.isPending}
              onInputChange={(_, value, reason) => {
                if (reason === "input") setSkillSearch(value);
              }}
              onChange={(_, skill) => {
                if (skill) {
                  addSkillMutation.mutate(skill.id);
                  setSkillSearch("");
                }
              }}
              value={null}
              renderInput={(params) => (
                <TextField {...params} label="Add Skill" placeholder="Search and select a skill to add…" size="small" />
              )}
              noOptionsText={emptyOptionsText("Skills", availableSkillsError, "No skills found")}
              slotProps={{
                listbox: {
                  component: ScrollSafeListbox,
                  onScroll: handleSkillsScroll,
                },
              }}
            />
          </Box>
        </ListToolbar>
      )}
      {isLoading ? (
        <DiceSpinner sx={{ py: 4 }} />
      ) : error && !classSkills?.length ? (
        <LoadError what="Class skills" error={error} />
      ) : !classSkills || classSkills.length === 0 ? (
        <BlankState
          icon={SkillsIcon}
          title="No class skills assigned"
          description={
            canEdit
              ? "Use the search box above to find and add skills to this class."
              : "This class doesn't have any skills assigned yet."
          }
        />
      ) : (
        <Panel>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {classSkills.map((classSkill) => (
              <ValueChip
                key={classSkill.skillId}
                label={classSkill.skillsInRule.name}
                color="primary"
                onDelete={canEdit ? () => handleRemoveSkill(classSkill.skillId) : undefined}
              />
            ))}
          </Stack>
        </Panel>
      )}
      <RemoveSkillDialog
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={confirmRemoveSkill}
        isLoading={removeSkillMutation.isPending}
      />
    </Stack>
  );
}
