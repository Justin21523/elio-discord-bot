import React, { useEffect, useMemo, useState } from "react";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  phrase?: string;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog(props: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (props.open) setValue("");
  }, [props.open]);

  const canConfirm = useMemo(() => {
    if (props.busy) return false;
    if (!props.phrase) return true;
    return value.trim() === props.phrase;
  }, [props.busy, props.phrase, value]);

  return (
    <Dialog
      open={props.open}
      onClose={props.busy ? undefined : props.onCancel}
      fullWidth
      maxWidth="sm"
      aria-labelledby="confirm-dialog-title"
    >
      <DialogTitle id="confirm-dialog-title" sx={{ fontWeight: 950 }}>
        {props.title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {props.description ? (
            <Typography variant="body2" color="text.secondary">
              {props.description}
            </Typography>
          ) : null}

          {props.phrase ? (
            <TextField
              label={`Type ${props.phrase} to confirm`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={props.phrase}
              autoFocus
              fullWidth
              disabled={props.busy}
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={props.confirmTone === "danger" ? "error" : "primary"}
          onClick={props.onConfirm}
          disabled={!canConfirm}
        >
          {props.busy ? "Working…" : props.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
