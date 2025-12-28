import React, { useCallback, useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";

import { apiGet } from "../api";
import { Card, ErrorBanner, PageHeader } from "../components/ui";
import type { BotMetrics } from "../types";

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
    <div className="page">
      <PageHeader
        title="Metrics"
        subtitle="Bot counters and gauges (Plotly)"
        actions={
          <button className="button" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid2">
        <Card title="Counters">
          <Plot
            data={[{ type: "bar", x: counterPlot.x, y: counterPlot.y } as any]}
            layout={{ autosize: true, height: 360, margin: { l: 40, r: 20, t: 20, b: 110 } }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        </Card>

        <Card title="Gauges">
          <Plot
            data={[{ type: "bar", x: gaugePlot.x, y: gaugePlot.y } as any]}
            layout={{ autosize: true, height: 360, margin: { l: 40, r: 20, t: 20, b: 110 } }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        </Card>
      </div>
    </div>
  );
}

