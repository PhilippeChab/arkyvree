import { Autocomplete, Box, Skeleton, Stack, TextField, Typography } from "@mui/material";

import { BlankState, ListToolbar, ScrollSafeListbox, Section, TagChip } from "@/client/src/components/common/index.ts";
import { RemoveSkillDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { useClassSkills, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ClassSectionProps } from "./types.ts";

export function ClassSkillsSection({ rulesetId, classId, ruleset }: ClassSectionProps) {
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const {
    classSkills,
    availableSkills,
    isLoading,
    isAvailableSkillsLoading,
    setSkillSearch,
    handleSkillsScroll,
    deleteDialogOpen,
    setDeleteDialogOpen,
    addSkillMutation,
    removeSkillMutation,
    handleAddSkill,
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
                      <Typography variant="body2" sx={{ fontWeight: "fontWeightMedium" }}>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {(option.description?.length ?? 0) > 60
                          ? `${option.description?.substring(0, 60)}...`
                          : (option.description ?? "")}
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
                  handleAddSkill(skill.id);
                  setSkillSearch("");
                }
              }}
              value={null}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Add Skill"
                  placeholder="Search and select a skill to add..."
                  size="small"
                />
              )}
              noOptionsText="No skills found"
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
        <Stack spacing={1}>
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} variant="rectangular" height={40} />
          ))}
        </Stack>
      ) : !classSkills || classSkills.length === 0 ? (
        <BlankState
          title="No class skills assigned"
          description={
            canEdit
              ? "Use the search box above to find and add skills to this class."
              : "This class doesn't have any skills assigned yet."
          }
        />
      ) : (
        <Section>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {classSkills.map((classSkill) => (
              <TagChip
                key={classSkill.skillId}
                tag={{
                  label: classSkill.skillsInRule.name,
                  color: "primary",
                  onDelete: canEdit ? () => handleRemoveSkill(classSkill.skillId) : undefined,
                }}
              />
            ))}
          </Stack>
        </Section>
      )}
      <RemoveSkillDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmRemoveSkill}
        isLoading={removeSkillMutation.isPending}
      />
    </Stack>
  );
}
