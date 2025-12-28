import React, { useMemo } from "react";

import { Button, Paper, Stack, Typography } from "@mui/material";

import { enableDemoMode } from "../demo";

export function LoginPage() {
  const loginUrl = useMemo(() => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return `/auth/discord?returnTo=${returnTo}`;
  }, []);

  const demoUrl = useMemo(() => "/?demo=1", []);

  return (
    <Stack
      sx={{
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Paper variant="outlined" sx={{ width: "min(520px, 100%)", p: 3, borderRadius: 4 }}>
        <Stack spacing={2}>
          <Stack spacing={0.75}>
            <Typography variant="h5" sx={{ fontWeight: 950 }}>
              Communiverse Bot Admin
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Login with Discord to manage your guild bot settings.
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
            <Button variant="contained" component="a" href={loginUrl} fullWidth>
              Login with Discord
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                enableDemoMode();
                window.location.href = demoUrl;
              }}
              fullWidth
            >
              Preview demo
            </Button>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            If you don’t see your guild, you likely need <code>Manage Server</code> (or be the owner).
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Demo mode uses local fake data (no OAuth, no Mongo). Disable with <code>?demo=0</code>.
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}
