import { useRef, useState } from "react";
import {
  Avatar,
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useAttachment, useDemoTimeRemaining, useDetachAttachment, useDirectUpload } from "@/client/src/hooks/index.ts";
import { ALLOWED_IMAGE_TYPES } from "@/shared/attachments.ts";

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
  const interactive = !sharedMode && !readOnly && !busy && !!recordId && !isDemo;
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
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", fontWeight: 600, letterSpacing: 0.8 }}
        >
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
          aria-label={url ? `Change ${label ?? name}` : `Upload ${label ?? name}`}
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
            border: showRing ? "4px solid" : "2px dashed",
            borderColor: showRing
              ? "background.paper"
              : dragOver
                ? "primary.main"
                : url
                  ? "transparent"
                  : "divider",
            boxShadow: showRing ? "0 6px 24px rgba(0,0,0,0.18)" : "none",
            transition: "border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease",
            transform: dragOver ? "scale(1.02)" : "none",
            outline: "none",
            "&:focus-visible": {
              borderColor: "primary.main",
              borderStyle: "solid",
            },
            // Hover overlay only when image is present and interactive
            "& .attachment-overlay": {
              opacity: 0,
              transition: "opacity 150ms ease",
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
            <Avatar
              src={url}
              sx={{ width: dimension, height: dimension }}
            />
          ) : (
            <Box
              component="img"
              src={url}
              alt={label ?? name}
              sx={{
                width: dimension,
                height: dimension,
                objectFit: "cover",
                display: "block",
              }}
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
            <CloudUploadOutlinedIcon sx={{ fontSize: dimension * 0.32 }} />
            <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
              {dragOver ? "Drop to upload" : isAvatar ? "Add photo" : "Drop or click to upload"}
            </Typography>
          </Stack>
        )}

        {/* Hover overlay over an existing image */}
        {url && interactive && (
          <Box
            className="attachment-overlay"
            onClick={(e) => {
              e.stopPropagation();
              pick();
            }}
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(0,0,0,0.55)",
              color: "common.white",
              cursor: "pointer",
              gap: 0.75,
              flexDirection: "column",
            }}
          >
            <PhotoCameraOutlinedIcon sx={{ fontSize: dimension * 0.22 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
              Change
            </Typography>
          </Box>
        )}

          {/* Loading spinner — covers everything */}
          {busy && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.5)",
              }}
            >
              <DiceSpinner size={dimension < 80 ? "small" : dimension < 160 ? "medium" : "large"} />
            </Box>
          )}
        </Box>

        {/* Always-visible camera button at bottom-right (touch-friendly) */}
        {interactive && (
          <Tooltip title={url ? `Change ${label ?? name}` : `Upload ${label ?? name}`}>
            <IconButton
              onClick={pick}
              aria-label={url ? `Change ${label ?? name}` : `Upload ${label ?? name}`}
              sx={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                boxShadow: 2,
                border: "3px solid",
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
              aria-label={`Delete ${label ?? name}`}
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: 36,
                height: 36,
                bgcolor: "background.paper",
                color: "text.secondary",
                boxShadow: 2,
                border: "3px solid",
                borderColor: "background.paper",
                "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
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
