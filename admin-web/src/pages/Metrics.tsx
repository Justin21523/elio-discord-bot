import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Card, CardContent, Grid, Skeleton, Stack, Typography } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

import { apiGet } from "../api";
import { PageHeader } from "../components/PageHeader";
import type { BotMetrics } from "../types";

const LazyPlot = React.lazy(() => import("react-plotly.js"));

export function MetricsPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<BotMetrics | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiGet<BotMetrics>("/api/bot/metrics");
      setMetrics(data);
    } catch (e) {
      setMetrics(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counterPlot = useMemo(() => {
    const counters = metrics?.counters || {};
    const entries = Object.entries(counters)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 25);
    return { x: entries.map(([k]) => k), y: entries.map(([, v]) => v) };
  }, [metrics]);

  const gaugePlot = useMemo(() => {
    const gauges = metrics?.gauges || {};
    const entries = Object.entries(gauges)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 25);
    return { x: entries.map(([k]) => k), y: entries.map(([, v]) => v) };
  }, [metrics]);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Metrics"
        subtitle="Bot counters and gauges (Plotly)"
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
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Counters
                </Typography>
                <Suspense fallback={<Skeleton variant="rounded" height={360} />}>
                  <LazyPlot
                    data={[{ type: "bar", x: counterPlot.x, y: counterPlot.y } as any]}
                    layout={{ autosize: true, height: 360, margin: { l: 40, r: 20, t: 20, b: 110 } }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: "100%" }}
                  />
                </Suspense>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Gauges
                </Typography>
                <Suspense fallback={<Skeleton variant="rounded" height={360} />}>
                  <LazyPlot
                    data={[{ type: "bar", x: gaugePlot.x, y: gaugePlot.y } as any]}
                    layout={{ autosize: true, height: 360, margin: { l: 40, r: 20, t: 20, b: 110 } }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: "100%" }}
                  />
                </Suspense>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

