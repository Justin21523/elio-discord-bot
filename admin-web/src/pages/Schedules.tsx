import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiDelete, apiGet, apiPost } from "../api";
import { Card, EmptyState, ErrorBanner, PageHeader, Tag } from "../components/ui";
import type { BotChannel, MeResponse, ScheduleRow } from "../types";

export function SchedulesPage(props: {
  me: MeResponse;
  selectedGuildId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);

  const [filter, setFilter] = useState("");

  const [kind, setKind] = useState("drop");
  const [hhmm, setHhmm] = useState("09:00");
  const [channelId, setChannelId] = useState("");
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(async () => {
    if (!props.selectedGuildId) return;
    setError(null);
    setLoading(true);
    try {
      const [schedules, guildChannels] = await Promise.all([
        apiGet<ScheduleRow[]>(`/api/guilds/${props.selectedGuildId}/schedules`),
        apiGet<BotChannel[]>(`/api/bot/discord/channels?guildId=${encodeURIComponent(props.selectedGuildId)}`),
      ]);
      setRows(schedules);
      setChannels(guildChannels);
      if (!channelId && guildChannels.length > 0) setChannelId(guildChannels[0]!.id);
    } catch (e) {
      setRows([]);
      setChannels([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [channelId, props.selectedGuildId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.kind.toLowerCase().includes(q) || r.hhmm.includes(q));
  }, [filter, rows]);

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of channels) m.set(c.id, c.name);
    return m;
  }, [channels]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!props.selectedGuildId) return;
    setError(null);
    try {
      await apiPost(`/api/guilds/${props.selectedGuildId}/schedules`, {
        kind,
        hhmm,
        channelId,
        enabled,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDisable(row: ScheduleRow) {
    if (!props.selectedGuildId) return;
    setError(null);
    try {
      await apiDelete(`/api/guilds/${props.selectedGuildId}/schedules/${encodeURIComponent(row.kind)}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Schedules"
        subtitle="Manage per-guild proactive schedules (stored in Mongo, applied to bot scheduler)"
        actions={
          <button className="button" type="button" onClick={refresh} disabled={!props.selectedGuildId || loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {!props.selectedGuildId ? (
        <Card>
          <EmptyState
            title="Select a guild first"
            detail="Schedules are per-guild. Use the Guild selector in the top bar."
          />
        </Card>
      ) : (
        <>
          {error ? <ErrorBanner message={error} /> : null}

          <div className="grid2">
            <Card title="Create / Update">
              <form className="formGrid" onSubmit={onCreate}>
                <label>
                  <div className="label">Kind</div>
                  <input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="drop" />
                </label>
                <label>
                  <div className="label">Time (HH:MM)</div>
                  <input value={hhmm} onChange={(e) => setHhmm(e.target.value)} placeholder="09:00" />
                </label>
                <label>
                  <div className="label">Channel</div>
                  <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                    <option value="">— Select —</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div className="label">Enabled</div>
                  <select value={enabled ? "yes" : "no"} onChange={(e) => setEnabled(e.target.value === "yes")}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <button className="button primary" type="submit">
                  Save
                </button>
              </form>
              <div className="muted" style={{ marginTop: 10 }}>
                Tip: saving triggers bot scheduler reload for this guild.
              </div>
            </Card>

            <Card title="Filter">
              <label>
                <div className="label">Search</div>
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="kind or HH:MM" />
              </label>
              <div className="muted" style={{ marginTop: 10 }}>
                Showing <span className="monospace">{filtered.length}</span> of{" "}
                <span className="monospace">{rows.length}</span>.
              </div>
            </Card>
          </div>

          <div style={{ marginTop: 12 }}>
            <Card title="Schedules">
              {filtered.length === 0 ? (
                <EmptyState title="No schedules" detail="Create one above to arm a proactive job." />
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Time</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th style={{ width: 120 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={`${r.guildId}_${r.kind}`}>
                          <td className="monospace">{r.kind}</td>
                          <td className="monospace">{r.hhmm}</td>
                          <td className="monospace">
                            {r.channelId}{" "}
                            <span className="muted">
                              {channelNameById.get(r.channelId) ? `(#${channelNameById.get(r.channelId)})` : ""}
                            </span>
                          </td>
                          <td>{r.enabled ? <Tag tone="good">Enabled</Tag> : <Tag tone="warn">Disabled</Tag>}</td>
                          <td>
                            <button
                              className="button danger"
                              type="button"
                              onClick={() => onDisable(r)}
                              disabled={!r.enabled}
                              title={!r.enabled ? "Already disabled" : undefined}
                            >
                              Disable
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

