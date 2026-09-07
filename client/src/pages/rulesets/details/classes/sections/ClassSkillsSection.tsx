import { BlankState } from "@/client/src/components/common/index.ts";
import {
  RemoveSkillDialog,
} from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { useClassSkills, usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { Close as CloseIcon } from "@mui/icons-material";
import { Autocomplete, Box, Chip, Paper, Skeleton, TextField, Typography } from "@mui/material";
import type { InferResponseType } from "hono/client";

type ClassSkillsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["skills"]["$get"]
>;
type ClassSkillsArray = Exclude<ClassSkillsResponse, { error: string }>;
type ClassSkill = ClassSkillsArray[number];

interface ClassSkillsSectionProps {
  rulesetId: string;
  classId: string;
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
}

export function ClassSkillsSection({ rulesetId, classId, ruleset }: ClassSkillsSectionProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { canEdit } = usePermissions(ruleset, currentUserId);

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
  const unassignedSkills = availableSkills.filter(skill =>
    !classSkills?.some(cs => cs.skillId === skill.id)
  );

  return (
    <Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", mb: 2, gap: 2 }}>
        <Typography variant="h6">Class Skills</Typography>
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
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        {(option.description?.length ?? 0) > 60
                          ? `${option.description?.substring(0, 60)}...`
                          : option.description ?? ""
                        }
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
                  onScroll: handleSkillsScroll,
                  style: { maxHeight: 300 },
                }
              }}
            />
          </Box>
        )}
      </Box>
      {isLoading
        ? (
          <Box>
            {[...Array(3)].map((_, index) => (
              <Skeleton
                key={index}
                variant="rectangular"
                height={40}
                sx={{ mb: 1 }}
              />
            ))}
          </Box>
        )
        : !classSkills || classSkills.length === 0
        ? (
          <BlankState
            title="No class skills assigned"
            description={canEdit
              ? "Use the search box above to find and add skills to this class."
              : "This class doesn't have any skills assigned yet."}
          />
        )
        : (
          <Paper sx={{ p: 2, boxShadow: 1, borderRadius: 2 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {classSkills.map((classSkill: ClassSkill) => (
                <Chip
                  key={classSkill.skillId}
                  label={classSkill.skillsInRule.name}
                  variant="outlined"
                  color="primary"
                  deleteIcon={canEdit ? <CloseIcon /> : undefined}
                  onDelete={canEdit
                    ? () => handleRemoveSkill(classSkill.skillId)
                    : undefined
                  }
                  sx={{
                    "& .MuiChip-deleteIcon": {
                      fontSize: "18px",
                    },
                  }}
                />
              ))}
            </Box>
          </Paper>
        )}
      <RemoveSkillDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmRemoveSkill}
        isLoading={removeSkillMutation.isPending}
      />
    </Box>
  );
}