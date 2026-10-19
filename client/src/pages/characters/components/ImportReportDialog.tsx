import { Box, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

import { DialogFooter, Modal, SubsectionTitle } from "@/client/src/components/common/index.ts";
import type { CharacterImport } from "@/client/src/pages/characters/characterQueries.ts";

interface ImportReportDialogProps {
  /** What the import answered: the character it created, and its report. */
  imported: CharacterImport;
  onClose: () => void;
  /** It has faded out: its opener lets it go. */
  onExited: () => void;
  open: boolean;
}

interface ReportListProps {
  items: string[];
}

/** A list of what the report says, one line each. */
function ReportList({ items }: ReportListProps) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {items.map((item, index) => (
        <li key={index}>
          <Typography variant="body2">{item}</Typography>
        </li>
      ))}
    </Box>
  );
}

/**
 * What an import did, once it's in: what it imported, what the checks a level-up runs found of a level it saved anyway,
 * and every line of the file it couldn't match, with why, which the user adds in the app. Its action opens the
 * character.
 */
export function ImportReportDialog({ imported, open, onClose, onExited }: ImportReportDialogProps) {
  const navigate = useNavigate();
  const { character, report } = imported;
  // The file's lines it couldn't match: a line may hold several things it couldn't (two languages)
  const unmatched = new Set(report.unmatched.map(({ line }) => line)).size;

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" slotProps={{ transition: { onExited } }}>
      <DialogTitle>Import Report</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <DialogContentText>
            {`${character.name} was imported from ${report.program}. `}
            {unmatched > 0
              ? `${unmatched} line(s) of the file couldn't be matched: add what they hold in the app.`
              : "Every line of the file was matched."}
          </DialogContentText>
          {report.issues.length > 0 && (
            <Stack spacing={1}>
              <SubsectionTitle>Saved with Warnings</SubsectionTitle>
              <ReportList items={report.issues} />
            </Stack>
          )}
          {unmatched > 0 && (
            <Stack spacing={1}>
              <SubsectionTitle>Not Imported</SubsectionTitle>
              <Stack spacing={1}>
                {report.unmatched.map(({ line, reason, text }, index) => (
                  <Box key={`${line}-${index}`}>
                    <Typography variant="body2">{`Line ${line}: ${reason}`}</Typography>
                    <Typography
                      variant="caption"
                      component="p"
                      sx={{ color: "text.secondary", fontFamily: "monospace", overflowWrap: "anywhere" }}
                    >
                      {text}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>
          )}
          <Stack spacing={1}>
            <SubsectionTitle>Imported</SubsectionTitle>
            <ReportList items={report.imported} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogFooter
        onCancel={onClose}
        cancelLabel="Close"
        action={{
          label: "Open Character",
          onClick: () => {
            onClose();
            navigate(`/characters/${character.id}`);
          },
        }}
      />
    </Modal>
  );
}
