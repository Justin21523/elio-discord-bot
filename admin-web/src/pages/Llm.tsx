import React, { useCallback, useEffect, useState } from "react";

import { apiGet } from "../api";
import { Card, ErrorBanner, PageHeader, Tag } from "../components/ui";
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

  return (
    <div className="page">
      <PageHeader
        title="LLM (llama.cpp)"
        subtitle="Health and queue/slot info from the llama.cpp server"
        actions={
          <button className="button" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid2">
        <Card title="Status">
          <div className="kv">
            <div className="kvRow">
              <div className="kvKey">Enabled</div>
              <div className="kvVal">
                {health ? (health.enabled ? <Tag tone="good">Yes</Tag> : <Tag tone="warn">No</Tag>) : <Tag tone="neutral">Unknown</Tag>}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Health</div>
              <div className="kvVal">
                {health ? (health.health.ok ? <Tag tone="good">OK</Tag> : <Tag tone="bad">{health.health.status || "Unhealthy"}</Tag>) : <Tag tone="neutral">Unknown</Tag>}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Model</div>
              <div className="kvVal monospace">{health?.health?.model || "—"}</div>
            </div>
            <div className="kvRow">
              <div className="kvKey">Server</div>
              <div className="kvVal monospace">{health?.serverUrl || "—"}</div>
            </div>
          </div>
        </Card>

        <Card title="Slots">
          <div className="muted" style={{ marginBottom: 10 }}>
            Raw response from <code>/slots</code> (if enabled by your llama.cpp server).
          </div>
          <pre className="pre">{JSON.stringify(slots?.slots ?? null, null, 2)}</pre>
        </Card>
      </div>
    </div>
  );
}

