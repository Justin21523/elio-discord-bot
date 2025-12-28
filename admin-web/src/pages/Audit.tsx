import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet } from "../api";
import { Card, EmptyState, ErrorBanner, PageHeader, Tag } from "../components/ui";
import type { AuditLogRow, AuditRisk, MeResponse } from "../types";

export function AuditPage(props: { me: MeResponse; selectedGuildId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLogRow[]>([]);

  const [guildId, setGuildId] = useState<string>("");
  const [risk, setRisk] = useState<"" | AuditRisk>("");
  const [ok, setOk] = useState<"" | "true" | "false">("");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    if (props.selectedGuildId) setGuildId(props.selectedGuildId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    if (guildId) p.set("guildId", guildId);
    if (risk) p.set("risk", risk);
    if (ok) p.set("ok", ok);
    if (action.trim()) p.set("action", action.trim());
    if (actorUserId.trim()) p.set("actorUserId", actorUserId.trim());
    return `/api/audit?${p.toString()}`;
  }, [action, actorUserId, guildId, limit, ok, risk]);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<AuditLogRow[]>(query);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="page">
      <PageHeader
        title="Audit Log"
        subtitle="State-changing operations and security events"
        actions={
          <button className="button" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid2">
        <Card title="Filters">
          <div className="formGrid2">
            <label>
              <div className="label">Guild</div>
              <select value={guildId} onChange={(e) => setGuildId(e.target.value)}>
                <option value="">All accessible</option>
                {props.me.guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="label">Risk</div>
              <select value={risk} onChange={(e) => setRisk(e.target.value as any)}>
                <option value="">Any</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>

            <label>
              <div className="label">OK</div>
              <select value={ok} onChange={(e) => setOk(e.target.value as any)}>
                <option value="">Any</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>

            <label>
              <div className="label">Limit</div>
              <input
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(200, Number.parseInt(e.target.value || "100", 10))))}
              />
            </label>

            <label>
              <div className="label">Action</div>
              <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="schedules.upsert" />
            </label>

            <label>
              <div className="label">Actor userId</div>
              <input value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="123…" />
            </label>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Query: <span className="monospace">{query}</span>
          </div>
        </Card>

        <Card title="Notes">
          <div className="muted">
            Critical actions are restricted to <code>super_admin</code> users and require CSRF protection.
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Events">
          {rows.length === 0 ? (
            <EmptyState title="No audit events" detail="Try widening the filters." />
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Risk</th>
                    <th>OK</th>
                    <th>Guild</th>
                    <th>Actor</th>
                    <th>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id || r.requestId}>
                      <td className="monospace">{new Date(r.ts).toLocaleString()}</td>
                      <td className="monospace">
                        <div>{r.action}</div>
                        <div className="muted monospace">{r.requestId}</div>
                      </td>
                      <td>
                        <Tag tone={riskTone(r.risk)}>{r.risk}</Tag>
                      </td>
                      <td>{r.ok ? <Tag tone="good">true</Tag> : <Tag tone="bad">false</Tag>}</td>
                      <td className="monospace">{r.guildId || "—"}</td>
                      <td className="monospace">
                        {r.actor.userId}
                        <div className="muted">
                          {r.actor.globalName || `${r.actor.username}#${r.actor.discriminator}`}
                        </div>
                      </td>
                      <td>
                        {r.meta ? (
                          <details>
                            <summary className="detailsSummary">view</summary>
                            <pre className="pre">{JSON.stringify(r.meta, null, 2)}</pre>
                          </details>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function riskTone(risk: AuditRisk): "neutral" | "good" | "warn" | "bad" {
  switch (risk) {
    case "low":
      return "neutral";
    case "medium":
      return "warn";
    case "high":
    case "critical":
      return "bad";
    default:
      return "neutral";
  }
}

