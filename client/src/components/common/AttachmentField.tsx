import { alpha, Avatar, Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { useRef, useState } from "react";

import { DeleteIcon, ImageIcon, PhotoIcon, UploadIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAttachment, useDemoTimeRemaining, useDetachAttachment, useDirectUpload } from "@/client/src/hooks/index.ts";
import { DURATION, transitionOf } from "@/client/src/lib/animations.ts";
import { ALLOWED_IMAGE_TYPES } from "@/shared/attachments.ts";

import { DiceSpinner } from "./DiceSpinner.tsx";

interface AttachmentFieldProps {
  recordType: string;
  recordId: string | undefined;
  name: string;
  label?: string;
  variant?: "avatar" | "portrait";
  /** Pixel size of the displayed image. Defaults: 128 (avatar), 220 (portrait). */
  size?: number;
  /** Hide upload/delete controls — useful when viewing other users' content. */
  readOnly?: boolean;
  /** Show a white ring + drop shadow around the image — for hero/profile placements. */
  ring?: boolean;
  /** Pre-resolved URL for unauthenticated views (e.g. shared character page). Skips the GET and forces readOnly. */
  url?: string | null;
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
  const inputRef = useRef<HTMLInputElement | null>(null);
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
    inputRef.current?.click();
  }

  function handleFile(file: File | undefined) {
    if (!file || !interactive) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      snackbar.warning(`Unsupported file type: ${file.type || "unknown"}`);
      return;
    }
    upload.mutate(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function onDragOver(e: React.DragEvent) {
    if (!interactive) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start", width: "fit-content" }}>
      {label && (
        <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: "fontWeightBold" }}>
          {label}
        </Typography>
      )}

      <Box sx={{ position: "relative" }}>
        <Box
          onClick={interactive ? pick : undefined}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          role={interactive ? "button" : undefined}
          aria-label={canUpload ? (url ? `Change ${label ?? name}` : `Upload ${label ?? name}`) : undefined}
          tabIndex={interactive ? 0 : -1}
          onKeyDown={(e) => {
            if (!interactive) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick();
            }
          }}
          sx={{
            position: "relative",
            width: dimension,
            height: dimension,
            borderRadius: radius,
            overflow: "hidden",
            cursor: interactive && !url ? "pointer" : "default",
            bgcolor: url ? "transparent" : "action.hover",
            border: showRing ? 4 : 2,
            borderStyle: canUpload && !showRing ? "dashed" : "solid",
            borderColor: showRing ? "background.paper" : dragOver ? "primary.main" : url ? "transparent" : "divider",
            boxShadow: showRing ? 6 : 0,
            transition: transitionOf(["border-color", "transform", "box-shadow"], DURATION.fast),
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
            "&:hover .attachment-overlay": interactive && url ? { opacity: 1 } : {},
            // Keyboard a11y. Not :focus-within — that sticks after a click and
            // leaves the overlay visible after the user moves the mouse away.
            // Touch users have the always-visible camera + delete buttons.
            "&:focus-visible .attachment-overlay": interactive && url ? { opacity: 1 } : {},
          }}
        >
          {url ? (
            isAvatar ? (
              <Avatar src={url} sx={{ width: dimension, height: dimension }} />
            ) : (
              <Avatar variant="square" src={url} alt={label ?? name} sx={{ width: dimension, height: dimension }} />
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
                  <UploadIcon sx={{ fontSize: dimension * 0.32 }} />
                  <Typography variant="caption" sx={{ fontWeight: "fontWeightMedium" }}>
                    {dragOver ? "Drop to upload" : isAvatar ? "Add photo" : "Drop or click to upload"}
                  </Typography>
                </>
              ) : (
                <>
                  <ImageIcon sx={{ fontSize: dimension * 0.32 }} />
                  <Typography variant="caption" sx={{ fontWeight: "fontWeightMedium" }}>
                    No {label ?? name}
                  </Typography>
                </>
              )}
            </Stack>
          )}

          {/* Hover overlay over an existing image */}
          {url && interactive && (
            <Stack
              className="attachment-overlay"
              onClick={(e) => {
                e.stopPropagation();
                pick();
              }}
              spacing={0.5}
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
              <PhotoIcon sx={{ fontSize: dimension * 0.22 }} />
              <Typography variant="caption" sx={{ fontWeight: "fontWeightBold" }}>
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
              size="small"
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
              <PhotoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Quiet delete action — bottom-left corner of the image, only when there's an attachment */}
        {url && interactive && (
          <Tooltip title={`Remove ${label ?? name}`}>
            <IconButton
              size="small"
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
          ref={inputRef}
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
