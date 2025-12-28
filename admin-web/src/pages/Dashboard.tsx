import React, { useCallback, useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";

import { apiGet } from "../api";
import { Card, ErrorBanner, PageHeader, Tag } from "../components/ui";
import type { BotHealth, BotMetrics, LlamaHealth, MeResponse } from "../types";

export function DashboardPage(props: {
  me: MeResponse;
  selectedGuildId: string;
  navigate: (to: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [botHealth, setBotHealth] = useState<BotHealth | null>(null);
  const [botMetrics, setBotMetrics] = useState<BotMetrics | null>(null);
  const [llamaHealth, setLlamaHealth] = useState<LlamaHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [health, metrics, llama] = await Promise.all([
        apiGet<BotHealth>("/api/bot/health"),
        apiGet<BotMetrics>("/api/bot/metrics"),
        apiGet<LlamaHealth>("/api/bot/ai/llama/health"),
      ]);
      setBotHealth(health);
      setBotMetrics(metrics);
      setLlamaHealth(llama);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counterPlot = useMemo(() => {
    const counters = botMetrics?.counters || {};
    const entries = Object.entries(counters)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 15);
    return {
      x: entries.map(([k]) => k),
      y: entries.map(([, v]) => v),
    };
  }, [botMetrics]);

  const botReady = botHealth?.bot?.ready;
  const llamaOk = llamaHealth?.health?.ok;

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="System overview and quick status"
        actions={
          <div className="rowGap">
            {props.me.superAdmin ? (
              <button className="button" type="button" onClick={() => props.navigate("/runtime")}>
                Runtime
              </button>
            ) : null}
            <button className="button" type="button" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid2">
        <Card title="Bot">
          <div className="kv">
            <div className="kvRow">
              <div className="kvKey">Status</div>
              <div className="kvVal">
                {typeof botReady === "boolean" ? (
                  botReady ? (
                    <Tag tone="good">Ready</Tag>
                  ) : (
                    <Tag tone="bad">Not ready</Tag>
                  )
                ) : (
                  <Tag tone="neutral">Unknown</Tag>
                )}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvKey">User</div>
              <div className="kvVal monospace">{botHealth?.bot?.userTag || "—"}</div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Guilds</div>
              <div className="kvVal monospace">{botHealth?.bot?.guildCount ?? "—"}</div>
            </div>
          </div>
        </Card>

        <Card title="LLM (llama.cpp)">
          <div className="kv">
            <div className="kvRow">
              <div className="kvKey">Enabled</div>
              <div className="kvVal">
                {llamaHealth ? (
                  llamaHealth.enabled ? (
                    <Tag tone="good">Yes</Tag>
                  ) : (
                    <Tag tone="warn">No</Tag>
                  )
                ) : (
                  <Tag tone="neutral">Unknown</Tag>
                )}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Health</div>
              <div className="kvVal">
                {typeof llamaOk === "boolean" ? (
                  llamaOk ? (
                    <Tag tone="good">OK</Tag>
                  ) : (
                    <Tag tone="bad">{llamaHealth?.health?.status || "Unhealthy"}</Tag>
                  )
                ) : (
                  <Tag tone="neutral">Unknown</Tag>
                )}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Model</div>
              <div className="kvVal monospace">{llamaHealth?.health?.model || "—"}</div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Server</div>
              <div className="kvVal monospace">{llamaHealth?.serverUrl || "—"}</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="button" type="button" onClick={() => props.navigate("/llm")}>
              Open LLM page
            </button>
          </div>
        </Card>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <Card title="Top Metrics (counters)">
          <Plot
            data={[
              {
                type: "bar",
                x: counterPlot.x,
                y: counterPlot.y,
              } as any,
            ]}
            layout={{
              autosize: true,
              height: 340,
              margin: { l: 40, r: 20, t: 20, b: 90 },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        </Card>

        <Card title="Guild Shortcuts">
          <div className="kv">
            <div className="kvRow">
              <div className="kvKey">Selected</div>
              <div className="kvVal monospace">{props.selectedGuildId || "—"}</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }} className="rowGap">
            <button className="button" type="button" onClick={() => props.navigate("/guilds")}>
              Guilds
            </button>
            <button
              className="button"
              type="button"
              onClick={() => props.navigate("/schedules")}
              disabled={!props.selectedGuildId}
              title={!props.selectedGuildId ? "Select a guild first" : undefined}
            >
              Schedules
            </button>
            <button className="button" type="button" onClick={() => props.navigate("/audit")}>
              Audit Log
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

