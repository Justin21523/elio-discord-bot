import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Card, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

import { apiGet } from "../api";
import { PageHeader } from "../components/PageHeader";
import type { LlamaHealth, LlamaSlots } from "../types";

export function LlmPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<LlamaHealth | null>(null);
  const [slots, setSlots] = useState<LlamaSlots | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        apiGet<LlamaHealth>("/api/bot/ai/llama/health"),
        apiGet<LlamaSlots>("/api/bot/ai/llama/slots"),
      ]);
      setHealth(h);
      setSlots(s);
    } catch (e) {
      setHealth(null);
      setSlots(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enabledChip = useMemo(() => {
    if (!health) return <Chip label="Unknown" variant="outlined" />;
    return health.enabled ? <Chip color="success" label="Enabled" variant="outlined" /> : <Chip color="warning" label="Disabled" variant="outlined" />;
  }, [health]);

  const healthChip = useMemo(() => {
    if (!health) return <Chip label="Unknown" variant="outlined" />;
    return health.health.ok ? <Chip color="success" label="OK" variant="outlined" /> : <Chip color="error" label={health.health.status || "Unhealthy"} variant="outlined" />;
  }, [health]);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="LLM (llama.cpp)"
        subtitle="Health and queue/slot info from the llama.cpp server"
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                  Status
                </Typography>

                <Stack direction="row" spacing={1} alignItems="center">
                  {enabledChip}
                  {healthChip}
                </Stack>

                <Stack spacing={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    Model
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {health?.health?.model || "—"}
                  </Typography>
                </Stack>

                <Stack spacing={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    Server
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {health?.serverUrl || "—"}
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                  Slots
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Raw response from <code>/slots</code> (if enabled by your llama.cpp server).
                </Typography>
                <pre style={{ margin: 0, padding: 12, borderRadius: 12, overflow: "auto", background: "rgba(2,6,23,0.9)", color: "#e8eefc", fontSize: 12 }}>
                  {JSON.stringify(slots?.slots ?? null, null, 2)}
                </pre>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

