import React from "react";

import { Box, Button, Paper, Stack, Typography } from "@mui/material";

export function EmptyState(props: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1.25}>
        <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
          {props.title}
        </Typography>
        {props.detail ? (
          <Typography variant="body2" color="text.secondary">
            {props.detail}
          </Typography>
        ) : null}
        {props.actionLabel && props.onAction ? (
          <Box sx={{ pt: 0.5 }}>
            <Button variant="contained" onClick={props.onAction}>
              {props.actionLabel}
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}

