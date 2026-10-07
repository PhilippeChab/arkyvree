import { alpha, Avatar, Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { type DragEvent, useState } from "react";

import {
  CloudUploadOutlinedIcon,
  DeleteIcon,
  ImageOutlinedIcon,
  PhotoCameraOutlinedIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAttachment, useDemoTimeRemaining, useDetachAttachment, useDirectUpload } from "@/client/src/hooks/index.ts";
import { DURATION, transitionOf } from "@/client/src/theme/animations.ts";
import { ALLOWED_IMAGE_TYPES } from "@/shared/attachments.ts";

import { CLICKABLE_SX, clickableProps } from "./clickable.ts";
import { DiceSpinner } from "./DiceSpinner.tsx";

interface AttachmentFieldProps {
  label?: string;
  name: string;
  /** Hide upload/delete controls — useful when viewing other users' content. */
  readOnly?: boolean;
  recordId: string | undefined;
  recordType: string;
  /** Show a white ring + drop shadow around the image — for hero/profile placements. */
  ring?: boolean;
  /** Pixel size of the displayed image. Defaults: 128 (avatar), 220 (portrait). */
  size?: number;
  /** Pre-resolved URL for unauthenticated views (e.g. shared character page). Skips the GET and forces readOnly. */
  url?: string | null;
  variant?: "avatar" | "portrait";
}

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");
const ACCEPTED_TYPES: readonly string[] = ALLOWED_IMAGE_TYPES;

export function AttachmentField({
  recordType,
  recordId,
  name,
  label,
  variant = "portrait",
  size,
  readOnly = false,
  ring = false,
  url: urlOverride,
}: AttachmentFieldProps) {
  const isAvatar = variant === "avatar";
  const dimension = size ?? (isAvatar ? 128 : 220);
  const radius = isAvatar ? "50%" : 2;
  // The hidden file input, in state: the clickable box hands its click on to it
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const snackbar = useSnackbar();

  const sharedMode = urlOverride !== undefined;
  const { isDemo } = useDemoTimeRemaining();
  const slot = { recordType, recordId, name };
  const attachmentQuery = useAttachment({ ...slot, enabled: !sharedMode });
  const upload = useDirectUpload(slot);
  const detach = useDetachAttachment(slot);

  const attachment = attachmentQuery.data;
  const url = sharedMode ? urlOverride : (attachment?.url ?? null);
  const busy = upload.isPending || detach.isPending;
  // Whether this viewer may upload at all; `interactive` also waits out a running upload.
  const canUpload = !sharedMode && !readOnly && !!recordId && !isDemo;
  const interactive = canUpload && !busy;
  const showRing = ring && !!url;

  function pick() {
    if (!interactive) return;
    fileInput?.click();
  }

  function handleFile(file: File | undefined) {
    if (!file || !interactive) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      snackbar.warning(`Unsupported file type: ${file.type || "unknown"}`);
      return;
    }
    upload.mutate(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function handleDragOver(e: DragEvent) {
    if (!interactive) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start", width: "fit-content" }}>
      {label && (
        <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 600, letterSpacing: 0.8 }}>
          {label}
        </Typography>
      )}

      <Box sx={{ position: "relative" }}>
        <Box
          {...(interactive ? clickableProps(pick) : { tabIndex: -1 })}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          role={interactive ? "button" : undefined}
          aria-label={canUpload ? (url ? `Change ${label ?? name}` : `Upload ${label ?? name}`) : undefined}
          sx={[
            {
              ...CLICKABLE_SX,
              position: "relative",
              width: dimension,
              height: dimension,
              borderRadius: radius,
              overflow: "hidden",
              cursor: interactive && !url ? "pointer" : "default",
              bgcolor: url ? "transparent" : "action.hover",
              border: showRing ? 4 : 2,
              borderStyle: !showRing && canUpload ? "dashed" : "solid",
              borderColor: showRing ? "background.paper" : dragOver ? "primary.main" : url ? "transparent" : "divider",
              boxShadow: (theme) => (showRing ? theme.boxShadows.attachmentRing : "none"),
              transition: transitionOf(["border-color", "transform", "box-shadow"], DURATION.quick),
              transform: dragOver ? "scale(1.02)" : "none",
              outline: "none",
              "&:focus-visible": {
                borderColor: "primary.main",
                borderStyle: "solid",
              },
              // Hover overlay only when image is present and interactive
              "& .attachment-overlay": {
                opacity: 0,
                transition: transitionOf(["opacity"], DURATION.fast),
              },
            },
            interactive &&
              !!url && {
                "&:hover .attachment-overlay": { opacity: 1 },
                // Keyboard a11y. Not :focus-within — that sticks after a click and
                // leaves the overlay visible after the user moves the mouse away.
                // Touch users have the always-visible camera + delete buttons.
                "&:focus-visible .attachment-overlay": { opacity: 1 },
              },
          ]}
        >
          {url ? (
            isAvatar ? (
              <Avatar src={url} sx={{ width: dimension, height: dimension }} />
            ) : (
              <Box
                component="img"
                src={url}
                alt={label ?? name}
                sx={{ width: dimension, height: dimension, objectFit: "cover", display: "block" }}
              />
            )
          ) : (
            <Stack
              spacing={0.5}
              sx={{
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                color: "text.secondary",
                p: 1,
                textAlign: "center",
              }}
            >
              {canUpload ? (
                <>
                  <CloudUploadOutlinedIcon sx={{ fontSize: dimension * 0.32 }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                    {dragOver ? "Drop to upload" : isAvatar ? "Add photo" : "Drop or click to upload"}
                  </Typography>
                </>
              ) : (
                <>
                  <ImageOutlinedIcon sx={{ fontSize: dimension * 0.32 }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                    No {label ?? name}
                  </Typography>
                </>
              )}
            </Stack>
          )}

          {/* Hover overlay over an existing image */}
          {url && interactive && (
            // A click on the overlay is the image's: it bubbles to it
            <Stack
              className="attachment-overlay"
              spacing={0.75}
              sx={{
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
                bgcolor: (theme) => alpha(theme.palette.common.black, 0.55),
                color: "common.white",
                cursor: "pointer",
              }}
            >
              <PhotoCameraOutlinedIcon sx={{ fontSize: dimension * 0.22 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                Change
              </Typography>
            </Stack>
          )}

          {/* Loading spinner — covers everything */}
          {busy && (
            <Stack
              direction="row"
              sx={{
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
                bgcolor: (theme) => alpha(theme.palette.common.black, 0.5),
              }}
            >
              <DiceSpinner size={dimension < 80 ? "small" : dimension < 160 ? "medium" : "large"} />
            </Stack>
          )}
        </Box>

        {/* Always-visible camera button at bottom-right (touch-friendly). The tile above is the same
            control for keyboards and screen readers, so this one stays out of their way. */}
        {interactive && (
          <Tooltip title={url ? `Change ${label ?? name}` : `Upload ${label ?? name}`}>
            <IconButton
              aria-label={url ? `Change ${label ?? name}` : `Upload ${label ?? name}`}
              onClick={pick}
              tabIndex={-1}
              aria-hidden
              sx={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                boxShadow: 2,
                border: 3,
                borderColor: "background.paper",
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              <PhotoCameraOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Quiet delete action — bottom-left corner of the image, only when there's an attachment */}
        {url && interactive && (
          <Tooltip title={`Remove ${label ?? name}`}>
            <IconButton
              onClick={() => attachment && detach.mutate(attachment.id)}
              aria-label={`Remove ${label ?? name}`}
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: 36,
                height: 36,
                bgcolor: "background.paper",
                color: "text.secondary",
                boxShadow: 2,
                border: 3,
                borderColor: "background.paper",
                "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!readOnly && (
        <input
          ref={setFileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so re-picking the same file fires onChange again.
            e.target.value = "";
            handleFile(file);
          }}
        />
      )}
    </Stack>
  );
}
