import { alpha, Avatar, Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { type DragEvent, useState } from "react";

import {
  CloudUploadOutlinedIcon,
  DeleteIcon,
  ImageOutlinedIcon,
  PhotoCameraOutlinedIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAttachment, useIsDemo } from "@/client/src/hooks/index.ts";
import type { AttachmentSlot } from "@/client/src/lib/queries.ts";
import { DURATION, transitionOf } from "@/client/src/theme/animations.ts";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/shared/attachments.ts";

import { CLICKABLE_SX, clickableProps } from "./clickable.ts";
import { DiceSpinner } from "./DiceSpinner.tsx";
import { useDetachAttachment } from "./useDetachAttachment.ts";
import { useDirectUpload } from "./useDirectUpload.ts";

interface AttachmentFieldProps extends AttachmentSlot {
  /** What the image is, a Title Case noun its controls name ("Upload Portrait") */
  label: string;
  /** Hide upload/delete controls — useful when viewing other users' content. */
  readOnly?: boolean;
  /** Pre-resolved URL for unauthenticated views (e.g. shared character page). Skips the GET and forces readOnly. */
  url?: string | null;
}

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");
const ACCEPTED_TYPES: readonly string[] = ALLOWED_IMAGE_TYPES;

/** The image's side, in pixels, a portrait's and an avatar's alike */
const DIMENSION = 140;

export function AttachmentField({ recordId, name, label, readOnly = false, url: urlOverride }: AttachmentFieldProps) {
  // A user's avatar is round, a character's portrait a framed picture
  const isAvatar = name === "avatar";
  const radius = isAvatar ? "50%" : 2;
  // The hidden file input, in state: the clickable box hands its click on to it
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const snackbar = useSnackbar();

  const sharedMode = urlOverride !== undefined;
  const isDemo = useIsDemo();
  const slot = { name, recordId };
  const attachmentQuery = useAttachment({ ...slot, enabled: !sharedMode });
  const upload = useDirectUpload(slot);
  const detach = useDetachAttachment(slot);

  const attachment = attachmentQuery.data;
  const url = sharedMode ? urlOverride : (attachment?.url ?? null);
  const busy = upload.isPending || detach.isPending;
  // Whether this viewer may upload at all; `interactive` also waits out a running upload.
  const canUpload = !sharedMode && !readOnly && !!recordId && !isDemo;
  const interactive = canUpload && !busy;

  function pick() {
    if (!interactive) return;
    fileInput?.click();
  }

  // The file's checked as it's picked, its type and its size, which the server refuses otherwise
  function handleFile(file: File | undefined) {
    if (!file || !interactive || !recordId) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      snackbar.warning(`Unsupported file type: ${file.type || "unknown"}`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      snackbar.warning(`File too large: the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`);
      return;
    }
    upload.mutate({ file, recordId });
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
      <Box sx={{ position: "relative" }}>
        <Box
          {...(interactive ? clickableProps(pick) : { tabIndex: -1 })}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          role={interactive ? "button" : undefined}
          aria-label={canUpload ? (url ? `Change ${label}` : `Upload ${label}`) : undefined}
          sx={[
            {
              ...CLICKABLE_SX,
              position: "relative",
              width: DIMENSION,
              height: DIMENSION,
              borderRadius: radius,
              overflow: "hidden",
              cursor: interactive && !url ? "pointer" : "default",
              bgcolor: url ? "transparent" : "action.hover",
              border: 2,
              borderStyle: canUpload ? "dashed" : "solid",
              borderColor: dragOver ? "primary.main" : url ? "transparent" : "divider",
              transition: transitionOf(["border-color", "transform"], DURATION.quick),
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
              <Avatar src={url} sx={{ width: DIMENSION, height: DIMENSION }} />
            ) : (
              <Box
                component="img"
                src={url}
                alt={label}
                sx={{ width: DIMENSION, height: DIMENSION, objectFit: "cover", display: "block" }}
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
                  <CloudUploadOutlinedIcon sx={{ fontSize: DIMENSION * 0.32 }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                    {dragOver ? "Drop to upload" : isAvatar ? "Add photo" : "Drop or click to upload"}
                  </Typography>
                </>
              ) : (
                <>
                  <ImageOutlinedIcon sx={{ fontSize: DIMENSION * 0.32 }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                    No {label.toLowerCase()}
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
              <PhotoCameraOutlinedIcon sx={{ fontSize: DIMENSION * 0.22 }} />
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
              <DiceSpinner />
            </Stack>
          )}
        </Box>

        {/* Always-visible camera button at bottom-right (touch-friendly). The tile above is the same
            control for keyboards and screen readers, so this one stays out of their way. */}
        {interactive && (
          <Tooltip title={url ? `Change ${label}` : `Upload ${label}`}>
            <IconButton
              aria-label={url ? `Change ${label}` : `Upload ${label}`}
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
          <Tooltip title={`Remove ${label}`}>
            <IconButton
              onClick={() => attachment && detach.mutate(attachment.id)}
              aria-label={`Remove ${label}`}
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
