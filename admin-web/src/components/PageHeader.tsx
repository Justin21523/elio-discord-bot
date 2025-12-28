import React from "react";

import { Box, Chip, Stack, Typography } from "@mui/material";

export type PageScope = "global" | "per-guild";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  scope?: PageScope;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 950, letterSpacing: -0.3 }}>
            {props.title}
          </Typography>
          {props.scope ? (
            <Chip
              size="small"
              label={props.scope === "global" ? "Global" : "Per-guild"}
              color={props.scope === "global" ? "warning" : "default"}
              variant="outlined"
            />
          ) : null}
          {props.badges}
        </Stack>
        {props.subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {props.subtitle}
          </Typography>
        ) : null}
      </Box>
      {props.actions ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
          {props.actions}
        </Stack>
      ) : null}
    </Stack>
  );
}

