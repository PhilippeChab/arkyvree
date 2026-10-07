import { Autocomplete, Box, Chip, Paper, Skeleton, Stack, TextField, Typography } from "@mui/material";

import { BlankState, LoadError, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { CloseIcon } from "@/client/src/components/icons/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { truncate } from "@/client/src/lib/truncate.ts";
import { RemoveSkillDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { useClassSkills, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ClassSectionProps } from "./types.ts";

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
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <Typography variant="h6" component="h2">
          Class Skills
        </Typography>
        {canEdit && (
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
                  handleAddSkill(skill.id);
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
        )}
      </Stack>
      {isLoading ? (
        <Stack spacing={1}>
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} variant="rectangular" height={40} />
          ))}
        </Stack>
      ) : error && !classSkills?.length ? (
        <LoadError what="Class skills" error={error} />
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
        <Paper sx={{ p: 2, boxShadow: 1, borderRadius: 2 }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {classSkills.map((classSkill) => (
              <Chip
                key={classSkill.skillId}
                label={classSkill.skillsInRule.name}
                variant="outlined"
                color="primary"
                deleteIcon={canEdit ? <CloseIcon /> : undefined}
                onDelete={canEdit ? () => handleRemoveSkill(classSkill.skillId) : undefined}
                sx={{
                  "& .MuiChip-deleteIcon": {
                    fontSize: "18px",
                  },
                }}
              />
            ))}
          </Stack>
        </Paper>
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
